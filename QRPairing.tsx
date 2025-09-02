import { useEffect, useRef, useState } from 'react';
import { renderQR, scanQRFromVideo, startVideo } from './qr';
import { useRtcAndMesh } from './store';
import { useToast } from './Toast';

export default function QRPairing() {
  const {
    useStun,
    setUseStun,
    createOffer,
    acceptOfferAndCreateAnswer,
    acceptAnswer,
    offerJson,
    answerJson,
    status,
    log,
  } = useRtcAndMesh();
  const offerCanvasRef = useRef<HTMLCanvasElement>(null);
  const answerCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scannerOn, setScannerOn] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [canReadClipboard, setCanReadClipboard] = useState(true);
  const [canWriteClipboard, setCanWriteClipboard] = useState(true);
  const toast = useToast();

  useEffect(() => {
    if (offerJson && offerCanvasRef.current)
      renderQR(offerCanvasRef.current, offerJson);
  }, [offerJson]);
  useEffect(() => {
    if (answerJson && answerCanvasRef.current)
      renderQR(answerCanvasRef.current, answerJson);
  }, [answerJson]);

  async function beginOffer() {
    try {
      await createOffer();
    } catch (e) {
      toast(String((e as any)?.message || e));
    }
  }
  async function scanAndAcceptOffer() {
    if (!videoRef.current) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setScannerOn(true);
    let stream: MediaStream | null = null;
    try {
      stream = await startVideo(videoRef.current);
      const data = await scanQRFromVideo(
        videoRef.current,
        abortRef.current.signal,
      );
      if (data.length > 2048) throw new Error('QR data too large');
      try {
        JSON.parse(data);
      } catch {
        throw new Error('invalid JSON');
      }
      await acceptOfferAndCreateAnswer(data);
    } catch (e) {
      toast(String((e as any)?.message || e));
    } finally {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setScannerOn(false);
    }
  }

  useEffect(() => {
    async function checkClipboardPermissions() {
      if (!navigator.permissions) return;
      try {
        const readPerm = await (navigator.permissions as any).query({
          name: 'clipboard-read',
        });
        if (readPerm.state === 'denied') {
          toast('Clipboard read permission denied. Paste disabled.');
          setCanReadClipboard(false);
        }
        readPerm.onchange = () => {
          const allowed = readPerm.state !== 'denied';
          setCanReadClipboard(allowed);
          if (!allowed)
            toast('Clipboard read permission denied. Paste disabled.');
        };
      } catch {}
      try {
        const writePerm = await (navigator.permissions as any).query({
          name: 'clipboard-write',
        });
        if (writePerm.state === 'denied') {
          toast('Clipboard write permission denied. Copy disabled.');
          setCanWriteClipboard(false);
        }
        writePerm.onchange = () => {
          const allowed = writePerm.state !== 'denied';
          setCanWriteClipboard(allowed);
          if (!allowed)
            toast('Clipboard write permission denied. Copy disabled.');
        };
      } catch {}
    }
    checkClipboardPermissions();
  }, []);
  async function scanAndAcceptAnswer() {
    if (!videoRef.current) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setScannerOn(true);
    let stream: MediaStream | null = null;
    try {
      stream = await startVideo(videoRef.current);
      const data = await scanQRFromVideo(
        videoRef.current,
        abortRef.current.signal,
      );
      if (data.length > 2048) throw new Error('QR data too large');
      try {
        JSON.parse(data);
      } catch {
        throw new Error('invalid JSON');
      }
      await acceptAnswer(data);
    } catch (e) {
      toast(String((e as any)?.message || e));
    } finally {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setScannerOn(false);
    }
  }

  return (
    <div className="row">
      <div className="col card">
        <h2>Step 1: Create Offer (Device A)</h2>
        <label>
          <input
            type="checkbox"
            checked={useStun}
            onChange={(e) => setUseStun(e.target.checked)}
          />{' '}
          Use STUN (requires internet)
        </label>
        <div className="row">
          <button
            onClick={beginOffer}
            title="Create an SDP offer and render as QR"
          >
            Create Offer
          </button>
          <button
            onClick={() => {
              if (offerJson && canWriteClipboard)
                navigator.clipboard.writeText(offerJson);
            }}
            data-inert={!offerJson || !canWriteClipboard}
            title={
              offerJson
                ? canWriteClipboard
                  ? 'Copy offer JSON'
                  : 'Clipboard write permission denied'
                : 'Create an offer first'
            }
          >
            Copy Offer
          </button>
        </div>
        <canvas
          ref={offerCanvasRef}
          style={{ marginTop: 12 }}
          aria-label="Offer QR"
        />
        <p className="small">Offer JSON length: {offerJson.length}</p>

        <h3>Paste Remote Answer</h3>
        <PasteArea
          placeholder="Paste answer JSON here"
          onPasteJSON={acceptAnswer}
          canReadClipboard={canReadClipboard}
        />
        <div className="row">
          <button
            onClick={scanAndAcceptAnswer}
            title="Scan answer QR from Device B"
          >
            Scan Answer QR
          </button>
        </div>
      </div>

      <div className="col card">
        <h2>Step 2: Accept Offer (Device B)</h2>
        <PasteArea
          placeholder="Paste offer JSON here"
          onPasteJSON={acceptOfferAndCreateAnswer}
          canReadClipboard={canReadClipboard}
        />
        <div className="row">
          <button
            onClick={scanAndAcceptOffer}
            title="Scan offer QR from Device A"
          >
            Scan Offer QR
          </button>
          <button
            onClick={() => {
              if (answerJson && canWriteClipboard)
                navigator.clipboard.writeText(answerJson);
            }}
            data-inert={!answerJson || !canWriteClipboard}
            title={
              answerJson
                ? canWriteClipboard
                  ? 'Copy answer JSON'
                  : 'Clipboard write permission denied'
                : 'Scan or paste an offer first'
            }
          >
            Copy Answer
          </button>
        </div>
        <canvas
          ref={answerCanvasRef}
          style={{ marginTop: 12 }}
          aria-label="Answer QR"
        />
        <p className="small">Answer JSON length: {answerJson.length}</p>
      </div>

      <div className="col card">
        <h2>Status</h2>
        <p>
          <b>{status}</b>
        </p>
        <video
          ref={videoRef}
          style={{ width: '100%', display: scannerOn ? 'block' : 'none' }}
          muted
          playsInline
        ></video>
        <h3>Event Log</h3>
        <ul>
          {log.map((l, i) => (
            <li key={i} className="small">
              {l}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PasteArea({
  placeholder,
  onPasteJSON,
  canReadClipboard,
}: {
  placeholder: string;
  onPasteJSON: (json: string) => Promise<any>;
  canReadClipboard: boolean;
}) {
  const [val, setVal] = useState('');
  const toast = useToast();
  async function handle() {
    try {
      JSON.parse(val);
    } catch {
      toast('Not valid JSON');
      return;
    }
    await onPasteJSON(val);
    setVal('');
  }
  return (
    <div>
      <textarea
        rows={6}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={handle} title="Accept JSON">
          Accept
        </button>
        <button
          data-inert={!canReadClipboard}
          onClick={async () => {
            if (!canReadClipboard) return;
            try {
              const t = await navigator.clipboard.readText();
              setVal(t);
            } catch (e) {
              toast('Clipboard not accessible');
            }
          }}
          title={
            canReadClipboard
              ? 'Paste from clipboard'
              : 'Clipboard read permission denied'
          }
        >
          Paste
        </button>
        <button onClick={() => setVal('')} title="Clear">
          Clear
        </button>
      </div>
    </div>
  );
}
