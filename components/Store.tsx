
import React, { useState, useEffect } from 'react';
import { addDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { CreditPackage, UserProfile } from '../types';

const PACKAGES: CreditPackage[] = [
  { id: 'p1', name: 'স্বপ্নযাত্রা (Dreamer)', credits: 100, price: 80, description: '১০০ ক্রেডিট দিয়ে মায়ার সাথে মায়াবী আড্ডা দিন' },
  { id: 'p2', name: 'প্রগতি (Progress)', credits: 300, price: 200, description: '৩০০ ক্রেডিট দিয়ে আপনার স্পিকিং স্কিল বাড়িয়ে নিন' },
  { id: 'p3', name: 'মহিমা (Grandeur)', credits: 600, price: 380, description: '৬০০ ক্রেডিট দিয়ে মায়ার সাথে দীর্ঘ সময় প্র্যাকটিস করুন' },
  { id: 'p4', name: 'রাজকীয় (Imperial)', credits: 1200, price: 700, description: '১২০০ ক্রেডিট দিয়ে মায়ার সাথে এক্সপার্ট মেন্টরশিপ পান' },
];

const Store: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [step, setStep] = useState<'packages' | 'billing'>('packages');
  const [selectedPkg, setSelectedPkg] = useState<CreditPackage | null>(null);
  const [trxId, setTrxId] = useState('');
  const [coupon, setCoupon] = useState('');
  const [discountedPrice, setDiscountedPrice] = useState<number | null>(null);
  const [couponStatus, setCouponStatus] = useState<'none' | 'valid' | 'invalid'>('none');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'bkash' | 'nagad'>('bkash');

  const BKASH_NUMBER = "01915344445";
  const NAGAD_NUMBER = "01742782248";
  const FIXED_DISCOUNT_PERCENT = 10; 

  useEffect(() => {
    if (selectedPkg && coupon.length >= 4) {
      const delayDebounceFn = setTimeout(() => {
        validateCoupon();
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setDiscountedPrice(null);
      setCouponStatus('none');
    }
  }, [coupon, selectedPkg]);

  const validateCoupon = async () => {
    const q = query(collection(db, 'users'), where('referralCode', '==', coupon.toUpperCase()));
    const snap = await getDocs(q);
    
    if (!snap.empty && selectedPkg) {
      setDiscountedPrice(Math.floor(selectedPkg.price * (1 - (FIXED_DISCOUNT_PERCENT / 100))));
      setCouponStatus('valid');
    } else {
      setDiscountedPrice(null);
      setCouponStatus('invalid');
    }
  };

  const handlePackageSelect = (pkg: CreditPackage) => {
    setSelectedPkg(pkg);
    setStep('billing');
  };

  const handleSubmit = async () => {
    if (!selectedPkg || !trxId || !auth.currentUser) return;
    setLoading(true);
    try {
      // Ensure we are using the confirmed uid and displayName
      const currentUser = auth.currentUser;
      await addDoc(collection(db, 'requests'), {
        uid: currentUser.uid,
        userName: currentUser.displayName || 'Learner',
        packageName: selectedPkg.name,
        credits: selectedPkg.credits,
        amount: discountedPrice || selectedPkg.price,
        transactionId: trxId.trim().toUpperCase(),
        couponCode: couponStatus === 'valid' ? coupon.toUpperCase() : null,
        status: 'pending',
        paymentMethod: paymentMethod,
        timestamp: serverTimestamp()
      });
      setSuccess(true);
    } catch (err) {
      console.error("Order submission failed:", err);
      alert('আবেদন জমা হয়নি। আপনার ইন্টারনেট কানেকশন চেক করুন।');
    } finally {
      setLoading(false);
    }
  };

  const getPackageStyles = (id: string) => {
    switch (id) {
      case 'p1': return "bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-emerald-200/50";
      case 'p2': return "bg-gradient-to-br from-indigo-500 to-blue-700 text-white shadow-indigo-200/50";
      case 'p3': return "bg-gradient-to-br from-rose-400 to-pink-600 text-white shadow-pink-200/50";
      case 'p4': return "bg-gradient-to-br from-slate-800 to-slate-950 text-white shadow-slate-300 border-4 border-amber-400/30";
      default: return "bg-white text-gray-800";
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 bg-white z-[70] flex items-center justify-center p-6 text-center animate-in fade-in duration-500">
        <div className="max-w-sm">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-5xl mx-auto mb-6 shadow-xl animate-bounce">✅</div>
          <h2 className="text-3xl font-black text-gray-900 mb-4 tracking-tighter">আবেদন সফল!</h2>
          <p className="text-gray-500 font-medium mb-8">অ্যাডমিন আপনার ট্রানজেকশন যাচাই করে দ্রুত ক্রেডিট যোগ করে দেবেন। অনুগ্রহ করে ১০-২০ মিনিট অপেক্ষা করুন।</p>
          <button onClick={onClose} className="w-full bg-gray-900 text-white py-5 rounded-[2rem] font-black text-lg shadow-2xl active:scale-95 transition-all">ফিরে যান</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-50 z-[60] overflow-y-auto no-scrollbar">
      <div className="max-w-3xl mx-auto p-6 md:p-10 pb-32">
        
        <div className="flex justify-between items-center mb-12">
          <div className="flex items-center space-x-4">
            <button onClick={step === 'billing' ? () => setStep('packages') : onClose} className="w-12 h-12 glass-depth rounded-2xl flex items-center justify-center text-gray-800 hover:bg-white transition-all shadow-sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path></svg>
            </button>
            <div>
              <h2 className="text-3xl font-black text-gray-950 tracking-tighter">
                {step === 'packages' ? 'প্যাকেজ বাছাই করুন' : 'চেকআউট'}
              </h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">Premium Credit Store</p>
            </div>
          </div>
        </div>

        {step === 'packages' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-10">
            {PACKAGES.map(pkg => (
              <div
                key={pkg.id}
                onClick={() => handlePackageSelect(pkg)}
                className={`group relative p-10 rounded-[4rem] shadow-2xl hover:scale-[1.03] transition-all duration-500 cursor-pointer overflow-hidden ${getPackageStyles(pkg.id)}`}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="font-black text-2xl tracking-tighter w-2/3">{pkg.name}</h4>
                    {pkg.id === 'p4' && <span className="bg-amber-400 text-gray-900 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse">Best Value</span>}
                  </div>
                  
                  <p className="text-white/70 font-medium text-xs mb-10 leading-relaxed">{pkg.description}</p>
                  
                  <div className="mt-auto flex justify-between items-end">
                    <div>
                      <span className="text-5xl font-black tracking-tighter">{pkg.price}৳</span>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mt-1">Single Recharge</p>
                    </div>
                    <div className="bg-white/20 backdrop-blur-xl px-5 py-3 rounded-[1.8rem] font-black text-sm border border-white/20">
                      {pkg.credits} Credits
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-10">
            
            <div className="bg-white p-10 rounded-[4rem] shadow-xl border border-slate-100">
               <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center">
                  <span className="w-8 h-8 bg-pink-100 text-pink-600 rounded-lg flex items-center justify-center mr-4 text-xs">01</span>
                  কুপন কোড (যদি থাকে)
               </h3>
               <div className="relative">
                  <input 
                    value={coupon} 
                    onChange={e => setCoupon(e.target.value)} 
                    placeholder="MAYA10" 
                    className={`w-full bg-slate-50 p-6 rounded-[2.2rem] font-black text-xl outline-none border-4 transition-all uppercase placeholder:opacity-20 ${couponStatus === 'valid' ? 'border-emerald-200 pr-32' : couponStatus === 'invalid' ? 'border-rose-200' : 'border-transparent'}`} 
                  />
                  {couponStatus === 'valid' && (
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 bg-emerald-500 text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg animate-in zoom-in">
                      {FIXED_DISCOUNT_PERCENT}% OFF!
                    </div>
                  )}
               </div>
            </div>

            <div className={`p-10 rounded-[4.5rem] shadow-2xl text-white relative overflow-hidden ${getPackageStyles(selectedPkg?.id || 'p1')}`}>
               <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
               <h3 className="text-xl font-black mb-8 flex items-center">
                  <span className="w-8 h-8 bg-white/20 text-white rounded-lg flex items-center justify-center mr-4 text-xs">02</span>
                  অর্ডার সামারি
               </h3>
               <div className="space-y-5">
                  <div className="flex justify-between items-center text-sm">
                     <span className="opacity-70 font-bold">প্যাকেজ নাম:</span>
                     <span className="font-black text-lg">{selectedPkg?.name}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                     <span className="opacity-70 font-bold">ক্রেডিট পরিমাণ:</span>
                     <span className="font-black text-lg">{selectedPkg?.credits} Credits</span>
                  </div>
                  {couponStatus === 'valid' && (
                    <div className="flex justify-between items-center text-sm pt-5 border-t border-white/10">
                       <span className="text-emerald-300 font-bold">ডিসকাউন্ট ({FIXED_DISCOUNT_PERCENT}%):</span>
                       <span className="text-emerald-300 font-black">-{selectedPkg?.price! - (discountedPrice || 0)}৳</span>
                    </div>
                  )}
                  <div className="pt-8 flex justify-between items-end border-t border-white/10">
                     <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] opacity-50 mb-1">Total Payable</p>
                        <p className="text-6xl font-black tracking-tighter">
                           {discountedPrice || selectedPkg?.price}৳
                        </p>
                     </div>
                  </div>
               </div>
            </div>

            <div className="bg-white p-10 rounded-[4.5rem] shadow-xl border border-slate-100">
               <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center">
                  <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center mr-4 text-xs">03</span>
                  পেমেন্ট মাধ্যম সিলেক্ট করুন
               </h3>
               <div className="grid grid-cols-2 gap-6 mb-10">
                  <div className="relative cursor-pointer">
                    <input type="radio" name="method" id="bkash" className="peer hidden" checked={paymentMethod === 'bkash'} onChange={() => setPaymentMethod('bkash')} />
                    <label htmlFor="bkash" className="block p-8 bg-slate-50 rounded-[2.5rem] border-4 border-transparent peer-checked:border-pink-500 peer-checked:bg-white transition-all text-center shadow-sm">
                       <p className="font-black text-pink-600 text-2xl">bKash</p>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Personal</p>
                    </label>
                  </div>
                  <div className="relative cursor-pointer">
                    <input type="radio" name="method" id="nagad" className="peer hidden" checked={paymentMethod === 'nagad'} onChange={() => setPaymentMethod('nagad')} />
                    <label htmlFor="nagad" className="block p-8 bg-slate-50 rounded-[2.5rem] border-4 border-transparent peer-checked:border-orange-500 peer-checked:bg-white transition-all text-center shadow-sm">
                       <p className="font-black text-orange-600 text-2xl">Nagad</p>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Personal</p>
                    </label>
                  </div>
               </div>
               
               <div className={`p-8 rounded-[3rem] border-4 border-dashed transition-all ${paymentMethod === 'bkash' ? 'bg-pink-50 border-pink-100' : 'bg-orange-50 border-orange-100'}`}>
                  <p className={`text-sm font-bold mb-4 ${paymentMethod === 'bkash' ? 'text-pink-800' : 'text-orange-800'}`}>
                    নিচের নাম্বারে <span className="text-xl font-black underline">{discountedPrice || selectedPkg?.price}৳</span> সেন্ড মানি করুন:
                  </p>
                  <div className="bg-white p-6 rounded-[2rem] flex justify-between items-center shadow-sm border border-black/5">
                     <span className="text-3xl font-black text-gray-900 tracking-tighter">
                       {paymentMethod === 'bkash' ? BKASH_NUMBER : NAGAD_NUMBER}
                     </span>
                     <button 
                       onClick={() => { navigator.clipboard.writeText(paymentMethod === 'bkash' ? BKASH_NUMBER : NAGAD_NUMBER); alert('নাম্বার কপি হয়েছে!'); }} 
                       className={`${paymentMethod === 'bkash' ? 'bg-pink-500' : 'bg-orange-500'} text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-90 transition-all`}
                     >
                       Copy
                     </button>
                  </div>
               </div>
            </div>

            <div className="bg-white p-10 rounded-[4.5rem] shadow-xl border border-slate-100">
               <h3 className="text-xl font-black text-gray-900 mb-8 flex items-center">
                  <span className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center mr-4 text-xs">04</span>
                  ট্রানজেকশন তথ্য দিন
               </h3>
               <div className="space-y-3">
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] ml-6">Transaction ID (TRX)</label>
                  <input 
                    value={trxId} 
                    onChange={e => setTrxId(e.target.value)} 
                    placeholder="AH78B9X2" 
                    className="w-full bg-slate-50 p-7 rounded-[2.5rem] font-black text-2xl outline-none border-4 border-transparent focus:border-indigo-100 transition-all uppercase placeholder:opacity-10" 
                  />
               </div>
            </div>

            <div className="pt-6">
               <button 
                  onClick={handleSubmit} 
                  disabled={loading || !trxId} 
                  className="w-full bg-gray-950 text-white py-8 rounded-[3rem] font-black text-2xl shadow-[0_25px_50px_rgba(0,0,0,0.3)] active:scale-95 disabled:opacity-30 transition-all uppercase tracking-[0.2em]"
               >
                  {loading ? 'প্রসেসিং...' : 'পেমেন্ট সম্পন্ন করুন'}
               </button>
               <p className="text-center text-[11px] font-bold text-gray-400 mt-8 px-12 leading-relaxed italic">পেমেন্ট সম্পন্ন করার পর অ্যাডমিন যাচাই করে আপনার ক্রেডিট যোগ করে দিবেন। সাধারণত ৫-৩০ মিনিট সময় লাগে।</p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default Store;
