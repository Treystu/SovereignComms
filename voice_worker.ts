// Whisper speech-to-text worker powered by @xenova/transformers
// Receives audio blobs from the main thread and returns transcription results.

type Cmd = import('./voice_index').VoiceWorkerCmd;

const MODEL_ID = 'Xenova/whisper-tiny.en';
let running = false;
let transcriber: any = null;
let controller: AbortController | null = null;

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

self.onmessage = async (ev) => {
  const cmd = ev.data as Cmd;
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
      controller?.abort();
      controller = null;
      try {
        transcriber?.dispose?.();
      } catch (e) {
        // ignore
      }
      transcriber = null;
      postMessage({ type: 'status', status: 'disposed' });
      self.close();
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
      controller = new AbortController();
      const result = await transcriber(cmd.blob, { signal: controller.signal });
      controller = null;
      const text = typeof result?.text === 'string' ? result.text : '';
      postMessage({ type: 'final', text });
      return;
    }
  } catch (err) {
    postMessage({ type: 'error', error: String((err as any)?.message || err) });
  }
};
