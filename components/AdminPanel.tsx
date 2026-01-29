
import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, where, getDocs, increment, serverTimestamp, orderBy, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, PurchaseRequest } from '../types';

interface WithdrawalRequest {
  id: string;
  uid: string;
  userName: string;
  amount: number;
  method: 'Bkash' | 'Nagad';
  phone: string;
  status: 'pending' | 'completed' | 'rejected';
  timestamp: any;
}

const AdminPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'requests' | 'withdrawals' | 'users' | 'referrals'>('dashboard');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const FIXED_COMMISSION_PERCENT = 15;

  useEffect(() => {
    // Listen for users with document ID mapping
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile)));
    });
    
    // Listen for Recharge Requests
    const qReqs = query(collection(db, 'requests'), orderBy('timestamp', 'desc'));
    const unsubReqs = onSnapshot(qReqs, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseRequest)));
    });

    // Listen for Withdrawal Requests
    const qWithdraws = query(collection(db, 'withdrawals'), orderBy('timestamp', 'desc'));
    const unsubWithdraws = onSnapshot(qWithdraws, (snap) => {
      setWithdrawals(snap.docs.map(d => ({ id: d.id, ...d.data() } as WithdrawalRequest)));
    });

    return () => {
      unsubUsers();
      unsubReqs();
      unsubWithdraws();
    };
  }, []);

  const stats = useMemo(() => {
    const pendingReqs = requests.filter(r => r.status === 'pending');
    const pendingWithdraws = withdrawals.filter(w => w.status === 'pending');
    const approved = requests.filter(r => r.status === 'approved');
    const totalRevenue = approved.reduce((sum, r) => sum + r.amount, 0);
    const totalEarnedPaid = users.reduce((sum, u) => sum + (u.totalCommissionEarned || 0), 0);
    const totalWithdrawn = withdrawals.filter(w => w.status === 'completed').reduce((sum, w) => sum + w.amount, 0);
    const totalPendingCommission = users.reduce((sum, u) => sum + (u.pendingCommission || 0), 0);
    
    return { 
      totalRevenue, 
      totalEarnedPaid,
      totalPendingCommission,
      totalWithdrawn,
      netProfit: totalRevenue - totalEarnedPaid - totalPendingCommission,
      pendingRequestsCount: pendingReqs.length,
      pendingWithdrawalsCount: pendingWithdraws.length,
      totalUsers: users.length
    };
  }, [requests, users, withdrawals]);

  // Handle Withdrawal Confirmation ✅
  const approveWithdrawal = async (w: WithdrawalRequest) => {
    if (isProcessing) return;
    if (!confirm(`${w.userName} এর ${w.amount}৳ পেমেন্ট কি কনফার্ম করেছেন?`)) return;

    setIsProcessing(w.id);
    try {
      // 1. Update Withdrawal Status in withdrawals collection
      const withdrawRef = doc(db, 'withdrawals', w.id);
      await updateDoc(withdrawRef, {
        status: 'completed',
        confirmedAt: serverTimestamp()
      });

      // 2. Update User Document - Increase Total Earned
      const userRef = doc(db, 'users', w.uid);
      
      // We check if the user doc exists first to be safe
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        await updateDoc(userRef, {
          totalCommissionEarned: increment(w.amount)
        });
        alert("পেমেন্ট সফলভাবে কনফার্ম হয়েছে! ইউজারের 'Total Earned' আপডেট করা হয়েছে। ✅");
      } else {
        alert("ইউজার ডাটা খুঁজে পাওয়া যায়নি! কিন্তু উইথড্র স্ট্যাটাস আপডেট করা হয়েছে।");
      }
    } catch (err: any) {
      console.error("Confirmation Error:", err);
      alert("Error: " + err.message);
    } finally {
      setIsProcessing(null);
    }
  };

  // Handle Withdrawal Rejection (Refund) ❌
  const rejectWithdrawal = async (w: WithdrawalRequest) => {
    if (isProcessing) return;
    if (!confirm("আপনি কি এই রিকোয়েস্টটি বাতিল করতে চান? (টাকা ইউজারের ওয়ালেটে রিফান্ড হবে)")) return;

    setIsProcessing(w.id);
    try {
      // 1. Set status to rejected
      const withdrawRef = doc(db, 'withdrawals', w.id);
      await updateDoc(withdrawRef, { 
        status: 'rejected',
        rejectedAt: serverTimestamp()
      });

      // 2. Refund balance back to user's wallet
      const userRef = doc(db, 'users', w.uid);
      await updateDoc(userRef, {
        walletBalance: increment(w.amount)
      });
      alert("আবেদনটি বাতিল করা হয়েছে এবং ইউজারের ব্যালেন্স রিফান্ড করা হয়েছে।");
    } catch (e: any) {
      console.error("Rejection Error:", e);
      alert("Error: " + e.message);
    } finally {
      setIsProcessing(null);
    }
  };

  const approveRequest = async (req: PurchaseRequest) => {
    try {
      // 1. Add credits to the buyer
      await updateDoc(doc(db, 'users', req.uid), { credits: increment(req.credits), role: 'user' });
      
      // 2. Handle Referral Commission
      if (req.couponCode) {
        const refQuery = query(collection(db, 'users'), where('referralCode', '==', req.couponCode.toUpperCase()));
        const refSnap = await getDocs(refQuery);
        if (!refSnap.empty) {
          const referrerDoc = refSnap.docs[0];
          // Calculate 15% commission (or based on your package price)
          const commissionAmount = Math.floor(req.amount * (FIXED_COMMISSION_PERCENT / 100));
          
          await updateDoc(doc(db, 'users', referrerDoc.id), {
            pendingCommission: increment(commissionAmount),
            referralCount: increment(1)
          });
          console.log(`Commission of ${commissionAmount}৳ added to referrer ${referrerDoc.id}`);
        }
      }

      // 3. Mark request as approved
      await updateDoc(doc(db, 'requests', req.id), { status: 'approved', approvedAt: serverTimestamp() });
      alert('রিচার্জ সফল! ✅');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getTabLabel = (tab: string) => {
    switch (tab) {
      case 'dashboard': return 'ড্যাশবোর্ড';
      case 'requests': return 'রিচার্জ';
      case 'withdrawals': return 'উইথড্র';
      case 'users': return 'ইউজার';
      case 'referrals': return 'রেফারেল';
      default: return '';
    }
  };

  return (
    <div className="p-4 md:p-10 max-w-7xl mx-auto space-y-10 bg-slate-50 min-h-screen font-sans pb-32">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[4rem] shadow-2xl border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-3 h-full bg-indigo-600"></div>
        <div className="flex items-center space-x-5">
           <div className="w-16 h-16 bg-slate-900 rounded-[2rem] flex items-center justify-center text-3xl shadow-xl border-4 border-slate-50">🛡️</div>
           <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Maya Admin</h1>
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.4em] mt-1">Management Hub</p>
           </div>
        </div>
        
        <div className="flex bg-slate-100 p-2 rounded-[2.5rem] shadow-inner overflow-x-auto no-scrollbar max-w-full">
          {(['dashboard', 'requests', 'withdrawals', 'users', 'referrals'] as const).map(tab => {
            const hasNotification = (tab === 'requests' && stats.pendingRequestsCount > 0) || 
                                    (tab === 'withdrawals' && stats.pendingWithdrawalsCount > 0);
            const count = tab === 'requests' ? stats.pendingRequestsCount : stats.pendingWithdrawalsCount;

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap px-8 py-4 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.1em] transition-all relative flex items-center gap-2 ${activeTab === tab ? 'bg-white shadow-xl text-indigo-600 scale-105' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <span>{getTabLabel(tab)}</span>
                {hasNotification && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white animate-bounce shadow-lg ring-2 ring-white">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-in fade-in">
          <div className="bg-indigo-600 p-8 rounded-[3.5rem] text-white shadow-xl">
            <p className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-2">Total Revenue</p>
            <h3 className="text-4xl font-black tracking-tighter">{stats.totalRevenue.toFixed(0)}৳</h3>
          </div>
          <div className="bg-white p-8 rounded-[3.5rem] shadow-lg border border-slate-100">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Total Earned (Paid)</p>
            <h3 className="text-4xl font-black tracking-tighter text-emerald-500">{stats.totalEarnedPaid.toFixed(0)}৳</h3>
          </div>
          <div className="bg-white p-8 rounded-[3.5rem] shadow-lg border border-slate-100">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Total Withdrawn</p>
            <h3 className="text-4xl font-black tracking-tighter text-rose-500">{stats.totalWithdrawn.toFixed(0)}৳</h3>
          </div>
          <div className="bg-white p-8 rounded-[3.5rem] shadow-lg border-r-8 border-indigo-600">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Net Profit</p>
            <h3 className="text-4xl font-black tracking-tighter text-indigo-600">{stats.netProfit.toFixed(0)}৳</h3>
          </div>
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {requests.filter(r => r.status === 'pending').map(req => (
            <div key={req.id} className="bg-white p-10 rounded-[3.5rem] shadow-xl border border-slate-100 animate-in fade-in">
              <div className="flex justify-between items-start mb-6">
                <div>
                   <h4 className="font-black text-2xl text-slate-900 tracking-tighter">{req.userName}</h4>
                   <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{req.packageName}</p>
                </div>
                <div className="bg-indigo-600 text-white px-5 py-2 rounded-2xl font-black">{req.amount}৳</div>
              </div>
              <div className="bg-slate-50 p-6 rounded-[2rem] mb-8 space-y-2">
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">TRX ID:</p>
                 <p className="text-sm font-black text-slate-800 break-all">{req.transactionId}</p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => approveRequest(req)} className="flex-grow bg-indigo-600 text-white py-4 rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">Approve ✅</button>
                <button onClick={() => updateDoc(doc(db, 'requests', req.id), { status: 'rejected' })} className="px-5 text-slate-400 font-black uppercase text-[10px]">Reject</button>
              </div>
            </div>
          ))}
          {requests.filter(r => r.status === 'pending').length === 0 && (
            <div className="col-span-full py-20 text-center text-slate-400 font-black uppercase tracking-widest">No pending requests</div>
          )}
        </div>
      )}

      {activeTab === 'withdrawals' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in">
          {withdrawals.filter(w => w.status === 'pending').map(w => (
            <div key={w.id} className="bg-white p-10 rounded-[3.5rem] shadow-xl border-2 border-slate-50 flex flex-col group">
              <div className="flex justify-between items-start mb-6">
                 <div>
                    <h4 className="font-black text-2xl text-slate-900 tracking-tighter">{w.userName}</h4>
                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Withdrawal Request</span>
                 </div>
                 <div className="bg-rose-50 text-rose-600 px-5 py-2 rounded-2xl font-black text-xl">{w.amount}৳</div>
              </div>

              <div className="bg-slate-50 p-6 rounded-[2.5rem] mb-8 space-y-3">
                 <div className="flex justify-between items-center text-sm font-black">
                    <span className="text-slate-400 uppercase text-[10px]">Number:</span>
                    <span className="text-slate-800">{w.phone} ({w.method})</span>
                 </div>
              </div>

              <div className="mt-auto space-y-3">
                 <button 
                  disabled={!!isProcessing}
                  onClick={() => approveWithdrawal(w)}
                  className="w-full bg-slate-900 text-white py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center space-x-2"
                 >
                   {isProcessing === w.id ? 'Processing...' : 'Send Confirm ✅'}
                 </button>
                 <button 
                  disabled={!!isProcessing}
                  onClick={() => rejectWithdrawal(w)}
                  className="w-full text-slate-400 font-black text-[9px] uppercase tracking-widest py-2"
                 >
                   Reject Request
                 </button>
              </div>
            </div>
          ))}
          {withdrawals.filter(w => w.status === 'pending').length === 0 && (
             <div className="col-span-full py-32 text-center">
                <p className="text-slate-400 font-black uppercase tracking-widest">No pending withdrawals 🌸</p>
             </div>
          )}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-[4rem] shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                  <th className="px-10 py-8">User Name</th>
                  <th className="px-10 py-8">Wallet Balance</th>
                  <th className="px-10 py-8">Pending Commission</th>
                  <th className="px-10 py-8">Total Earned</th>
                  <th className="px-10 py-8">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => (
                  <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                    <td className="px-10 py-8 font-black text-slate-900">{u.displayName}</td>
                    <td className="px-10 py-8 font-black text-indigo-600">{Math.floor(u.walletBalance || 0)}৳</td>
                    <td className="px-10 py-8 font-black text-rose-500">{Math.floor(u.pendingCommission || 0)}৳</td>
                    <td className="px-10 py-8 font-black text-emerald-600">{Math.floor(u.totalCommissionEarned || 0)}৳</td>
                    <td className="px-10 py-8 font-black text-slate-400">{Math.floor(u.credits || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
