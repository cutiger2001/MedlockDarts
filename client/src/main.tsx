import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

try {
  // Signal that the module loaded successfully
  const loadEl = document.getElementById('loading-msg');
  if (loadEl) {
    const p = document.createElement('p');
    p.style.fontSize = '0.8rem';
    p.style.color = '#666';
    p.textContent = 'JS loaded, mounting React...';
    loadEl.appendChild(p);
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (err: any) {
  const el = document.getElementById('error-msg') || document.getElementById('root');
  if (el) {
    el.style.display = 'block';
    el.style.color = 'red';
    el.style.padding = '20px';
    el.textContent = 'React Error: ' + (err?.message || String(err)) + '\n' + (err?.stack || '');
  }
}
