
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Robust Polyfill for process.env across all platforms (Vercel, Firebase, etc.)
if (typeof window !== 'undefined') {
  // 1. Initialize process.env safely
  (window as any).process = (window as any).process || {};
  (window as any).process.env = (window as any).process.env || {};
  
  const env = (window as any).process.env;

  // 2. Comprehensive search for the API Key in multiple possible locations
  // We check window globals, process.env, and meta environments
  const potentialKeys = [
    (window as any).NEXT_PUBLIC_API_KEY,
    (window as any).GEMINI_API_KEY,
    (window as any).Generative_Language_API_Key,
    env.NEXT_PUBLIC_API_KEY,
    env.API_KEY,
    env.Generative_Language_API_Key,
    env.NEXT_PUBLIC_GEMINI_API_KEY,
    // @ts-ignore - Handle Vite/Vercel specific meta environment if present
    typeof import.meta !== 'undefined' && import.meta.env?.NEXT_PUBLIC_API_KEY
  ];

  // Look for a string that starts with "AIza" (standard Gemini/Google API key prefix)
  const validKey = potentialKeys.find(k => k && typeof k === 'string' && k.trim().startsWith('AIza'));

  if (validKey) {
    const cleanKey = validKey.trim();
    env.API_KEY = cleanKey;
    (window as any).GEMINI_API_KEY = cleanKey;
    (window as any).NEXT_PUBLIC_API_KEY = cleanKey; // Sync back for redundancy
    console.log("Maya: Environment successfully linked with API Key.");
  } else {
    console.warn("Maya: API Key not detected in any environment source.");
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
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
