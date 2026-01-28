
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

// Polyfill process for browser environments without overwriting existing data
if (typeof window !== 'undefined') {
  const win = window as any;
  if (!win.process) {
    win.process = { env: {} };
  } else if (!win.process.env) {
    win.process.env = {};
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
