import { useEffect, useState } from 'react';

export default function Diagnostics(){
  const [swStatus, setSwStatus] = useState('checking');
  const [cacheCount, setCacheCount] = useState<number | null>(null);

  useEffect(() => {
    async function check() {
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          setSwStatus(reg ? 'registered' : 'not registered');
        } catch {
          setSwStatus('not registered');
        }
      } else {
        setSwStatus('unsupported');
      }

      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          const counts = await Promise.all(keys.map(async key => {
            const cache = await caches.open(key);
            const entries = await cache.keys();
            return entries.length;
          }));
          setCacheCount(counts.reduce((a, b) => a + b, 0));
        } catch {
          setCacheCount(0);
        }
      }
    }

    check();
  }, []);

  return (
    <div className="card">
      <h2>Diagnostics</h2>
      <ul className="small">
        <li>User Agent: {navigator.userAgent}</li>
        <li>Online: {String(navigator.onLine)}</li>
        <li>Service Worker: {'serviceWorker' in navigator ? 'yes' : 'no'}</li>
        <li>SW Registered: {swStatus}</li>
        <li>Cached Resources: {cacheCount === null ? 'checking' : cacheCount}</li>
        <li>Media Devices: {'mediaDevices' in navigator ? 'yes' : 'no'}</li>
        <li>Crypto Subtle: {'crypto' in window && 'subtle' in crypto ? 'yes' : 'no'}</li>
        <li>Camera Permissions: check browser address bar</li>
      </ul>
    </div>
  );
}
