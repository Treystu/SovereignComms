import { useRtcAndMesh } from './store';
import { useState } from 'react';

export default function Chat() {
  const { sendMesh, lastMsg, peers } = useRtcAndMesh();
  const [text, setText] = useState('');
  const [target, setTarget] = useState('');

  async function send() {
    if (!text.trim()) {
      alert('Enter a message');
      return;
    }
    const targets = target ? [target] : undefined;
    sendMesh({ text }, targets);
    setText('');
  }

  return (
    <div className="card">
      <h2>Chat</h2>
      <div className="row" style={{ gap: 8 }}>
        <select value={target} onChange={e => setTarget(e.target.value)} title="Select peer to send to">
          <option value="">All Peers</option>
          {peers.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Message" />
        <button onClick={send} title="Send message over DataChannel">Send</button>
      </div>
      <div style={{ marginTop: 12 }}>
        <div className="small">Connected peers:</div>
        <ul>{peers.map(p => (<li key={p} className="small">{p}</li>))}</ul>
      </div>
      <div style={{ marginTop: 12 }}>
        <div className="small">Last incoming:</div>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{lastMsg ? JSON.stringify(lastMsg, null, 2) : 'None yet'}</pre>
      </div>
    </div>
  );
}
