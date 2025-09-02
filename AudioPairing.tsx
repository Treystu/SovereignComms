import { useEffect, useRef, useState } from 'react';
import { playAudioData, listenForAudioData } from './audio';
import { useRtcAndMesh } from './store';

export default function AudioPairing() {
  const {
    createOffer,
    acceptOfferAndCreateAnswer,
    acceptAnswer,
    offerJson,
    answerJson,
    status,
    log,
    error,
    clearError,
  } = useRtcAndMesh();
  const [listening, setListening] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (error) {
      alert(error);
      clearError();
    }
  }, [error, clearError]);

  async function listen(kind: 'offer' | 'answer') {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setListening(true);
    try {
      const data = await listenForAudioData(abortRef.current.signal);
      if (kind === 'offer') await acceptOfferAndCreateAnswer(data);
      else await acceptAnswer(data);
    } catch (e) {
      alert(String((e as any)?.message || e));
    } finally {
      setListening(false);
    }
  }

  return (
    <div className="row">
      <div className="col card">
        <h2>Device A</h2>
        <div className="row">
          <button
            onClick={async () => {
              await createOffer();
              if (offerJson) await playAudioData(offerJson);
            }}
            title="Create offer and play audio"
          >
            Play Offer Audio
          </button>
          <button
            onClick={() => listen('answer')}
            title="Listen for answer audio"
          >
            Listen for Answer
          </button>
        </div>
        <p className="small">Offer length: {offerJson.length}</p>
        <p className="small">Answer length: {answerJson.length}</p>
      </div>

      <div className="col card">
        <h2>Device B</h2>
        <div className="row">
          <button
            onClick={() => listen('offer')}
            title="Listen for offer audio"
          >
            Listen for Offer
          </button>
          <button
            onClick={async () => {
              if (answerJson) await playAudioData(answerJson);
            }}
            data-inert={!answerJson}
            title={answerJson ? 'Play answer audio' : 'No answer yet'}
          >
            Play Answer Audio
          </button>
        </div>
      </div>

      <div className="col card">
        <h2>Status</h2>
        <p>
          <b>{status}</b>
        </p>
        {listening && (
          <button
            onClick={() => {
              abortRef.current?.abort();
            }}
            title="Cancel listening"
          >
            Cancel
          </button>
        )}
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
