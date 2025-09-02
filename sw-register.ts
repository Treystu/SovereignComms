// Registers the basic SW for offline support.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Register the compiled service worker rather than the TypeScript source.
    // During development Vite serves the TypeScript module directly, but after
    // build the worker lives at /sw.js. Using the compiled path ensures the
    // worker actually registers in production builds.
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  });
}
