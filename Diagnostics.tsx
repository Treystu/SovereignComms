export default function Diagnostics(){
  return (
    <div className="card">
      <h2>Diagnostics</h2>
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
