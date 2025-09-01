// Very small network-first SW that caches same-origin GET responses.
const CACHE = 'svm-cache-v1';
const PRECACHE = ['/models/ggml-base.en.bin'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const cacheable = /\.(?:js|css|html|svg|png|json|webmanifest)$/.test(
    url.pathname,
  );
  e.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (cacheable && res.ok) {
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
    })(),
  );
});
