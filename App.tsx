import { useState } from 'react';
import QRPairing from './QRPairing';
import Chat from './Chat';
import VoicePanel from './VoicePanel';
import Diagnostics from './Diagnostics';
const version = import.meta.env.VITE_APP_VERSION;

export default function App() {
  const [tab, setTab] = useState<'connect'|'voice'|'chat'|'diagnostics'>('connect');
  const tabs = [
    { key: 'connect', label: 'Connect' },
    { key: 'voice', label: 'Voice' },
    { key: 'chat', label: 'Chat' },
    { key: 'diagnostics', label: 'Diagnostics' },
  ] as const;
  return (
    <div style={{maxWidth:1200, margin:'0 auto', padding:16}}>
      <h1>Sovereign Voice Mesh v{version}</h1>
      <div className="row" style={{gap:8, marginBottom:16}}>
        {tabs.map(t => (
          <button
            key={t.key}
            aria-current={tab===t.key ? 'page' : undefined}
            onClick={() => setTab(t.key)}
            title={tab===t.key ? 'Current tab' : `Switch to ${t.label}`}
          >{t.label}</button>
        ))}
      </div>
      {tab==='connect' && <QRPairing />}
      {tab==='voice' && <VoicePanel />}
      {tab==='chat' && <Chat />}
      {tab==='diagnostics' && <Diagnostics />}
      <hr/>
      <p className="small">No hard-disabled controls. If a precondition isn’t met, buttons remain clickable and explain what’s missing.</p>
    </div>
  );
}
