import { useRtcAndMesh } from './store';
import { useState } from 'react';
import DOMPurify from 'dompurify';

export default function Chat(){
  const { sendMesh, lastMsg, status } = useRtcAndMesh();
  const [text, setText] = useState('');

  async function send(){
    if (!text.trim()) { alert('Enter a message'); return; }
    const clean = DOMPurify.sanitize(text);
    sendMesh({ text: clean });
    setText('');
  }

  return (
    <div className="card">
      <h2>Chat</h2>
      {status !== 'connected' && <div className="small">Status: {status}</div>}
      <div className="row">
        <input value={text} onChange={e=>setText(e.target.value)} placeholder="Message" />
        <button onClick={send} title="Send message over DataChannel">Send</button>
      </div>
      <div style={{marginTop:12}}>
        <div className="small">Last incoming:</div>
        <pre style={{whiteSpace:'pre-wrap'}}>{
          lastMsg ? DOMPurify.sanitize(
            lastMsg.payload?.text ?? JSON.stringify(lastMsg, null, 2)
          ) : 'None yet'
        }</pre>
      </div>
    </div>
  );
}
