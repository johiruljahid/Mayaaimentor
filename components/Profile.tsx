
import React, { useState, useEffect } from 'react';
import { UserProfile, PurchaseRequest } from '../types';
import { doc, updateDoc, addDoc, collection, serverTimestamp, onSnapshot, query, where, increment, runTransaction } from 'firebase/firestore';
import { db, auth } from '../firebase';

interface ProfileProps {
  user: UserProfile;
}

interface WithdrawalRequest {
  id: string;
  amount: number;
  status: 'pending' | 'completed' | 'rejected';
  timestamp: any;
  method?: string;
}

const Profile: React.FC<ProfileProps> = ({ user }) => {
  const [copied, setCopied] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Bkash' | 'Nagad'>('Bkash');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WithdrawalRequest[]>([]);

  useEffect(() => {
    const checkRefCode = async () => {
      if (!user.referralCode && auth.currentUser) {
        const cleanName = (user.displayName || 'MAYA').replace(/\s+/g, '').substring(0, 3).toUpperCase();
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const newCode = `${cleanName}${randomNum}`;
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { referralCode: newCode });
      }
    };
    checkRefCode();

    if (!auth.currentUser) return;

    const qWithdraw = query(
      collection(db, 'withdrawals'),
      where('uid', '==', auth.currentUser.uid),
      where('status', 'in', ['pending', 'completed']) 
    );
    const unsubWithdraw = onSnapshot(qWithdraw, (snap) => {
      setPendingWithdrawals(snap.docs.map(d => ({ id: d.id, ...d.data() } as WithdrawalRequest))
        .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
        .slice(0, 3) 
      );
    });

    return () => unsubWithdraw();
  }, [user.uid]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClaimCommission = async () => {
    if (isClaiming) return;
    setIsClaiming(true);
    const userRef = doc(db, 'users', user.uid);

    try {
      const movedAmount = await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw "User data not found!";
        const data = userDoc.data() as UserProfile;
        const pending = Math.floor(data.pendingCommission || 0);
        if (pending <= 0) throw "No commission to move.";

        transaction.update(userRef, {
          walletBalance: increment(pending),
          pendingCommission: 0
        });
        return pending;
      });
      alert(`সফলভাবে ${movedAmount}৳ স্মার্ট ওয়ালেটে যোগ হয়েছে! ✨`);
    } catch (err: any) {
      alert(typeof err === 'string' ? err : "কমিশন মুভ করতে সমস্যা হয়েছে।");
    } finally {
      setIsClaiming(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = Math.floor(Number(withdrawAmount));
    if (!amount || amount < 10) {
      alert('ন্যূনতম ১০৳ উইথড্র করা যাবে।');
      return;
    }
    if (!phoneNumber || phoneNumber.length < 11) {
      alert('সঠিক নাম্বার দিন।');
      return;
    }
    if (amount > user.walletBalance) {
      alert('ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই।');
      return;
    }

    setLoading(true);
    try {
      // 1. Create Withdrawal Request
      await addDoc(collection(db, 'withdrawals'), {
        uid: user.uid,
        userName: user.displayName,
        amount: amount,
        method: paymentMethod,
        phone: phoneNumber,
        status: 'pending',
        timestamp: serverTimestamp()
      });

      // 2. Set wallet balance to 0 immediately (Deduct full balance)
      await updateDoc(doc(db, 'users', user.uid), {
        walletBalance: 0
      });

      setShowWithdraw(false);
      setShowSuccessPopup(true);
      setWithdrawAmount('');
      setPhoneNumber('');
    } catch (e) {
      alert('আবেদন ব্যর্থ হয়েছে।');
    } finally {
      setLoading(false);
    }
  };

  const badge = (() => {
    const credits = user.credits || 0;
    if (credits > 1000) return { name: 'Gold Student', emoji: '🏆', color: 'from-amber-400 to-yellow-600' };
    if (credits > 500) return { name: 'Silver Scholar', emoji: '🥈', color: 'from-gray-300 to-slate-500' };
    return { name: 'Active Learner', emoji: '🌱', color: 'from-pink-500 to-rose-600' };
  })();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-10 duration-700 pb-20">
      
      {/* Success Popup */}
      {showSuccessPopup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-[3.5rem] p-10 text-center shadow-2xl border border-pink-50 animate-in zoom-in">
             <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6 shadow-inner">✓</div>
             <h3 className="text-2xl font-black text-gray-900 mb-4 tracking-tighter">আবেদন সফল!</h3>
             <p className="text-gray-600 font-bold leading-relaxed mb-8">
               অ্যাডমিন থেকে আপনার টাকা দ্রুত আপনার পেমেন্ট মেথড নাম্বারে পাঠিয়ে দেওয়া হবে। 🌸
             </p>
             <button onClick={() => setShowSuccessPopup(false)} className="w-full bg-pink-500 text-white py-5 rounded-[2rem] font-black text-lg shadow-lg active:scale-95">ঠিক আছে</button>
          </div>
        </div>
      )}

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
               <p className="text-[10px] text-gray-400 font-black uppercase mb-1 tracking-widest">স্মার্ট ওয়ালেট</p>
               <p className="text-2xl font-black text-pink-600">{Math.floor(user.walletBalance || 0)}৳</p>
             </div>
             <div className="glass-depth p-5 rounded-[2.5rem] text-center neo-inset border-white/40">
               <p className="text-[10px] text-gray-400 font-black uppercase mb-1 tracking-widest">Credits Balance</p>
               <p className="text-2xl font-black text-blue-600">{Math.floor(user.credits || 0)}</p>
             </div>
          </div>
        </div>
      </div>

      {pendingWithdrawals.length > 0 && (
        <div className="space-y-4 animate-in slide-in-from-right duration-500">
          <div className="flex justify-between items-center px-4">
             <h4 className="text-xl font-black text-gray-800 tracking-tight">অ্যাক্টিভিটি স্ট্যাটাস</h4>
             <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
          </div>
          <div className="space-y-3">
            {pendingWithdrawals.map(req => (
              <div key={req.id} className={`glass-depth p-6 rounded-[2.5rem] border-l-[6px] ${req.status === 'completed' ? 'border-emerald-500' : 'border-rose-500'} flex justify-between items-center bg-white/40`}>
                <div>
                  <p className="font-black text-gray-800 leading-none mb-1">
                    {req.status === 'completed' ? 'পেমেন্ট সম্পন্ন ✅' : 'উইথড্র আবেদন (পেন্ডিং)'}
                  </p>
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{req.amount}৳ via {req.method}</p>
                </div>
                <div className="text-right">
                  <span className={`text-[9px] font-black uppercase tracking-tighter ${req.status === 'completed' ? 'text-emerald-600' : 'text-orange-600'}`}>
                    {req.status === 'completed' ? 'সফল হয়েছে' : 'অ্যাডমিন চেক করছে'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-depth p-8 rounded-[3.5rem] border border-white shadow-xl bg-white/40 overflow-hidden relative">
         <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
         <div className="flex justify-between items-center mb-6">
            <h4 className="text-2xl font-black text-gray-800 tracking-tighter flex items-center">
              <span className="mr-3 text-3xl">🚀</span> ইনকাম স্ট্যাটাস
            </h4>
            <span className="bg-indigo-600 text-white px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">15% Commission</span>
         </div>
         <div className="grid grid-cols-2 gap-4">
            <div className="bg-rose-50 border border-rose-100 p-6 rounded-[2.5rem] text-center flex flex-col items-center group relative overflow-hidden">
               <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1 relative z-10">পেন্ডিং কমিশন</p>
               <p className="text-3xl font-black text-rose-600 relative z-10">{Math.floor(user.pendingCommission || 0)}৳</p>
               <button 
                onClick={handleClaimCommission}
                disabled={!user.pendingCommission || user.pendingCommission <= 0 || isClaiming}
                className="mt-4 w-full bg-rose-600 text-white py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-30 relative z-10"
               >
                 {isClaiming ? 'মুভ হচ্ছে...' : 'Move to Wallet 💰'}
               </button>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2.5rem] text-center flex flex-col items-center justify-center">
               <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Total Earned</p>
               <p className="text-3xl font-black text-emerald-600">{Math.floor(user.totalCommissionEarned || 0)}৳</p>
               <p className="text-[8px] font-bold text-emerald-300 uppercase mt-1">লাইফটাইম আর্নিং</p>
            </div>
         </div>
      </div>

      <div className="relative group overflow-hidden glass-depth p-10 rounded-[3.5rem] border border-pink-100 shadow-2xl bg-white/80">
        <h4 className="text-3xl font-black text-gray-800 tracking-tighter mb-2">আপনার কুপন কোড 🎁</h4>
        <div className="bg-gray-50 neo-inset rounded-[2.5rem] p-4 flex flex-col space-y-4">
          <div className="flex items-center justify-between px-8 py-6 rounded-[2rem] bg-white border border-pink-100 shadow-sm">
            <span className="font-mono font-black text-3xl text-pink-600 tracking-[0.2em]">{user.referralCode || '...'}</span>
            <button 
              onClick={() => copyToClipboard(user.referralCode || '')}
              className="bg-pink-500 text-white px-8 py-3 rounded-2xl text-[10px] font-black shadow-lg active:scale-95 transition-all uppercase tracking-widest"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      <div className="relative group">
        <div className="relative bg-gray-950 p-10 rounded-[3.5rem] text-white shadow-2xl overflow-hidden border border-white/5">
          <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="mb-10">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] mb-2">Available for Withdrawal</p>
              <div className="flex items-baseline">
                <h4 className="text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-500">{Math.floor(user.walletBalance || 0)}</h4>
                <span className="text-2xl ml-3 text-pink-500 font-black">৳</span>
              </div>
            </div>
            <button 
              onClick={() => {
                setWithdrawAmount(Math.floor(user.walletBalance).toString());
                setShowWithdraw(true);
              }}
              className="w-full bg-white text-gray-950 py-6 rounded-[2.5rem] font-black text-sm active:scale-95 transition-all uppercase tracking-widest"
            >
              Withdraw Now 💸
            </button>
          </div>
        </div>
      </div>

      {showWithdraw && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-2xl z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-sm:w-full max-w-sm rounded-[3.5rem] p-10 space-y-8 shadow-[0_50px_100px_rgba(0,0,0,0.4)] border border-gray-100 animate-in zoom-in">
            <div className="flex justify-between items-center">
               <h4 className="text-3xl font-black text-gray-800 tracking-tighter">উইথড্র রিকোয়েস্ট</h4>
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
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">পরিমাণ (Amount)</label>
                <div className="w-full bg-pink-50/50 p-5 rounded-3xl font-black text-3xl text-pink-600">
                  {withdrawAmount}৳
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">নাম্বার (Recipient)</label>
                <input 
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full bg-gray-50 p-5 rounded-3xl font-black text-lg text-gray-800 outline-none"
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
