/* Service worker: makes the app open instantly and survive a dead signal.

   Two caching strategies, because the two kinds of file want opposite things.

   - The shell (HTML, CSS, JS, icons) is cache-first. It changes only on deploy,
     and the build stamps app.css and app.js with a content hash, so a new
     version is a new URL and the old entry is simply never requested again.
   - The data is network-first with a cache fallback. Squads and staff move, so
     a stale answer is worse than a slow one - but a stale answer beats no answer
     when you are stood in a car park with one bar.

   The cache name carries a version. Bumping it evicts everything on activate.
*/

const VERSION = 'lpcmi-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', e => {
  // addAll rejects the whole install if any single request fails, and a missing
  // optional file should not stop the worker taking over.
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;   // fonts, Transfermarkt links

  // Never cache an Access redirect: it would pin a login page in place of the
  // app and leave the user staring at it after they had signed in.
  const fresh = res => {
    if (res.redirected || res.type === 'opaqueredirect' || res.status === 302) return res;
    return res;
  };

  if (url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(VERSION).then(c => c.put(request, copy));
          }
          return fresh(res);
        })
        .catch(() => caches.match(request).then(hit =>
          hit || new Response('{"offline":true}', {
            status: 503, headers: { 'Content-Type': 'application/json' },
          }))));
    return;
  }

  e.respondWith(
    caches.match(request).then(hit => hit || fetch(request).then(res => {
      if (res.ok && !res.redirected) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(request, copy));
      }
      return res;
    })));
});
