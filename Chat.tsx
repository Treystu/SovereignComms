import { useRtcAndMesh } from './store';
import { useState, useEffect } from 'react';
import type { Message as MeshMessage } from './Mesh';

type Message = { direction: 'out'; payload: any } | ({ direction: 'in' } & MeshMessage);

export default function Chat(){
  const { sendMesh, lastMsg } = useRtcAndMesh();
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (lastMsg) {
      setMessages(m => [...m, { direction: 'in', ...lastMsg }]);
    }
  }, [lastMsg]);

  async function send(){
    if (!text.trim()) { alert('Enter a message'); return; }
    const payload = { text };
    sendMesh(payload);
    setMessages(m => [...m, { direction: 'out', payload }]);
    setText('');
  }

  return (
    <div className="card">
      <h2>Chat</h2>
      <div className="row">
        <input value={text} onChange={e=>setText(e.target.value)} placeholder="Message" />
        <button onClick={send} title="Send message over DataChannel">Send</button>
      </div>
      <div style={{marginTop:12}}>
        <div className="small">Messages:</div>
        {messages.length ? (
          <ul>
            {messages.map((m, i) => (
              <li key={('id' in m && m.id) ? m.id : i}>
                <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(m, null, 2)}</pre>
              </li>
            ))}
          </ul>
        ) : (
          <div className="small">None yet</div>
        )}
      </div>
    </div>
  );
}
