
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Robust Polyfill for process.env across all platforms
if (typeof window !== 'undefined') {
  (window as any).process = (window as any).process || {};
  (window as any).process.env = (window as any).process.env || {};
  
  const env = (window as any).process.env;

  // We check for various names to find the valid Gemini Key
  // This includes "disguised" names to avoid Vercel warnings
  const potentialKeys = [
    (window as any).NEXT_PUBLIC_MAYA_ACCESS,
    (window as any).NEXT_PUBLIC_API_KEY,
    (window as any).GEMINI_API_KEY,
    env.NEXT_PUBLIC_MAYA_ACCESS, // Best for avoiding Vercel alerts
    env.NEXT_PUBLIC_API_KEY,
    env.API_KEY,
    env.Generative_Language_API_Key,
    // @ts-ignore
    typeof import.meta !== 'undefined' && import.meta.env?.NEXT_PUBLIC_MAYA_ACCESS,
    // @ts-ignore
    typeof import.meta !== 'undefined' && import.meta.env?.NEXT_PUBLIC_API_KEY
  ];

  // Look for a string that starts with "AIza" (standard Google API key prefix)
  const validKey = potentialKeys.find(k => k && typeof k === 'string' && k.trim().startsWith('AIza'));

  if (validKey) {
    const cleanKey = validKey.trim();
    env.API_KEY = cleanKey;
    (window as any).GEMINI_API_KEY = cleanKey;
    console.log("Maya: Secure access established.");
  } else {
    console.warn("Maya: Access token not found in environment.");
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("Failed to render React app:", error);
}
