// Very small network-first SW that caches same-origin GET responses.
const CACHE = 'svm-cache-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
      return res;
    } catch (err) {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      throw err;
    }
  })());
});
