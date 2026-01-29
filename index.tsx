
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Robust Polyfill for process.env in browser contexts
if (typeof window !== 'undefined') {
  (window as any).process = (window as any).process || { env: {} };
  const env = (window as any).process.env;
  
  // Unify different API Key sources into process.env.API_KEY
  // This covers Vercel (NEXT_PUBLIC_), window globals (env-config.js), and direct process.env
  const unifiedApiKey = 
    (window as any).GEMINI_API_KEY || 
    env.API_KEY || 
    env.NEXT_PUBLIC_API_KEY || 
    env.Gemini_API_Key_Maya ||
    env.NEXT_PUBLIC_GEMINI_API_KEY;

  env.API_KEY = unifiedApiKey;
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
