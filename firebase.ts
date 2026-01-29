
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Function to safely access global window variables
const getGlobalVar = (key: string, defaultValue?: string) => {
  if (typeof window !== 'undefined' && (window as any)[key]) {
    return (window as any)[key];
  }
  return defaultValue;
};

const firebaseConfig = {
  apiKey: getGlobalVar('FIREBASE_API_KEY', process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAa3jHYhci4GyEJ-laiCLn0AfYiItni7ko"),
  authDomain: getGlobalVar('FIREBASE_AUTH_DOMAIN', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "mayaaimentor.firebaseapp.com"),
  projectId: getGlobalVar('FIREBASE_PROJECT_ID', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "mayaaimentor"),
  storageBucket: getGlobalVar('FIREBASE_STORAGE_BUCKET', process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "mayaaimentor.firebasestorage.app"),
  messagingSenderId: getGlobalVar('FIREBASE_MESSAGING_SENDER_ID', process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "719504306041"),
  appId: getGlobalVar('FIREBASE_APP_ID', process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:719504306041:web:e3c646d611cdf95fe709a8")
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
