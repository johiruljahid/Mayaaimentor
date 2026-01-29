
import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

interface AuthProps {
  onAdminLogin: () => void;
}

const Auth: React.FC<AuthProps> = ({ onAdminLogin }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'admin'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const generateReferralCode = (name: string) => {
    const cleanName = name.replace(/\s+/g, '').substring(0, 3).toUpperCase();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `${cleanName}${randomNum}`;
  };

  const handleGoogleAuth = async () => {
    setError('');
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        const refCode = generateReferralCode(user.displayName || 'MAYA');
        await setDoc(userDocRef, {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          credits: 2, // Updated from 5 to 2 bonus credits
          role: 'user',
          referralCode: refCode,
          walletBalance: 0,
          pendingCommission: 0,
          totalCommissionEarned: 0,
          referralCount: 0,
          createdAt: serverTimestamp()
        });
      }
    } catch (err: any) {
      console.error("Google Auth Error:", err);
      setError('গুগল লগইন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'admin') {
        if (adminCode === 'Jahid') {
          onAdminLogin();
        } else {
          throw new Error('ভুল অ্যাডমিন কোড!');
        }
      } else if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const refCode = generateReferralCode(name || 'MAYA');
        await updateProfile(userCredential.user, { displayName: name });
        
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          displayName: name,
          email: email,
          credits: 2, // Updated from 5 to 2 bonus credits
          role: 'user',
          referralCode: refCode,
          walletBalance: 0,
          pendingCommission: 0,
          totalCommissionEarned: 0,
          referralCount: 0,
          createdAt: serverTimestamp()
        });
      }
    } catch (err: any) {
      setError(err.message || 'ব্যর্থ হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-pink-100 to-blue-50">
      <div className="w-full max-w-md bg-white/80 backdrop-blur-xl p-8 rounded-[2rem] shadow-2xl border border-white">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-pink-500 rounded-3xl mx-auto flex items-center justify-center text-4xl shadow-lg mb-4 rotate-3">
            <span className="animate-pulse">{mode === 'admin' ? '🛡️' : '🌸'}</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-800">Maya AI Mentor</h1>
          <p className="text-gray-500 mt-1">
            {mode === 'admin' ? 'প্রাইভেট এক্সেস' : 'আপনার মিষ্টি মেন্টরের সাথে কথা বলুন'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {mode !== 'admin' ? (
            <>
              {mode === 'signup' && (
                <input
                  type="text"
                  placeholder="আপনার নাম"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-5 py-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-pink-300 transition-all outline-none"
                  required
                />
              )}
              <input
                type="email"
                placeholder="ইমেইল এড্রেস"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-pink-300 transition-all outline-none"
                required
              />
              <input
                type="password"
                placeholder="পাসওয়ার্ড"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-pink-300 transition-all outline-none"
                required
              />
            </>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <input
                type="password"
                placeholder="••••••••"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                className="w-full px-5 py-5 rounded-2xl bg-pink-50 border-2 border-pink-100 focus:ring-2 focus:ring-pink-400 text-center text-xl font-bold tracking-widest outline-none"
                autoFocus
                required
              />
            </div>
          )}
          
          {error && <p className="text-red-600 text-[10px] font-bold text-center bg-red-50 p-4 rounded-2xl border border-red-100 leading-relaxed shadow-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 rounded-2xl font-bold text-white shadow-lg transition-all active:scale-95 bg-pink-500 hover:bg-pink-600`}
          >
            {loading ? 'প্রক্রিয়া চলছে...' : (mode === 'login' ? 'লগইন' : mode === 'signup' ? 'অ্যাকাউন্ট খুলুন' : 'অ্যাডমিন প্রবেশ')}
          </button>
        </form>

        {mode !== 'admin' && (
          <>
            <div className="my-6 flex items-center space-x-3 opacity-20">
              <div className="h-px bg-gray-400 flex-grow"></div>
              <span className="text-[10px] font-bold uppercase tracking-widest">অথবা</span>
              <div className="h-px bg-gray-400 flex-grow"></div>
            </div>

            <button
              onClick={handleGoogleAuth}
              disabled={loading}
              className="w-full py-4 px-6 rounded-2xl bg-white border border-gray-100 flex items-center justify-center space-x-3 shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
              <span className="text-gray-700 font-bold">গুগল দিয়ে লগইন করুন</span>
            </button>
          </>
        )}

        <div className="mt-6 flex flex-col space-y-3 text-center">
          {mode !== 'admin' ? (
            <button 
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="text-gray-500 text-sm hover:text-pink-600 font-bold py-2"
            >
              {mode === 'login' ? 'নতুন অ্যাকাউন্ট খুলতে চান? রেজিস্টার করুন' : 'আগেই অ্যাকাউন্ট আছে? লগইন করুন'}
            </button>
          ) : (
            <button 
              onClick={() => setMode('login')}
              className="text-gray-500 text-sm hover:text-pink-600 font-medium py-2"
            >
              ইউজার লগইন-এ ফিরে যান
            </button>
          )}
          
          <div className="pt-6 border-t border-gray-100 mt-4">
             <button 
              onClick={() => setMode(mode === 'admin' ? 'login' : 'admin')}
              className={`w-full text-xs uppercase tracking-widest font-bold transition-colors py-2 rounded-lg ${
                mode === 'admin' ? 'text-pink-400' : 'text-gray-400 hover:text-pink-500 hover:bg-pink-50'
              }`}
            >
              {mode === 'admin' ? '← ফিরে যান' : 'অ্যাডমিন লগইন (Admin Login)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
