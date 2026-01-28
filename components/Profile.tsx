
import React, { useState, useEffect } from 'react';
import { UserProfile, PurchaseRequest } from '../types';
import { doc, updateDoc, addDoc, collection, serverTimestamp, onSnapshot, query, where } from 'firebase/firestore';
import { db, auth } from '../firebase';

interface ProfileProps {
  user: UserProfile;
}

interface WithdrawalRequest {
  id: string;
  amount: number;
  status: 'pending' | 'completed' | 'rejected';
  timestamp: any;
}

const Profile: React.FC<ProfileProps> = ({ user }) => {
  const [copied, setCopied] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Bkash' | 'Nagad'>('Bkash');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [pendingRecharges, setPendingRecharges] = useState<PurchaseRequest[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WithdrawalRequest[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Listen for pending recharge requests to show in user profile
    const qRecharge = query(
      collection(db, 'requests'),
      where('uid', '==', auth.currentUser.uid),
      where('status', '==', 'pending')
    );
    const unsubRecharge = onSnapshot(qRecharge, (snap) => {
      setPendingRecharges(snap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseRequest)));
    });

    // Listen for pending withdrawal requests
    const qWithdraw = query(
      collection(db, 'withdrawals'),
      where('uid', '==', auth.currentUser.uid),
      where('status', '==', 'pending')
    );
    const unsubWithdraw = onSnapshot(qWithdraw, (snap) => {
      setPendingWithdrawals(snap.docs.map(d => ({ id: d.id, ...d.data() } as WithdrawalRequest)));
    });

    return () => {
      unsubRecharge();
      unsubWithdraw();
    };
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWithdraw = async () => {
    const amount = Number(withdrawAmount);
    if (!amount || amount < 500) {
      alert('ন্যূনতম ৫০০৳ উইথড্র করতে হবে।');
      return;
    }
    if (!phoneNumber || phoneNumber.length < 11) {
      alert('সঠিক নাম্বার দিন।');
      return;
    }
    if (amount > user.walletBalance) {
      alert('পর্যাপ্ত ব্যালেন্স নেই।');
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'withdrawals'), {
        uid: user.uid,
        userName: user.displayName,
        amount: amount,
        method: paymentMethod,
        phone: phoneNumber,
        status: 'pending',
        timestamp: serverTimestamp()
      });
      // Admin will handle the actual verification and deduction
      alert('উইথড্র আবেদন সফল হয়েছে! অ্যাডমিন যাচাই করে আপনার পেমেন্ট পাঠিয়ে দিবে।');
      setShowWithdraw(false);
    } catch (e) {
      alert('আবেদন ব্যর্থ হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  const getAccountBadge = (credits: number) => {
    if (credits > 1000) return { name: 'Gold Student', emoji: '🏆', color: 'from-amber-400 to-yellow-600' };
    if (credits > 500) return { name: 'Silver Scholar', emoji: '🥈', color: 'from-gray-300 to-slate-500' };
    return { name: 'Active Learner', emoji: '🌱', color: 'from-pink-500 to-rose-600' };
  };

  const badge = getAccountBadge(user.credits);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-10 duration-700 pb-20">
      
      {/* 3D Visual Profile Header */}
      <div className="relative group perspective-1000">
        <div className="absolute inset-0 bg-white rounded-[3.5rem] shadow-2xl neo-shadow opacity-50 transform group-hover:rotate-1 transition-transform duration-500"></div>
        <div className="relative glass-depth p-10 rounded-[3.5rem] border border-white flex flex-col items-center">
          <div className="relative mb-6">
             <div className={`w-36 h-36 bg-gradient-to-tr ${badge.color} rounded-[3rem] flex items-center justify-center text-7xl shadow-2xl ring-8 ring-pink-50 group-hover:rotate-6 transition-transform duration-500 animate-float border-4 border-white`}>
               👧
             </div>
             <div className="absolute -bottom-2 -right-2 bg-indigo-600 border-4 border-white rounded-2xl p-2 text-white shadow-lg animate-bounce">
                {badge.emoji}
             </div>
          </div>

          <div className="text-center">
            <h3 className="text-4xl font-black text-gray-800 tracking-tighter">{user.displayName || 'Friend'}</h3>
            <p className={`mt-2 inline-block px-6 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-white bg-gradient-to-r ${badge.color} shadow-lg`}>
              {badge.name}
            </p>
          </div>
          
          <div className="mt-10 grid grid-cols-2 gap-5 w-full">
             <div className="glass-depth p-5 rounded-[2.5rem] text-center neo-inset border-white/40">
               <p className="text-[10px] text-gray-400 font-black uppercase mb-1 tracking-widest">ব্যালেন্স</p>
               <p className="text-2xl font-black text-pink-600">{user.walletBalance || 0}৳</p>
             </div>
             <div className="glass-depth p-5 rounded-[2.5rem] text-center neo-inset border-white/40">
               <p className="text-[10px] text-gray-400 font-black uppercase mb-1 tracking-widest">মিনিট বাকি</p>
               <p className="text-2xl font-black text-blue-600">{user.credits || 0}</p>
             </div>
          </div>
        </div>
      </div>

      {/* Smart Activity & Status Tracker */}
      {(pendingRecharges.length > 0 || pendingWithdrawals.length > 0) && (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-4">
             <h4 className="text-xl font-black text-gray-800 tracking-tight">অ্যাক্টিভিটি স্ট্যাটাস</h4>
             <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse shadow-[0_0_8px_#facc15]"></span>
          </div>
          <div className="space-y-3">
            {pendingRecharges.map(req => (
              <div key={req.id} className="glass-depth p-6 rounded-[2.5rem] border-l-[6px] border-pink-500 flex justify-between items-center bg-white/40 animate-in slide-in-from-right-4">
                <div>
                  <p className="font-black text-gray-800 leading-none mb-1">রিচার্জ: {req.packageName}</p>
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Transaction ID: {req.transactionId}</p>
                </div>
                <div className="text-right">
                  <p className="text-pink-600 font-black text-lg">+{req.credits} Min</p>
                  <div className="flex items-center justify-end space-x-1">
                     <span className="text-[9px] font-black text-yellow-600 uppercase tracking-tighter">অপেক্ষমাণ</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Futuristic Wallet Hub */}
      <div className="relative group">
        <div className="absolute inset-0 bg-gray-900 rounded-[3.5rem] blur-2xl opacity-10"></div>
        <div className="relative bg-gray-950 p-10 rounded-[3.5rem] text-white shadow-2xl overflow-hidden border border-white/5">
          <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
          
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-10">
              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] mb-2">Smart Wallet</p>
                <div className="flex items-baseline">
                  <h4 className="text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-500">{user.walletBalance || 0}</h4>
                  <span className="text-2xl ml-3 text-pink-500 font-black">৳</span>
                </div>
              </div>
              <div className="bg-white/5 p-4 rounded-3xl backdrop-blur-md border border-white/10 animate-float">
                 <svg className="w-8 h-8 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" /></svg>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-5">
               <button 
                onClick={() => setShowWithdraw(true)}
                className="bg-white text-gray-950 py-5 rounded-[2.2rem] font-black text-xs active:scale-95 transition-all shadow-xl hover:bg-gray-100 uppercase tracking-widest"
               >
                 Withdraw
               </button>
               <button className="glass-depth bg-white/5 hover:bg-white/10 text-white border-white/10 py-5 rounded-[2.2rem] font-black text-xs active:scale-95 transition-all uppercase tracking-widest">Payout History</button>
            </div>
          </div>
        </div>
      </div>

      {/* Auto Referral Coupon System */}
      <div className="relative group overflow-hidden glass-depth p-10 rounded-[3.5rem] border border-pink-100 shadow-2xl bg-white/80">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-pink-100 rounded-full blur-[80px] opacity-40"></div>
        <div className="flex justify-between items-start mb-8">
          <div>
            <h4 className="text-3xl font-black text-gray-800 tracking-tighter">আপনার কুপন কোড 🎁</h4>
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mt-1">ইনভাইট করুন এবং ১৫% ক্যাশব্যাক পান</p>
          </div>
          <div className="bg-green-50 text-green-600 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">Active</div>
        </div>

        <div className="bg-gray-50 neo-inset rounded-[2.5rem] p-4 flex flex-col space-y-4">
          <div className="flex items-center justify-between px-8 py-6 rounded-[2rem] bg-white border border-pink-100 shadow-sm group">
            <span className="font-mono font-black text-3xl text-pink-600 tracking-[0.2em]">{user.referralCode}</span>
            <button 
              onClick={() => copyToClipboard(user.referralCode)}
              className="bg-pink-500 text-white px-8 py-3 rounded-2xl text-[10px] font-black shadow-lg active:scale-95 transition-all hover:bg-pink-600 uppercase tracking-widest"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <div className="mt-8 flex items-center justify-center space-x-3 opacity-50">
           <div className="w-10 h-px bg-gray-200"></div>
           <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.3em]">Smart Referral System</span>
           <div className="w-10 h-px bg-gray-200"></div>
        </div>
      </div>

      {/* Withdrawal Dialog */}
      {showWithdraw && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-2xl z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-[3.5rem] p-10 space-y-8 shadow-[0_50px_100px_rgba(0,0,0,0.4)] border border-gray-100 animate-in zoom-in">
            <div className="flex justify-between items-center">
               <h4 className="text-3xl font-black text-gray-800 tracking-tighter">উইথড্র রিকোয়েস্ট 💰</h4>
               <button onClick={() => setShowWithdraw(false)} className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors">✕</button>
            </div>
            
            <div className="space-y-6">
              <div className="flex space-x-2 bg-gray-50 p-1 rounded-2xl">
                {(['Bkash', 'Nagad'] as const).map(m => (
                  <button 
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`flex-grow py-3 rounded-xl font-black text-xs transition-all ${paymentMethod === m ? 'bg-white shadow-md text-pink-600' : 'text-gray-400'}`}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-2 tracking-widest">পরিমাণ (Amount)</label>
                <div className="relative">
                  <input 
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="৫০০"
                    className="w-full bg-pink-50/50 p-5 rounded-3xl font-black text-3xl text-pink-600 outline-none border-2 border-transparent focus:border-pink-200 transition-all shadow-inner"
                  />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-pink-300 text-2xl">৳</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-2 tracking-widest">নাম্বার (Recipient)</label>
                <input 
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full bg-gray-50 p-5 rounded-3xl font-black text-lg text-gray-800 outline-none border-2 border-transparent focus:border-indigo-100 transition-all shadow-inner"
                />
              </div>
            </div>

            <button 
              disabled={loading}
              onClick={handleWithdraw}
              className="w-full bg-gradient-to-r from-gray-900 to-black text-white py-6 rounded-[2rem] font-black text-lg shadow-2xl active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50"
            >
              {loading ? 'প্রসেসিং হচ্ছে...' : 'সাবমিট করুন'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
