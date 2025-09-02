// Registers the basic SW for offline support.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.ts', { type: 'module' })
      .catch(console.error);
  });
}
