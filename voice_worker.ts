// Safe stub for Whisper-WASM integration. Keeps API stable.
type Cmd = import('./voice_index').VoiceWorkerCmd;

let running = false;
let initialized = false;
let modelPath = '';

self.onmessage = async (ev) => {
  const cmd = ev.data as Cmd;
  try {
    if (cmd.type === 'init') {
      modelPath = cmd.modelPath;
      try {
        const res = await fetch(modelPath, { method: 'HEAD' });
        if (!res.ok) throw new Error(`Model not accessible: ${res.status}`);
        initialized = true;
        postMessage({ type: 'status', status: `model-ready:${modelPath}` });
      } catch (e) {
        postMessage({ type: 'error', error: `Model not found at ${modelPath}` });
      }
      return;
    }
    if (cmd.type === 'start') {
      if (!initialized) { postMessage({ type: 'error', error: 'Model not initialized' }); return; }
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
      if (!initialized) { postMessage({ type: 'error', error: 'Model not initialized' }); return; }
      if (!running) { postMessage({ type: 'error', error: 'Not running' }); return; }
      postMessage({ type: 'partial', text: '[transcription pending - model integration required]' });
      postMessage({ type: 'final', text: '' });
      return;
    }
  } catch (err) {
    postMessage({ type: 'error', error: String((err as any)?.message || err) });
  }
};
