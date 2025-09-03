import { useRtcAndMesh } from './store';
import { useState } from 'react';
import { useToast } from './Toast';

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatMessage(text: string) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  html = html.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>',
  );
  return html.replace(/\n/g, '<br/>');
}

export default function Chat() {
  const { sendMesh, messages, addMessage, clearMessages, status } =
    useRtcAndMesh();
  const [text, setText] = useState('');
  const toast = useToast();

  async function send() {
    if (!text.trim()) {
      toast('Enter a message');
      return;
    }
    try {
      // Send raw text; React will escape content when rendering.
      await sendMesh({ text });
      addMessage({ text, direction: 'outgoing', timestamp: Date.now() });
      setText('');
    } catch (e) {
      toast('Send failed');
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
                  <div
                    className="small"
                    style={{ whiteSpace: 'pre-wrap' }}
                    dangerouslySetInnerHTML={{ __html: formatMessage(m.text) }}
                  />
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
