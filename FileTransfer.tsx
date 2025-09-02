import { useState } from 'react';
import { useRtcAndMesh } from './store';

export default function FileTransfer() {
  const { sendFile, status } = useRtcAndMesh();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);

  async function onSend() {
    if (!file) {
      alert('Select a file');
      return;
    }
    setProgress(0);
    await sendFile(file, (sent, total) => {
      setProgress(Math.round((sent / total) * 100));
    });
  }

  return (
    <div className="card">
      <h2>File Transfer</h2>
      {status !== 'connected' && <div className="small">Status: {status}</div>}
      <div className="row" style={{ alignItems: 'center', gap: 8 }}>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
          aria-label="Select file"
        />
        <button onClick={onSend} disabled={!file} aria-label="Send file">
          Send
        </button>
      </div>
      {progress > 0 && (
        <div className="small" style={{ marginTop: 8 }}>
          Progress: {progress}%
        </div>
      )}
    </div>
  );
}
