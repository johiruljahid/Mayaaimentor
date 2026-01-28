
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import Auth from './components/Auth';
import Landing from './components/Landing';
import Dashboard from './components/Dashboard';
import CallInterface from './components/CallInterface';
import AdminPanel from './components/AdminPanel';
import Footer from './components/Footer';
import { CallState, Language, UserRole } from './types';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>('user');
  const [isAdminSession, setIsAdminSession] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [call, setCall] = useState<CallState>({ isActive: false, language: null });

  useEffect(() => {
    // Check for existing admin session or landing start state in session storage
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
        setRole(snap.data()?.role || 'user');
        if (snap.data()?.role === 'admin') setIsAdminSession(true);
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
      <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // 1. Show Landing page first if not started
  if (!hasStarted && !isAdminSession) {
    return <Landing onStart={handleStartApp} />;
  }

  // 2. Direct admin session
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

  // 3. Auth handling
  if (!user) return <Auth onAdminLogin={handleAdminLogin} />;

  // 4. Main App Content
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
