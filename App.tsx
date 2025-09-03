import { useState } from 'react';
import QRPairing from './QRPairing';
import AudioPairing from './AudioPairing';
import Chat from './Chat';
import VoicePanel from './VoicePanel';
import Diagnostics from './Diagnostics';
import FileTransfer from './FileTransfer';
const version = import.meta.env.VITE_APP_VERSION;

export default function App() {
  const [tab, setTab] = useState<
    'connect' | 'audio' | 'voice' | 'chat' | 'files' | 'diagnostics'
  >('connect');
  const tabs = [
    { key: 'connect', label: 'QR Connect' },
    { key: 'audio', label: 'Audio Connect' },
    { key: 'voice', label: 'Voice' },
    { key: 'chat', label: 'Chat' },
    { key: 'files', label: 'Files' },
    { key: 'diagnostics', label: 'Diagnostics' },
  ] as const;
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 16 }}>
      <h1>Sovereign Voice Mesh v{version}</h1>
      <div className="row" style={{ gap: 8, marginBottom: 16 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => setTab(t.key)}
            title={tab === t.key ? 'Current tab' : `Switch to ${t.label}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'connect' && <QRPairing />}
      {tab === 'audio' && <AudioPairing />}
      {tab === 'voice' && <VoicePanel />}
      {tab === 'chat' && <Chat />}
      {tab === 'files' && <FileTransfer />}
      {tab === 'diagnostics' && <Diagnostics />}
      <hr />
      <p className="small">
        No hard-disabled controls. If a precondition isn’t met, buttons remain
        clickable and explain what’s missing.
      </p>
    </div>
  );
}
