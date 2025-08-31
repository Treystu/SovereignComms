// Very small network-first SW that caches same-origin GET responses.
const CACHE = 'svm-cache-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const cacheable = /\.(?:js|css|html|svg|png|json|webmanifest)$/.test(url.pathname);
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (cacheable) {
        const cc = res.headers.get('Cache-Control') || '';
        if (!/no-store|private/i.test(cc)) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
      }
      return res;
    } catch (err) {
      if (cacheable) {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
      }
      throw err;
    }
  })());
});
