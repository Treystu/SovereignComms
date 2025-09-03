import { useEffect, useState } from 'react';
import { getLogLines, downloadLogs, uploadLogs } from './logger';
import { useRtcAndMesh } from './store';

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
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const {
    stunUrl,
    setStunUrl,
    turnUrl,
    setTurnUrl,
    rtcStats,
    wsStats,
    localFingerprint,
    remoteFingerprint,
  } = useRtcAndMesh();

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
        <li>Local FP: {localFingerprint || 'n/a'}</li>
        <li>Remote FP: {remoteFingerprint || 'n/a'}</li>
        <li>WS URL: {(import.meta as any).env?.VITE_WS_URL || 'n/a'}</li>
        <li>Camera Permissions: check browser address bar</li>
      </ul>

      <h3 style={{ marginTop: 12 }}>RTC Configuration</h3>
      <label className="row" style={{ alignItems: 'center', gap: 4 }}>
        STUN URL:
        <input
          type="text"
          value={stunUrl}
          onChange={(e) => setStunUrl(e.target.value)}
          placeholder="stun:stun.l.google.com:19302"
        />
      </label>
      <label className="row" style={{ alignItems: 'center', gap: 4 }}>
        TURN URL:
        <input
          type="text"
          value={turnUrl}
          onChange={(e) => setTurnUrl(e.target.value)}
          placeholder="turn:turn.example.com:3478"
        />
      </label>

      <h3 style={{ marginTop: 12 }}>Connection Stats</h3>
      <ul className="small">
        <li>RTC ICE: {rtcStats.ice || 'n/a'}</li>
        <li>RTC DC: {rtcStats.dc || 'n/a'}</li>
        <li>RTC RTT: {rtcStats.rtt ?? 'n/a'}</li>
        <li>WS ICE: {wsStats.ice || 'n/a'}</li>
        <li>WS DC: {wsStats.dc || 'n/a'}</li>
        <li>WS RTT: {wsStats.rtt ?? 'n/a'}</li>
      </ul>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button onClick={() => setShowLogs(!showLogs)}>
          {showLogs ? 'Hide Logs' : 'Show Logs'}
        </button>
        <button onClick={downloadLogs}>Download Logs</button>
        <button
          onClick={async () => {
            setUploading(true);
            setUploadMessage(null);
            try {
              const ok = await uploadLogs();
              setUploadMessage(
                ok ? 'Logs uploaded successfully' : 'Log upload failed',
              );
            } catch {
              setUploadMessage('Log upload failed');
            } finally {
              setUploading(false);
            }
          }}
          disabled={uploading}
        >
          {uploading ? 'Uploading...' : 'Upload Logs'}
        </button>
      </div>
      {uploadMessage && (
        <p className="small" style={{ marginTop: 4 }}>
          {uploadMessage}
        </p>
      )}
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
