
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Simplified Polyfill for process.env in browser contexts
// This ensures that `window.process` and `window.process.env` objects exist.
// For Vercel deployments of static sites (without a framework like Next.js or Vite
// configured to perform string replacement), environment variables prefixed with
// NEXT_PUBLIC_ are expected to be injected by Vercel's build process during compilation.
// If you are still facing issues, please check Vercel's build logs to confirm
// that environment variables are indeed being made available to the client-side bundle.
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
