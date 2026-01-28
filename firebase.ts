
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAa3jHYhci4GyEJ-laiCLn0AfYiItni7ko",
  authDomain: "mayaaimentor.firebaseapp.com",
  projectId: "mayaaimentor",
  storageBucket: "mayaaimentor.firebasestorage.app",
  messagingSenderId: "719504306041",
  appId: "1:719504306041:web:e3c646d611cdf95fe709a8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
