import { useRtcAndMesh } from './store';
import { useState } from 'react';

export default function Chat() {
  const { sendMesh, messages, addMessage, clearMessages, status } =
    useRtcAndMesh();
  const [text, setText] = useState('');

  async function send() {
    if (!text.trim()) {
      alert('Enter a message');
      return;
    }
    try {
      // Send raw text; React will escape content when rendering.
      await sendMesh({ text });
      addMessage({ text, direction: 'outgoing', timestamp: Date.now() });
      setText('');
    } catch (e) {
      alert('Send failed');
    }
  }

  function onClear() {
    clearMessages();
  }

  return (
    <div className="card">
      <h2>Chat</h2>
      {status !== 'connected' && <div className="small">Status: {status}</div>}
      <div className="row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message"
          aria-label="Chat message"
        />
        <button
          onClick={send}
          title="Send message over DataChannel"
          aria-label="Send message"
        >
          Send
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        <div className="small">Messages:</div>
        <div
          style={{
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid #ccc',
            padding: 4,
          }}
        >
          {messages.length
            ? messages.map((m, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div className="small">
                    {new Date(m.timestamp).toLocaleTimeString()}{' '}
                    {m.direction === 'outgoing' ? '→' : '←'}
                  </div>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>
                    {m.text}
                  </pre>
                </div>
              ))
            : 'None yet'}
        </div>
        {messages.length > 0 && (
          <button
            onClick={onClear}
            title="Clear chat history"
            aria-label="Clear chat history"
            style={{ marginTop: 8 }}
          >
            Clear history
          </button>
        )}
      </div>
    </div>
  );
}
