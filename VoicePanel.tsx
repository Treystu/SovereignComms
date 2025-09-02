import { useEffect, useRef, useState } from 'react';
import { VoiceClient } from './voice_index';
import { useToast } from './Toast';

export default function VoicePanel() {
  const clientRef = useRef<VoiceClient>();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [status, setStatus] = useState('idle');
  const [partials, setPartials] = useState<string[]>([]);
  const [finals, setFinals] = useState<string[]>([]);
  const toast = useToast();

  useEffect(() => {
    const c = new VoiceClient();
    const off = c.on((e) => {
      if (e.type === 'status') setStatus(e.status);
      if (e.type === 'partial') setPartials((p) => [e.text, ...p].slice(0, 50));
      if (e.type === 'final') setFinals((p) => [e.text, ...p].slice(0, 200));
      if (e.type === 'error') toast(e.error);
    });
    clientRef.current = c;
    return () => {
      off();
      c.dispose();
    };
  }, []);

  async function start() {
    if (!recorderRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const rec = new MediaRecorder(stream);
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) {
            clientRef.current?.post({ type: 'transcribeBlob', blob: e.data });
          }
        };
        recorderRef.current = rec;
      } catch (err) {
        toast((err as Error).message);
        return;
      }
    }
    clientRef.current?.post({ type: 'start' });
    recorderRef.current?.start(1000);
  }
  async function stop() {
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current.stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
    }
    clientRef.current?.post({ type: 'stop' });
  }

  return (
    <div className="row">
      <div className="col card">
        <h2>Voice (Local STT)</h2>
        <div className="row">
          <button onClick={start} title="Begin processing">
            Start
          </button>
          <button onClick={stop} title="Stop processing">
            Stop
          </button>
        </div>
        <p className="small">Status: {status}</p>
      </div>
      <div className="col card">
        <h3>Partials</h3>
        <ul>
          {partials.map((t, i) => (
            <li key={i} className="small">
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="col card">
        <h3>Finals</h3>
        <ul>
          {finals.map((t, i) => (
            <li key={i} className="small">
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
