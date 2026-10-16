import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global error filter to intercept known Firebase Auth SDK iframe popup assertion error
window.addEventListener('unhandledrejection', (event) => {
  const reasonStr = String(event.reason?.message || event.reason || '');
  if (reasonStr.includes('Pending promise was never set') || reasonStr.includes('auth/popup-closed-by-user') || reasonStr.includes('auth/cancelled-popup-request')) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
});

window.addEventListener('error', (event) => {
  const msg = String(event.message || '');
  if (msg.includes('Pending promise was never set') || msg.includes('auth/popup-closed-by-user') || msg.includes('auth/cancelled-popup-request')) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
});

createRoot(document.getElementById('root')!).render(<App />);
