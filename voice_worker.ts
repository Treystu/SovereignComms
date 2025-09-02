// Whisper speech-to-text worker powered by @xenova/transformers
// Receives audio blobs from the main thread and returns transcription results.

import type { Pipeline } from '@xenova/transformers';
import type { VoiceWorkerCmd } from './voice_index';

const MODEL_ID = 'Xenova/whisper-tiny.en';
let running = false;
let transcriber: Pipeline | null = null;

// Load the model immediately when the worker starts.
(async () => {
  try {
    postMessage({ type: 'status', status: `loading:${MODEL_ID}` });
    const { pipeline } = await import('@xenova/transformers');
    transcriber = await pipeline('automatic-speech-recognition', MODEL_ID);
    postMessage({ type: 'status', status: `model-ready:${MODEL_ID}` });
  } catch (err) {
    postMessage({ type: 'error', error: String((err as any)?.message || err) });
  }
})();

self.onmessage = async (ev: MessageEvent<VoiceWorkerCmd>) => {
  const cmd = ev.data;
  try {
    if (cmd.type === 'start') {
      if (!transcriber) {
        postMessage({ type: 'error', error: 'Model not ready' });
        return;
      }
      running = true;
      postMessage({ type: 'status', status: 'listening' });
      return;
    }
    if (cmd.type === 'stop') {
      running = false;
      postMessage({ type: 'status', status: 'stopped' });
      return;
    }
    if (cmd.type === 'dispose') {
      running = false;
      transcriber = null;
      (self as any).close();
      return;
    }
    if (cmd.type === 'transcribeBlob') {
      if (!running) {
        postMessage({ type: 'error', error: 'Not running' });
        return;
      }
      if (!transcriber) {
        postMessage({ type: 'error', error: 'Model not ready' });
        return;
      }
      // Use the callback_function option to receive streaming partial
      // transcription updates from Transformers.js. Each callback may provide
      // an object with a `text` property representing the current best guess.
      // Forward these to the main thread as `partial` events so the UI can
      // display interim results.
      const result = await transcriber(cmd.blob, {
        callback_function: (data: any) => {
          const partial = typeof data?.text === 'string' ? data.text : '';
          if (partial) {
            postMessage({ type: 'partial', text: partial });
          }
        },
      });
      const text = typeof result?.text === 'string' ? result.text : '';
      postMessage({ type: 'final', text });
      return;
    }
  } catch (err) {
    postMessage({ type: 'error', error: String((err as any)?.message || err) });
  }
};
