
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Simplified Polyfill for process.env in browser contexts
// This ensures that `window.process` and `window.process.env` objects exist.
// For Vercel deployments of static sites without a framework's built-in bundler,
// the API key will now be read from `window.GEMINI_API_KEY` which is injected
// via a custom build command in Vercel.
if (typeof window !== 'undefined') {
  (window as any).process = (window as any).process || { env: {} };
  (window as any).process.env = (window as any).process.env || {};
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