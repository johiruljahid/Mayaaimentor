
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Highly robust Polyfill for process.env in browser contexts
if (typeof window !== 'undefined') {
  const g = window as any;
  g.process = g.process || {};
  g.process.env = {
    ...g.process.env,
    // Attempt to merge from common injection points
    ...(g.importMeta?.env || {}),
    ...(g.VITE_ENV || {})
  };
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
