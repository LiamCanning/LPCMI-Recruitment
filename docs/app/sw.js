/* Service worker: makes the app open instantly and survive a dead signal.

   Three strategies, because the three kinds of file want different things.

   - The HTML shell is NETWORK-FIRST. It used to be cache-first, which pinned
     index.html in the cache: a returning visitor kept an old shell pointing at
     old app.css and app.js hashes, so a deploy could land and they would carry
     on running the previous build with no way to tell. That is exactly the
     "why does it look different / why has nothing changed" bug. The cached
     copy is still there as the offline fallback, it is just never preferred.
   - Hashed assets (app.css?v=…, app.js?v=…) are cache-first and safe to be,
     because a new build is a new URL. The old entry is simply never requested.
   - Data is network-first with a cache fallback. Squads and staff move, so a
     stale answer is worse than a slow one, but a stale answer beats no answer
     when you are stood in a car park with one bar.

   VERSION is rewritten at deploy time with a hash of the shell, so every
   deploy evicts the previous cache on activate.
*/

const VERSION = 'lpcmi-v4';
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

const cacheable = res => res && res.ok && !res.redirected
  && res.type !== 'opaqueredirect' && res.status !== 302;

function networkFirst(request) {
  return fetch(request)
    .then(res => {
      if (cacheable(res)) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(request, copy));
      }
      return res;
    })
    .catch(() => caches.match(request).then(hit => hit
      || caches.match('./index.html')
      || new Response('{"offline":true}', {
        status: 503, headers: { 'Content-Type': 'application/json' },
      })));
}

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;   // fonts, Transfermarkt links

  // The shell and the data both want the network first, for different reasons.
  const isShell = request.mode === 'navigate'
    || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  if (isShell || url.pathname.includes('/data/')) {
    e.respondWith(networkFirst(request));
    return;
  }

  e.respondWith(
    caches.match(request).then(hit => hit || fetch(request).then(res => {
      if (cacheable(res)) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(request, copy));
      }
      return res;
    })));
});
