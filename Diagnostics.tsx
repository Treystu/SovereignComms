import { useRtcAndMesh } from './store';

export default function Diagnostics(){
  const { ttl, setTtl, maxMessageSize, setMaxMessageSize } = useRtcAndMesh();
  return (
    <div className="card">
      <h2>Diagnostics</h2>
      <div className="row" style={{gap:8, marginBottom:12}}>
        <label>TTL <input type="number" value={ttl} onChange={e=>setTtl(Number(e.target.value))} /></label>
        <label>Max Msg Size <input type="number" value={maxMessageSize} onChange={e=>setMaxMessageSize(Number(e.target.value))} /></label>
      </div>
      <ul className="small">
        <li>User Agent: {navigator.userAgent}</li>
        <li>Online: {String(navigator.onLine)}</li>
        <li>Service Worker: {'serviceWorker' in navigator ? 'yes' : 'no'}</li>
        <li>Media Devices: {'mediaDevices' in navigator ? 'yes' : 'no'}</li>
        <li>Crypto Subtle: {'crypto' in window && 'subtle' in crypto ? 'yes' : 'no'}</li>
        <li>Camera Permissions: check browser address bar</li>
      </ul>
    </div>
  );
}
