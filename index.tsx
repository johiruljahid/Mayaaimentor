
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Robust Polyfill for process.env across all platforms (Vercel, Firebase, etc.)
if (typeof window !== 'undefined') {
  // 1. Initialize process.env if it doesn't exist
  (window as any).process = (window as any).process || { env: {} };
  const env = (window as any).process.env;
  
  // 2. Comprehensive search for the API Key
  // We check window globals, process.env, and the user's specific variable name
  const unifiedKey = 
    (window as any).GEMINI_API_KEY || 
    (window as any).NEXT_PUBLIC_API_KEY ||
    env.API_KEY || 
    env.NEXT_PUBLIC_API_KEY || 
    env.Generative_Language_API_Key || // Added user's specific name
    env.NEXT_PUBLIC_GEMINI_API_KEY ||
    (window as any).Generative_Language_API_Key;

  if (unifiedKey) {
    // Set it to the standard location the rest of the app expects
    env.API_KEY = unifiedKey;
    // Also set globally for easier access in some contexts
    (window as any).GEMINI_API_KEY = unifiedKey;
    console.log("Maya Environment: API Key found and initialized.");
  } else {
    console.warn("Maya Environment: No API Key detected in environment variables.");
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
