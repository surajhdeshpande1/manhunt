import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/base.css';
import './lib/viewport';
import App from './App';
import { SessionProvider } from './lib/session';
import { ToastProvider } from './components/ui';

// Keep installed phones on the newest version: check for an update on launch and whenever the app comes
// back to the foreground. When a new version takes over, reload straight away during the opening film,
// otherwise wait until the app is in the background so nobody is yanked out of a match.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let pending = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install, nothing old to replace
    if (performance.now() < 9000) location.reload();
    else pending = true;
  });
  const check = () => navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pending) location.reload();
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('load', check);
  setInterval(check, 10 * 60e3);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
