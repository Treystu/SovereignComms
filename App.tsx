import { useState } from 'react';
import QRPairing from './QRPairing';
import Chat from './Chat';
import VoicePanel from './VoicePanel';
import Diagnostics from './Diagnostics';
import { VERSION } from './version';

export default function App() {
  const [tab, setTab] = useState<'connect'|'voice'|'chat'|'diagnostics'>('connect');
  const tabs = [
    { key: 'connect', label: 'Connect' },
    { key: 'voice', label: 'Voice' },
    { key: 'chat', label: 'Chat' },
    { key: 'diagnostics', label: 'Diagnostics' },
  ];
  return (
    <div style={{maxWidth:1200, margin:'0 auto', padding:16}}>
      <h1>Sovereign Voice Mesh</h1>
      <p className="small">v{VERSION}</p>
      <div className="row" style={{gap:8, marginBottom:16}}>
        {tabs.map(t => (
          <button key={t.key}
            aria-disabled={tab===t.key}
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
