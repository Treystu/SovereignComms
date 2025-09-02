/// <reference lib="webworker" />

// Very small network-first SW that caches same-origin GET responses.
export {};

declare const self: ServiceWorkerGlobalScope;

const CACHE = 'svm-cache-v1';

// Models are large and may not always be present. Cache them individually so
// the install step does not fail if a model is missing.
const MODEL_PATHS = ['/models/ggml-base.en.bin'];
const PRECACHE: string[] = [];

self.addEventListener('install', (e: ExtendableEvent) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      for (const path of MODEL_PATHS) {
        try {
          await cache.add(path);
        } catch {
          // Ignore missing model files so SW installation succeeds.
        }
      }
    })(),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e: ExtendableEvent) => {
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

self.addEventListener('fetch', (e: FetchEvent) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const cacheable =
    /\.(?:js|css|html|svg|png|json|webmanifest)$/.test(url.pathname) ||
    MODEL_PATHS.includes(url.pathname);
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
