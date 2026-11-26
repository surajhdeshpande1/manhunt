import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/archivo/wdth.css';
import { Maintenance } from './Maintenance';

// MAINTENANCE MODE: every visitor, on every page, sees one message and nothing else (no sign-in, no matches, no demo).
// Installed phones still check for a new version on launch, when the app comes back to the foreground and every
// 10 minutes. When the full app is back, its new version takes over and this page reloads straight into it.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
  const check = () => navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('load', check);
  setInterval(check, 10 * 60e3);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Maintenance />
  </React.StrictMode>,
);
