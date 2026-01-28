
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, getDoc, where, getDocs, increment, serverTimestamp, orderBy, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, PurchaseRequest } from '../types';

const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'requests' | 'users' | 'referrals'>('dashboard');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [showAddPartner, setShowAddPartner] = useState(false);

  // New Partner Form State
  const [newPartner, setNewPartner] = useState({
    name: '',
    email: '',
    code: '',
    discount: 10,
    commission: 15,
    method: 'Bkash' as 'Bkash' | 'Nagad',
    number: ''
  });

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ ...d.data() } as UserProfile)));
    });
    
    const qReqs = query(collection(db, 'requests'), orderBy('timestamp', 'desc'));
    const unsubReqs = onSnapshot(qReqs, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseRequest)));
    });

    return () => {
      unsubUsers();
      unsubReqs();
    };
  }, []);

  const stats = useMemo(() => {
    const approved = requests.filter(r => r.status === 'approved');
    const totalRevenue = approved.reduce((sum, r) => sum + r.amount, 0);
    const totalCommissionGiven = users.reduce((sum, u) => sum + (u.totalCommissionEarned || 0), 0);
    const netProfit = totalRevenue - totalCommissionGiven;
    const referredSalesCount = approved.filter(r => r.couponCode).length;

    return { 
      totalRevenue, 
      totalCommissionGiven, 
      netProfit, 
      pendingRequests: requests.filter(r => r.status === 'pending').length,
      referredSalesCount,
      totalUsers: users.length
    };
  }, [requests, users]);

  const activeReferrers = useMemo(() => {
    return users.filter(u => 
      (u.referralCount || 0) > 0 || 
      (u.pendingCommission || 0) > 0 || 
      (u.totalCommissionEarned || 0) > 0 ||
      u.customCommission !== undefined
    ).sort((a, b) => (b.pendingCommission || 0) - (a.pendingCommission || 0));
  }, [users]);

  // Function to calculate total amount paid by a specific user
  const getUserTotalPaid = (uid: string) => {
    return requests
      .filter(r => r.uid === uid && r.status === 'approved')
      .reduce((sum, r) => sum + r.amount, 0);
  };

  const approveRequest = async (req: PurchaseRequest) => {
    try {
      const userRef = doc(db, 'users', req.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) throw new Error('User record missing');

      await updateDoc(userRef, { 
        credits: increment(req.credits),
        role: 'user' 
      });
      
      if (req.couponCode) {
        const refQuery = query(collection(db, 'users'), where('referralCode', '==', req.couponCode));
        const refSnap = await getDocs(refQuery);
        if (!refSnap.empty) {
          const referrerDoc = refSnap.docs[0];
          const partnerData = referrerDoc.data() as UserProfile;
          const commissionRate = (partnerData.customCommission || 15) / 100;
          const commissionAmount = req.amount * commissionRate;
          
          await updateDoc(doc(db, 'users', referrerDoc.id), {
            pendingCommission: increment(commissionAmount),
            referralCount: increment(1)
          });
        }
      }

      await updateDoc(doc(db, 'requests', req.id), { 
        status: 'approved',
        approvedAt: serverTimestamp()
      });

      alert('পেমেন্ট সফলভাবে অ্যাপ্রুভ করা হয়েছে! ✅');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handlePayout = async (user: UserProfile) => {
    const amountToPay = user.pendingCommission || 0;
    if (amountToPay <= 0) return alert('কোনো পেন্ডিং কমিশন নেই।');

    if (!confirm(`${user.displayName} এর ${amountToPay}৳ কমিশন কি মেইন ওয়ালেটে পাঠাতে চান?`)) return;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        walletBalance: increment(amountToPay),
        pendingCommission: 0,
        totalCommissionEarned: increment(amountToPay)
      });
      alert(`সফলভাবে ${amountToPay}৳ ওয়ালেটে যোগ করা হয়েছে। 💸`);
    } catch (e) {
      alert('পেমেন্ট ট্রান্সফার করা যায়নি।');
    }
  };

  const createPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartner.name || !newPartner.code || !newPartner.number) return alert('সব তথ্য দিন।');

    try {
      const partnerId = `partner_${Date.now()}`;
      await setDoc(doc(db, 'users', partnerId), {
        uid: partnerId,
        displayName: newPartner.name,
        email: newPartner.email || `${newPartner.code.toLowerCase()}@partner.com`,
        referralCode: newPartner.code.toUpperCase(),
        customDiscount: newPartner.discount,
        customCommission: newPartner.commission,
        paymentMethod: newPartner.method,
        paymentNumber: newPartner.number,
        credits: 0,
        role: 'user',
        walletBalance: 0,
        pendingCommission: 0,
        totalCommissionEarned: 0,
        referralCount: 0,
        createdAt: serverTimestamp()
      });
      alert('নতুন পার্টনার সফলভাবে যুক্ত হয়েছে! 🎉');
      setShowAddPartner(false);
      setNewPartner({ name: '', email: '', code: '', discount: 10, commission: 15, method: 'Bkash', number: '' });
    } catch (e) {
      alert('পার্টনার যুক্ত করা যায়নি।');
    }
  };

  return (
    <div className="p-4 md:p-10 max-w-7xl mx-auto space-y-10 bg-slate-50 min-h-screen font-sans pb-32">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[4rem] shadow-2xl border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-3 h-full bg-indigo-600"></div>
        <div className="flex items-center space-x-5">
           <div className="w-16 h-16 bg-slate-900 rounded-[2rem] flex items-center justify-center text-3xl shadow-xl border-4 border-slate-50">🛡️</div>
           <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Maya Admin</h1>
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.4em] mt-1">Smart Engine Management</p>
           </div>
        </div>
        
        <div className="flex bg-slate-100 p-2 rounded-[2.5rem] shadow-inner overflow-x-auto no-scrollbar max-w-full">
          {(['dashboard', 'requests', 'users', 'referrals'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap px-8 py-4 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.1em] transition-all ${activeTab === tab ? 'bg-white shadow-xl text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {tab === 'dashboard' ? 'ড্যাশবোর্ড' : tab === 'requests' ? 'রিকোয়েস্ট' : tab === 'users' ? 'ইউজার' : 'স্মার্ট রেফারেল 🚀'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-in fade-in">
          <div className="bg-indigo-600 p-12 rounded-[4rem] text-white shadow-2xl">
            <p className="text-[11px] font-black uppercase tracking-widest opacity-50 mb-3">Revenue</p>
            <h3 className="text-6xl font-black tracking-tighter">{stats.totalRevenue.toFixed(0)}৳</h3>
          </div>
          <div className="bg-white p-12 rounded-[4rem] shadow-xl">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Commission Paid</p>
            <h3 className="text-6xl font-black tracking-tighter text-rose-500">-{stats.totalCommissionGiven.toFixed(0)}৳</h3>
          </div>
          <div className="bg-white p-12 rounded-[4rem] shadow-xl border-r-8 border-emerald-500">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Net Profit</p>
            <h3 className="text-6xl font-black tracking-tighter text-emerald-600">{stats.netProfit.toFixed(0)}৳</h3>
          </div>
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {requests.filter(r => r.status === 'pending').map(req => (
            <div key={req.id} className="bg-white p-10 rounded-[3.5rem] shadow-xl border border-slate-100">
              <div className="flex justify-between items-start mb-6">
                <h4 className="font-black text-2xl text-slate-900">{req.userName}</h4>
                <div className="bg-slate-950 text-white px-5 py-2 rounded-2xl font-black">{req.amount}৳</div>
              </div>
              <div className="bg-slate-50 p-6 rounded-[2rem] mb-8">
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">TRX: {req.transactionId}</p>
                 {req.couponCode && <p className="text-[10px] text-emerald-600 font-black uppercase mt-2">Used Code: {req.couponCode}</p>}
              </div>
              <div className="flex gap-4">
                <button onClick={() => approveRequest(req)} className="flex-grow bg-indigo-600 text-white py-4 rounded-3xl font-black uppercase text-[10px] tracking-widest">Approve</button>
                <button onClick={() => updateDoc(doc(db, 'requests', req.id), { status: 'rejected' })} className="px-6 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase text-[10px] tracking-widest">Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-[4rem] shadow-2xl overflow-hidden animate-in fade-in">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-950 text-slate-500 text-[11px] font-black uppercase tracking-[0.4em]">
                <th className="px-12 py-10">Member Profile</th>
                <th className="px-12 py-10">Live Credits Hub</th>
                <th className="px-12 py-10">Wallet Status</th>
                <th className="px-12 py-10">Total Paying Amount</th>
                <th className="px-12 py-10 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map(u => (
                <tr key={u.uid} className="hover:bg-slate-50/50 transition-all group">
                  <td className="px-12 py-10">
                    <p className="font-black text-slate-900 text-xl tracking-tighter">{u.displayName || 'Anonymous'}</p>
                    <p className="text-slate-400 text-xs font-bold">{u.email || 'No email'}</p>
                  </td>
                  <td className="px-12 py-10">
                    <div className="flex items-center space-x-3">
                      <span className="text-3xl font-black text-indigo-600">{u.credits?.toFixed(0) || 0}</span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Minutes</span>
                    </div>
                  </td>
                  <td className="px-12 py-10">
                    <p className="text-2xl font-black text-emerald-600">{u.walletBalance || 0}৳</p>
                  </td>
                  <td className="px-12 py-10">
                    <p className="text-2xl font-black text-indigo-900">{getUserTotalPaid(u.uid)}৳</p>
                  </td>
                  <td className="px-12 py-10 text-center">
                    <button 
                      onClick={() => handlePayout(u)} 
                      disabled={!(u.pendingCommission > 0)} 
                      className="bg-slate-900 text-white px-8 py-3.5 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest disabled:opacity-20 hover:bg-emerald-600 transition-all shadow-lg"
                    >
                      Payout
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'referrals' && (
        <div className="space-y-12 animate-in fade-in">
          
          <div className="bg-indigo-600 p-12 rounded-[4rem] text-white flex justify-between items-center shadow-2xl">
             <div>
                <h3 className="text-4xl font-black tracking-tighter mb-2 text-white">Smart Referral Hub 🚀</h3>
                <p className="text-indigo-200 font-bold">রেফারেল বোনাস ম্যানেজমেন্ট ও পেমেন্ট সেন্টার</p>
             </div>
             <button 
              onClick={() => setShowAddPartner(true)}
              className="bg-white text-indigo-600 px-10 py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-2xl active:scale-95 transition-all"
             >
               + New Partner
             </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {activeReferrers.map(u => (
              <div key={u.uid} className="bg-white p-12 rounded-[4.5rem] shadow-xl relative group overflow-hidden flex flex-col hover:shadow-2xl transition-all">
                <div className="flex items-center space-x-6 mb-12">
                  <div className="w-20 h-20 bg-slate-900 rounded-[2.5rem] flex items-center justify-center text-4xl shadow-xl border-4 border-slate-50">👤</div>
                  <div>
                    <h4 className="font-black text-3xl text-slate-900 tracking-tighter">{u.displayName}</h4>
                    <span className="bg-indigo-100 text-indigo-600 px-4 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest mt-2 inline-block">{u.referralCode}</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-[2rem] mb-6 space-y-2">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Partner Settings</p>
                   <div className="flex justify-between text-xs font-black">
                      <span className="text-emerald-600">Discount: {u.customDiscount || 10}%</span>
                      <span className="text-indigo-600">Comm: {u.customCommission || 15}%</span>
                   </div>
                   {u.paymentNumber && (
                     <div className="pt-2 mt-2 border-t border-slate-200">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{u.paymentMethod} Number</p>
                        <p className="text-sm font-black text-slate-800">{u.paymentNumber}</p>
                     </div>
                   )}
                </div>

                <div className="bg-rose-50 p-8 rounded-[3rem] border-2 border-dashed border-rose-100 flex flex-col items-center mb-8">
                   <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Unpaid Sale Balance</p>
                   <p className="text-5xl font-black text-rose-600">{u.pendingCommission || 0}৳</p>
                </div>

                <button 
                  onClick={() => handlePayout(u)}
                  disabled={!(u.pendingCommission > 0)}
                  className="w-full bg-slate-950 text-white py-6 rounded-[2.5rem] font-black text-sm uppercase tracking-widest shadow-2xl active:scale-95 disabled:opacity-20"
                >
                  Pay & Reset 💳
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Partner Modal */}
      {showAddPartner && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-[100] flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-[4rem] p-12 space-y-8 shadow-[0_50px_100px_rgba(0,0,0,0.4)] animate-in zoom-in">
            <div className="flex justify-between items-center">
               <h3 className="text-3xl font-black text-slate-900 tracking-tighter">নতুন পার্টনার যোগ করুন 🚀</h3>
               <button onClick={() => setShowAddPartner(false)} className="text-slate-400 hover:text-rose-500 font-bold">✕</button>
            </div>

            <form onSubmit={createPartner} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-4">নাম</label>
                  <input value={newPartner.name} onChange={e => setNewPartner({...newPartner, name: e.target.value})} className="w-full bg-slate-50 px-6 py-4 rounded-3xl font-bold outline-none border-2 border-transparent focus:border-indigo-200" placeholder="Rahim Ahmed" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-4">ইমেইল (Optional)</label>
                  <input value={newPartner.email} onChange={e => setNewPartner({...newPartner, email: e.target.value})} className="w-full bg-slate-50 px-6 py-4 rounded-3xl font-bold outline-none border-2 border-transparent focus:border-indigo-200" placeholder="rahim@gmail.com" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-4">কুপন কোড</label>
                  <input value={newPartner.code} onChange={e => setNewPartner({...newPartner, code: e.target.value})} className="w-full bg-slate-50 px-6 py-4 rounded-3xl font-black outline-none border-2 border-transparent focus:border-indigo-200 uppercase" placeholder="RAHIM10" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-4">ডিসকাউন্ট %</label>
                  <input type="number" value={newPartner.discount} onChange={e => setNewPartner({...newPartner, discount: Number(e.target.value)})} className="w-full bg-slate-50 px-6 py-4 rounded-3xl font-bold outline-none border-2 border-transparent focus:border-indigo-200" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-4">কমিশন %</label>
                  <input type="number" value={newPartner.commission} onChange={e => setNewPartner({...newPartner, commission: Number(e.target.value)})} className="w-full bg-slate-50 px-6 py-4 rounded-3xl font-bold outline-none border-2 border-transparent focus:border-indigo-200" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex space-x-2 bg-slate-100 p-1 rounded-2xl">
                   {(['Bkash', 'Nagad'] as const).map(m => (
                     <button key={m} type="button" onClick={() => setNewPartner({...newPartner, method: m})} className={`flex-grow py-3 rounded-xl font-black text-[10px] transition-all ${newPartner.method === m ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}>{m.toUpperCase()}</button>
                   ))}
                </div>
                <input value={newPartner.number} onChange={e => setNewPartner({...newPartner, number: e.target.value})} className="w-full bg-slate-50 px-6 py-4 rounded-3xl font-bold outline-none border-2 border-transparent focus:border-indigo-200" placeholder="01XXXXXXXXX" />
              </div>

              <button type="submit" className="w-full bg-indigo-600 text-white py-6 rounded-[2rem] font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all">সেভ পার্টনার প্রোফাইল</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
