// Very small network-first SW that caches same-origin GET responses.
const CACHE = 'svm-cache-v1';
// Pre-cache model assets so voice recognition works offline.
const PRECACHE = [
  '/models/ggml-base.en.bin',
];
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
  })());
  self.skipWaiting();
});
self.addEventListener('activate', (e) => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Serve pre-cached model assets directly from cache.
    if (PRECACHE.includes(url.pathname)) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req);
      if (hit) return hit;
      throw err;
    }
  })());
});
