// MAINTENANCE MODE (loaded into the service worker): the moment this version replaces the old app on a phone, every
// open TAG window reloads onto the notice, including installed apps left open in the background.
let replacing = null; // null = unknown (the worker was restarted between install and activate): reload to be safe
self.addEventListener('install', () => { replacing = !!self.registration.active; });
self.addEventListener('activate', (event) => {
  const claimed = self.clients.claim();
  event.waitUntil(claimed);
  if (replacing === false) return; // first visit: the page already shows the notice
  // Not inside waitUntil on purpose: the reloads are answered by this worker, which only answers once it is
  // active, so holding activation open for them would leave the windows stuck.
  claimed
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then((wins) => wins.forEach((w) => w.navigate(w.url).catch(() => {})));
});
