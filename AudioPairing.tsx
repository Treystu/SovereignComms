import { useEffect, useRef, useState } from 'react';
import {
  playAudioData,
  listenForAudioData,
  estimateAudioDuration,
  playCalibrationSamples,
  calibrateBitDuration,
  BIT_DURATION,
} from './audio';
import { useRtcAndMesh } from './store';
import { useToast } from './Toast';

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
  const toast = useToast();
  useEffect(() => {
    if (error) {
      toast(error);
      clearError();
    }
  }, [error, clearError, toast]);
  const [progress, setProgress] = useState(0);
  const progressTimer = useRef<number | null>(null);
  const progressDuration = useRef(0);
  const [bitDuration, setBitDuration] = useState(BIT_DURATION);

  function startProgress(duration: number) {
    progressDuration.current = duration;
    setProgress(0);
    progressTimer.current && clearInterval(progressTimer.current);
    const start = performance.now();
    progressTimer.current = window.setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      const p = Math.min(elapsed / duration, 1);
      setProgress(p);
      if (p >= 1) {
        stopProgress();
      }
    }, 100);
  }

  function stopProgress() {
    if (progressTimer.current !== null) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
    setProgress(0);
  }

  async function listen(kind: 'offer' | 'answer') {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setListening(true);
    startProgress(15); // default timeout for listening
    try {
      const d = await calibrateBitDuration(abortRef.current.signal);
      setBitDuration(d);
      const data = await listenForAudioData(
        abortRef.current.signal,
        undefined,
        d,
      );
      if (kind === 'offer') await acceptOfferAndCreateAnswer(data);
      else await acceptAnswer(data);
    } catch (e) {
      toast(String((e as any)?.message || e));
    } finally {
      stopProgress();
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
              if (offerJson) {
                await playCalibrationSamples();
                await new Promise((r) => setTimeout(r, 500));
                startProgress(
                  estimateAudioDuration(offerJson, bitDuration),
                );
                await playAudioData(offerJson, bitDuration);
                stopProgress();
              }
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
              if (answerJson) {
                await playCalibrationSamples();
                await new Promise((r) => setTimeout(r, 500));
                startProgress(
                  estimateAudioDuration(answerJson, bitDuration),
                );
                await playAudioData(answerJson, bitDuration);
                stopProgress();
              }
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
        <p className="small">Bit duration: {bitDuration.toFixed(3)}s</p>
        {progressTimer.current !== null && (
          <div>
            <progress value={progress} max={1} style={{ width: '100%' }} />
            <p className="small">
              {Math.max(0, progressDuration.current * (1 - progress)).toFixed(
                1,
              )}{' '}
              s remaining
            </p>
          </div>
        )}
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

