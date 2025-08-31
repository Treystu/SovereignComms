import { useEffect, useRef, useState } from 'react';
import { VoiceClient } from './voice_index';

export default function VoicePanel(){
  const clientRef = useRef<VoiceClient | null>(null);
  const [status, setStatus] = useState('idle');
  const [modelPath, setModelPath] = useState('/models/ggml-base.en.bin');
  const [partials, setPartials] = useState<string[]>([]);
  const [finals, setFinals] = useState<string[]>([]);

  useEffect(()=>{
    clientRef.current = new VoiceClient();
    const off = clientRef.current.on((e)=>{
      if(e.type==='status') setStatus(e.status);
      if(e.type==='partial') setPartials(p=>[e.text, ...p].slice(0,50));
      if(e.type==='final') setFinals(p=>[e.text, ...p].slice(0,200));
      if(e.type==='error') alert(e.error);
    });
    return () => { clientRef.current?.dispose(); off(); };
  },[]);

  async function init(){ clientRef.current?.post({ type:'init', modelPath }); }
  async function start(){ clientRef.current?.post({ type:'start' }); }
  async function stop(){ clientRef.current?.post({ type:'stop' }); }

  return (
    <div className="row">
      <div className="col card">
        <h2>Voice (Local STT)</h2>
        <label>Model path <input value={modelPath} onChange={e=>setModelPath(e.target.value)} /></label>
        <div className="row">
          <button onClick={init} title="Load model (HEAD request)">Init</button>
          <button onClick={start} title="Begin processing">Start</button>
          <button onClick={stop} title="Stop processing">Stop</button>
        </div>
        <p className="small">Status: {status}</p>
        <p className="small">Note: Transcription is stubbed until you add a WASM model/loader. You will see a placeholder partial.</p>
      </div>
      <div className="col card">
        <h3>Partials</h3>
        <ul>{partials.map((t,i)=>(<li key={i} className="small">{t}</li>))}</ul>
      </div>
      <div className="col card">
        <h3>Finals</h3>
        <ul>{finals.map((t,i)=>(<li key={i} className="small">{t}</li>))}</ul>
      </div>
    </div>
  );
}
