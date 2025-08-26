import { useEffect, useRef, useState } from 'react';
import { renderQR, scanQRFromVideo, startVideo } from './qr';
import { useRtcAndMesh } from './store';

export default function QRPairing(){
  const { useStun, setUseStun, createOffer, acceptOfferAndCreateAnswer, acceptAnswer, offerJson, answerJson, status, log } = useRtcAndMesh();
  const offerCanvasRef = useRef<HTMLCanvasElement>(null);
  const answerCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scannerOn, setScannerOn] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(()=>{ if(offerJson && offerCanvasRef.current) renderQR(offerCanvasRef.current, offerJson); }, [offerJson]);
  useEffect(()=>{ if(answerJson && answerCanvasRef.current) renderQR(answerCanvasRef.current, answerJson); }, [answerJson]);

  async function beginOffer(){ await createOffer(); }
  async function scanAndAcceptOffer(){
    if (!videoRef.current) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setScannerOn(true);
    const stream = await startVideo(videoRef.current);
    try {
      const data = await scanQRFromVideo(videoRef.current, abortRef.current.signal);
      await acceptOfferAndCreateAnswer(data);
    } finally {
      stream.getTracks().forEach(t=>t.stop());
      setScannerOn(false);
    }
  }
  async function scanAndAcceptAnswer(){
    if (!videoRef.current) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setScannerOn(true);
    const stream = await startVideo(videoRef.current);
    try {
      const data = await scanQRFromVideo(videoRef.current, abortRef.current.signal);
      await acceptAnswer(data);
    } finally {
      stream.getTracks().forEach(t=>t.stop());
      setScannerOn(false);
    }
  }

  return (
    <div className="row">
      <div className="col card">
        <h2>Step 1: Create Offer (Device A)</h2>
        <label><input type="checkbox" checked={useStun} onChange={e=>setUseStun(e.target.checked)} /> Use STUN (requires internet)</label>
        <div className="row">
          <button onClick={beginOffer} title="Create an SDP offer and render as QR">Create Offer</button>
          <button onClick={()=> navigator.clipboard.writeText(offerJson)} aria-disabled={!offerJson} title={offerJson? 'Copy offer JSON' : 'Create an offer first'}>Copy Offer</button>
        </div>
        <canvas ref={offerCanvasRef} style={{marginTop:12}}/>
        <p className="small">Offer JSON length: {offerJson.length}</p>

        <h3>Paste Remote Answer</h3>
        <PasteArea placeholder="Paste answer JSON here" onPasteJSON={acceptAnswer} />
        <div className="row">
          <button onClick={scanAndAcceptAnswer} title="Scan answer QR from Device B">Scan Answer QR</button>
        </div>
      </div>

      <div className="col card">
        <h2>Step 2: Accept Offer (Device B)</h2>
        <PasteArea placeholder="Paste offer JSON here" onPasteJSON={acceptOfferAndCreateAnswer} />
        <div className="row">
          <button onClick={scanAndAcceptOffer} title="Scan offer QR from Device A">Scan Offer QR</button>
          <button onClick={()=> navigator.clipboard.writeText(answerJson)} aria-disabled={!answerJson} title={answerJson? 'Copy answer JSON' : 'Scan or paste an offer first'}>Copy Answer</button>
        </div>
        <canvas ref={answerCanvasRef} style={{marginTop:12}}/>
        <p className="small">Answer JSON length: {answerJson.length}</p>
      </div>

      <div className="col card">
        <h2>Status</h2>
        <p><b>{status}</b></p>
        <video ref={videoRef} style={{width:'100%', display: scannerOn? 'block':'none'}} muted playsInline></video>
        <h3>Event Log</h3>
        <ul>{log.map((l,i)=>(<li key={i} className="small">{l}</li>))}</ul>
      </div>
    </div>
  );
}

function PasteArea({ placeholder, onPasteJSON }:{ placeholder:string, onPasteJSON:(json:string)=>Promise<any> }){
  const [val, setVal] = useState('');
  async function handle(){
    try{ JSON.parse(val); }catch{ alert('Not valid JSON'); return; }
    await onPasteJSON(val);
    setVal('');
  }
  return (
    <div>
      <textarea rows={6} value={val} onChange={e=>setVal(e.target.value)} placeholder={placeholder}/>
      <div className="row" style={{marginTop:8}}>
        <button onClick={handle} title="Accept JSON">Accept</button>
        <button onClick={async ()=>{ try{ const t=await navigator.clipboard.readText(); setVal(t);}catch(e){alert('Clipboard not accessible');}}} title="Paste from clipboard">Paste</button>
        <button onClick={()=>setVal('')} title="Clear">Clear</button>
      </div>
    </div>
  );
}
