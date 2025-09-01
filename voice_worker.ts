// Whisper speech-to-text worker powered by @xenova/transformers
// Receives audio blobs from the main thread and returns transcription results.

type Cmd = import('./voice_index').VoiceWorkerCmd;

let running = false;
let transcriber: any = null;

self.onmessage = async (ev) => {
  const cmd = ev.data as Cmd;
  try {
    if (cmd.type === 'init') {
      const model = cmd.model || 'Xenova/whisper-tiny.en';
      postMessage({ type: 'status', status: `loading:${model}` });
      const { pipeline } = await import('@xenova/transformers');
      transcriber = await pipeline('automatic-speech-recognition', model);
      postMessage({ type: 'status', status: `model-ready:${model}` });
      return;
    }
    if (cmd.type === 'start') {
      if (!transcriber) {
        postMessage({ type: 'error', error: 'Model not initialized' });
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
    if (cmd.type === 'transcribeBlob') {
      if (!running) {
        postMessage({ type: 'error', error: 'Not running' });
        return;
      }
      if (!transcriber) {
        postMessage({ type: 'error', error: 'Model not initialized' });
        return;
      }
      const result = await transcriber(cmd.blob);
      const text = typeof result?.text === 'string' ? result.text : '';
      postMessage({ type: 'final', text });
      return;
    }
  } catch (err) {
    postMessage({ type: 'error', error: String((err as any)?.message || err) });
  }
};

