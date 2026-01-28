
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase.ts';
import Auth from './components/Auth.tsx';
import Landing from './components/Landing.tsx';
import Dashboard from './components/Dashboard.tsx';
import CallInterface from './components/CallInterface.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import Footer from './components/Footer.tsx';
import { CallState, Language, UserRole } from './types.ts';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>('user');
  const [isAdminSession, setIsAdminSession] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [call, setCall] = useState<CallState>({ isActive: false, language: null });

  useEffect(() => {
    const savedAdmin = sessionStorage.getItem('maya_admin_active');
    const savedStarted = sessionStorage.getItem('maya_has_started');
    
    if (savedAdmin === 'true') {
      setIsAdminSession(true);
    }
    if (savedStarted === 'true') {
      setHasStarted(true);
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser && !currentUser.isAnonymous) {
        const snap = await getDoc(doc(db, 'users', currentUser.uid));
        if (snap.exists()) {
          setRole(snap.data()?.role || 'user');
          if (snap.data()?.role === 'admin') setIsAdminSession(true);
        }
      } else if (currentUser?.isAnonymous) {
        setRole('guest');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAdminLogin = () => {
    setIsAdminSession(true);
    sessionStorage.setItem('maya_admin_active', 'true');
  };

  const handleStartApp = () => {
    setHasStarted(true);
    sessionStorage.setItem('maya_has_started', 'true');
  };

  const handleLogout = () => {
    if (isAdminSession) {
      setIsAdminSession(false);
      sessionStorage.removeItem('maya_admin_active');
    }
    auth.signOut();
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-pink-50">
      <div className="flex flex-col items-center space-y-4">
        <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-pink-500 font-bold animate-pulse">মায়া লোড হচ্ছে...</p>
      </div>
    </div>
  );

  if (!hasStarted && !isAdminSession) {
    return <Landing onStart={handleStartApp} />;
  }

  if (isAdminSession) {
    return (
      <div className="min-h-screen bg-white">
        <div className="bg-gray-800 text-white px-6 py-2 flex justify-between items-center text-xs font-bold">
          <span>🛡️ ADMIN ACCESS ACTIVE</span>
          <button onClick={handleLogout} className="hover:text-red-400">LOGOUT</button>
        </div>
        <AdminPanel />
      </div>
    );
  }

  if (!user) return <Auth onAdminLogin={handleAdminLogin} />;

  return (
    <div className="min-h-screen flex flex-col bg-pink-50 font-sans">
      <main className="flex-grow">
        {!call.isActive ? (
          <Dashboard onStartCall={(lang) => setCall({ isActive: true, language: lang })} />
        ) : (
          call.language && <CallInterface language={call.language} onEnd={() => setCall({ isActive: false, language: null })} />
        )}
      </main>
      {!call.isActive && <Footer />}
    </div>
  );
};

export default App;
