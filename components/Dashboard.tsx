
import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Language, UserProfile } from '../types';
import { auth, db } from '../firebase';
import Store from './Store';
import Profile from './Profile';

interface DashboardProps {
  onStartCall: (lang: Language) => void;
}

const MAYA_AVATAR = "https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?auto=format&fit=crop&q=80&w=400&h=400";

const MAYA_TIPS = [
  "ভয় পাবেন না, ভুল থেকেই শেখা শুরু হয়। মায়া আপনার পাশেই আছে!",
  "মায়ার সাথে কথা বলতে আপনার ক্রেডিট সেকেন্ডের হিসাবে খরচ হয়।",
  "নতুন শব্দ শিখলে তা সাথে সাথে মায়ার সাথে বাক্যে ব্যবহার করুন!",
  "সেশন শেষে কারেকশন রিপোর্টটি ডাউনলোড করতে ভুলবেন না।"
];

const Dashboard: React.FC<DashboardProps> = ({ onStartCall }) => {
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [showStore, setShowStore] = useState(false);
  const [showLowCreditModal, setShowLowCreditModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');
  const [currentTip, setCurrentTip] = useState(MAYA_TIPS[0]);

  useEffect(() => {
    setCurrentTip(MAYA_TIPS[Math.floor(Math.random() * MAYA_TIPS.length)]);
    if (!auth.currentUser) return;

    if (auth.currentUser.isAnonymous) {
      setUserData({
        uid: auth.currentUser.uid,
        displayName: 'Guest User',
        email: null,
        credits: 1,
        role: 'guest',
        referralCode: 'GUEST',
        walletBalance: 0,
        pendingCommission: 0,
        totalCommissionEarned: 0,
        referralCount: 0
      });
      return;
    }

    const unsub = onSnapshot(doc(db, 'users', auth.currentUser.uid), (snap) => {
      if (snap.exists()) setUserData(snap.data() as UserProfile);
    });

    return () => unsub();
  }, []);

  const handleStart = (lang: Language) => {
    if ((userData?.credits || 0) <= 0) {
      setShowLowCreditModal(true);
      return;
    }
    onStartCall(lang);
  };

  const handleGoToStore = () => {
    setShowLowCreditModal(false);
    setShowStore(true);
  };

  return (
    <div className="min-h-screen px-5 pt-8 pb-32 max-w-2xl mx-auto space-y-10 overflow-x-hidden">
      {showStore && <Store onClose={() => setShowStore(false)} />}
      
      {/* 3D Low Credit Modal */}
      {showLowCreditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-sm rounded-[3.5rem] p-10 text-center shadow-[0_50px_100px_rgba(0,0,0,0.4)] border border-white relative overflow-hidden animate-in zoom-in duration-300">
              <div className="absolute top-0 right-0 w-32 h-32 bg-pink-100 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-50"></div>
              
              <div className="relative mb-8">
                 <div className="w-32 h-32 bg-pink-500 rounded-[2.5rem] mx-auto overflow-hidden shadow-2xl border-4 border-white animate-float ring-8 ring-pink-50">
                    <img src={MAYA_AVATAR} className="w-full h-full object-cover" alt="Maya" />
                 </div>
                 <div className="absolute -bottom-2 -right-2 bg-white w-12 h-12 rounded-2xl shadow-xl flex items-center justify-center text-2xl border border-pink-50">😟</div>
              </div>

              <h3 className="text-3xl font-black text-gray-900 tracking-tighter mb-4">প্রিয় বন্ধু! 👋</h3>
              <p className="text-gray-600 font-bold leading-relaxed mb-10">
                আপনার কথা বলার ক্রেডিট একদম শেষ হয়ে গেছে। আরও মায়াবী আড্ডা আর প্র্যাকটিস চালিয়ে যেতে ঝটপট কিছু ক্রেডিট রিচার্জ করে নিন না!
              </p>

              <div className="space-y-4">
                <button 
                  onClick={handleGoToStore}
                  className="w-full bg-pink-500 text-white py-5 rounded-[2rem] font-black text-lg shadow-[0_20px_40px_rgba(236,72,153,0.3)] active:scale-95 transition-all uppercase tracking-widest"
                >
                  ক্রেডিট কিনুন 💎
                </button>
                <button 
                  onClick={() => setShowLowCreditModal(false)}
                  className="w-full py-4 text-gray-400 font-black text-xs uppercase tracking-widest hover:text-gray-600 transition-colors"
                >
                  পরে করব
                </button>
              </div>
           </div>
        </div>
      )}
      
      <header className="flex justify-between items-center glass-depth p-4 rounded-[2.5rem] sticky top-4 z-40">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg border-2 border-pink-500 animate-float">
            <img src={MAYA_AVATAR} className="w-full h-full object-cover" alt="Maya" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-800 tracking-tight">Maya AI</h1>
            <span className="text-[10px] font-bold text-pink-500 uppercase tracking-widest">Premium Mentor</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="bg-pink-100/50 px-4 py-2 rounded-2xl border border-pink-200/50 flex items-center space-x-2 shadow-sm">
            <span className="text-pink-600 font-black text-lg">{(userData?.credits || 0).toFixed(1)}</span>
            <span className="text-[10px] font-bold text-pink-400 uppercase tracking-tighter">Credits</span>
          </div>
          <button onClick={() => auth.signOut()} className="w-11 h-11 glass-depth rounded-2xl flex items-center justify-center text-gray-400 hover:text-red-500 transition-all active:scale-90">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          </button>
        </div>
      </header>

      {activeTab === 'home' ? (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div>
            <h2 className="text-5xl font-black text-gray-800 leading-none tracking-tighter">
              হাই <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-indigo-600">{userData?.displayName?.split(' ')[0] || 'বন্ধু'}</span>! 👋
            </h2>
            <div className="mt-6 glass-depth p-6 rounded-[2.5rem] border-l-[6px] border-pink-500 relative overflow-hidden group">
               <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center">
                 <span className="mr-2">💡</span> মায়ার পরামর্শ
               </p>
               <p className="text-gray-700 font-bold italic text-lg leading-relaxed">"{currentTip}"</p>
            </div>
          </div>

          {/* Practice Cards */}
          <div className="grid grid-cols-1 gap-8">
            
            {/* English Card */}
            <div 
              onClick={() => handleStart('English')}
              className="relative group cursor-pointer"
            >
              <div className="absolute inset-0 bg-indigo-600 rounded-[3.5rem] blur-3xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
              <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-blue-800 p-1 rounded-[3.5rem] shadow-2xl transition-all duration-500 hover:-translate-y-2 active:scale-95">
                <div className="bg-indigo-900/40 backdrop-blur-3xl rounded-[3.4rem] p-10 h-full flex flex-col justify-between overflow-hidden relative">
                  <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
                  <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/40 to-transparent"></div>
                  
                  <div className="relative z-10 flex justify-between items-start">
                    <div>
                      <span className="bg-indigo-400/30 text-indigo-100 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 inline-block border border-white/10">Global Standard</span>
                      <h3 className="text-4xl font-black text-white tracking-tighter">English Speaking</h3>
                      <p className="text-indigo-200/70 font-bold mt-2 text-sm">Speak like a native with Maya</p>
                    </div>
                    <div className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-3xl flex items-center justify-center text-4xl border border-white/20 group-hover:rotate-12 transition-transform duration-500">🇺🇸</div>
                  </div>

                  <div className="relative z-10 mt-12 flex items-center justify-between">
                    <div className="flex -space-x-3">
                      {[1,2,3].map(i => (
                        <div key={i} className="w-8 h-8 rounded-full border-2 border-indigo-600 bg-indigo-400 flex items-center justify-center text-[8px] font-black text-white">
                          {i === 1 ? 'AI' : i === 2 ? 'L' : 'M'}
                        </div>
                      ))}
                      <div className="pl-6 text-[10px] font-bold text-indigo-200">12.5k Students joined</div>
                    </div>
                    <div className="bg-white text-indigo-600 w-14 h-14 rounded-[2rem] flex items-center justify-center shadow-xl group-hover:w-32 transition-all duration-500 overflow-hidden relative">
                      <span className="absolute left-6 font-black text-xs uppercase opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Start Session</span>
                      <svg className="w-6 h-6 absolute right-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* German Card */}
            <div 
              onClick={() => handleStart('German')}
              className="relative group cursor-pointer"
            >
              <div className="absolute inset-0 bg-rose-600 rounded-[3.5rem] blur-3xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
              <div className="relative overflow-hidden bg-gradient-to-br from-rose-500 to-rose-700 p-1 rounded-[3.5rem] shadow-2xl transition-all duration-500 hover:-translate-y-2 active:scale-95">
                <div className="bg-rose-900/40 backdrop-blur-3xl rounded-[3.4rem] p-10 h-full flex flex-col justify-between overflow-hidden relative">
                  <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
                  
                  <div className="relative z-10 flex justify-between items-start">
                    <div>
                      <span className="bg-rose-400/30 text-rose-100 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 inline-block border border-white/10">European Pathway</span>
                      <h3 className="text-4xl font-black text-white tracking-tighter">German Mastery</h3>
                      <p className="text-rose-200/70 font-bold mt-2 text-sm">A1 to C2 preparation with Maya</p>
                    </div>
                    <div className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-3xl flex items-center justify-center text-4xl border border-white/20 group-hover:rotate-12 transition-transform duration-500">🇩🇪</div>
                  </div>

                  <div className="relative z-10 mt-12 flex items-center justify-between">
                    <div className="flex -space-x-3">
                      {[1,2,3].map(i => (
                        <div key={i} className="w-8 h-8 rounded-full border-2 border-rose-600 bg-rose-400 flex items-center justify-center text-[8px] font-black text-white">
                          {i === 1 ? 'DE' : i === 2 ? 'V' : 'M'}
                        </div>
                      ))}
                      <div className="pl-6 text-[10px] font-bold text-rose-200">5.2k Students joined</div>
                    </div>
                    <div className="bg-white text-rose-600 w-14 h-14 rounded-[2rem] flex items-center justify-center shadow-xl group-hover:w-32 transition-all duration-500 overflow-hidden relative">
                      <span className="absolute left-6 font-black text-xs uppercase opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Start Session</span>
                      <svg className="w-6 h-6 absolute right-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Credits Store CTA */}
          <div className="glass-depth p-8 rounded-[3rem] border border-white flex items-center justify-between shadow-xl cursor-pointer active:scale-95 transition-all group overflow-hidden relative" onClick={() => setShowStore(true)}>
             <div className="absolute inset-0 bg-pink-500 opacity-0 group-hover:opacity-5 transition-opacity"></div>
             <div className="flex items-center space-x-6 relative z-10">
                <div className="w-16 h-16 bg-pink-500 rounded-3xl flex items-center justify-center text-3xl shadow-lg group-hover:rotate-12 transition-transform">💎</div>
                <div>
                  <h4 className="font-black text-gray-800 text-xl tracking-tight">ক্রেডিট রিচার্জ</h4>
                  <p className="text-gray-400 text-sm font-medium">প্র্যাকটিস করার জন্য ক্রেডিট কিনুন</p>
                </div>
             </div>
             <div className="w-12 h-12 rounded-2xl bg-gray-900 text-white flex items-center justify-center shadow-lg group-hover:bg-pink-500 transition-colors relative z-10">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"></path></svg>
             </div>
          </div>
        </div>
      ) : (
        userData && <Profile user={userData} />
      )}

      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-sm:w-[95%] max-w-sm bg-gray-900/90 backdrop-blur-xl p-2 rounded-full shadow-2xl flex justify-between items-center z-50 border border-white/10">
        <button onClick={() => setActiveTab('home')} className={`flex-grow flex items-center justify-center space-x-2 py-4 rounded-full transition-all ${activeTab === 'home' ? 'bg-pink-500 text-white shadow-lg' : 'text-gray-500'}`}>
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path></svg>
        </button>
        <button onClick={() => setActiveTab('profile')} className={`flex-grow flex items-center justify-center space-x-2 py-4 rounded-full transition-all ${activeTab === 'profile' ? 'bg-pink-500 text-white shadow-lg' : 'text-gray-500'}`}>
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path></svg>
        </button>
      </nav>
    </div>
  );
};

export default Dashboard;
