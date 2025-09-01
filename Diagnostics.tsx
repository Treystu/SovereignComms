import { useEffect, useState } from 'react';
import { getLogLines, downloadLogs } from './logger';

export default function Diagnostics() {
  const [swStatus, setSwStatus] = useState('checking');
  const [cacheCount, setCacheCount] = useState<number | null>(null);
  const [netInfo, setNetInfo] = useState<{
    type?: string;
    effectiveType?: string;
    rtt?: number;
    downlink?: number;
  }>({});
  const [showLogs, setShowLogs] = useState(false);

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
          const counts = await Promise.all(
            keys.map(async (key) => {
              const cache = await caches.open(key);
              const entries = await cache.keys();
              return entries.length;
            }),
          );
          setCacheCount(counts.reduce((a, b) => a + b, 0));
        } catch {
          setCacheCount(0);
        }
      }
    }
    check();
    const conn = (navigator as any).connection;
    if (conn) {
      const update = () =>
        setNetInfo({
          type: conn.type,
          effectiveType: conn.effectiveType,
          rtt: conn.rtt,
          downlink: conn.downlink,
        });
      update();
      conn.addEventListener('change', update);
      return () => conn.removeEventListener('change', update);
    }
  }, []);

  return (
    <div className="card">
      <h2>Diagnostics</h2>
      <ul className="small">
        <li>User Agent: {navigator.userAgent}</li>
        <li>Online: {String(navigator.onLine)}</li>
        <li>Service Worker: {'serviceWorker' in navigator ? 'yes' : 'no'}</li>
        <li>SW Registered: {swStatus}</li>
        <li>
          Cached Resources: {cacheCount === null ? 'checking' : cacheCount}
        </li>
        <li>Network Type: {netInfo.type || 'unknown'}</li>
        <li>Effective Type: {netInfo.effectiveType || 'unknown'}</li>
        <li>Nominal RTT: {netInfo.rtt ?? 'n/a'}</li>
        <li>Downlink (Mbps): {netInfo.downlink ?? 'n/a'}</li>
        <li>Media Devices: {'mediaDevices' in navigator ? 'yes' : 'no'}</li>
        <li>
          Crypto Subtle:{' '}
          {'crypto' in window && 'subtle' in crypto ? 'yes' : 'no'}
        </li>
        <li>Camera Permissions: check browser address bar</li>
      </ul>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button onClick={() => setShowLogs(!showLogs)}>
          {showLogs ? 'Hide Logs' : 'Show Logs'}
        </button>
        <button onClick={downloadLogs}>Download Logs</button>
      </div>
      {showLogs && (
        <pre
          className="small"
          style={{ maxHeight: 200, overflow: 'auto', marginTop: 12 }}
        >
          {getLogLines().join('\n')}
        </pre>
      )}
    </div>
  );
}
