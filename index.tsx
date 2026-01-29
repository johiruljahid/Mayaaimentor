
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Robust Polyfill for process.env across all platforms
if (typeof window !== 'undefined') {
  // 1. Initialize process.env if it doesn't exist
  (window as any).process = (window as any).process || { env: {} };
  const env = (window as any).process.env;
  
  // 2. Map all possible API key locations to process.env.API_KEY
  // This handles Vercel (NEXT_PUBLIC_), Firebase (window globals), and manual overrides
  const unifiedKey = 
    (window as any).GEMINI_API_KEY || 
    (window as any).NEXT_PUBLIC_API_KEY ||
    env.API_KEY || 
    env.NEXT_PUBLIC_API_KEY || 
    env.Gemini_API_Key_Maya ||
    env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (unifiedKey) {
    env.API_KEY = unifiedKey;
    // Also set globally for easier debugging
    (window as any).GEMINI_API_KEY = unifiedKey;
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
