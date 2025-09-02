// Registers the basic SW for offline support.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const url = import.meta.env.DEV ? '/sw.ts' : '/sw.js';
    navigator.serviceWorker
      .register(url, { type: 'module' })
      .catch(console.error);
  });
}
