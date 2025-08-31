import { useRtcAndMesh } from './store';
import { useState } from 'react';

export default function Chat(){
  const { sendMesh, lastMsg } = useRtcAndMesh();
  const [text, setText] = useState('');

  async function send(){
    if (!text.trim()) { alert('Enter a message'); return; }
    try {
      sendMesh({ text });
      setText('');
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="card">
      <h2>Chat</h2>
      <div className="row">
        <input value={text} onChange={e=>setText(e.target.value)} placeholder="Message" />
        <button onClick={send} title="Send message over DataChannel">Send</button>
      </div>
      <div style={{marginTop:12}}>
        <div className="small">Last incoming:</div>
        <pre style={{whiteSpace:'pre-wrap'}}>{lastMsg? JSON.stringify(lastMsg, null, 2): 'None yet'}</pre>
      </div>
    </div>
  );
}
