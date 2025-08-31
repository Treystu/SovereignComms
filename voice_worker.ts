// Safe stub for Whisper-WASM integration. Keeps API stable.
type Cmd = import('./voice_index').VoiceWorkerCmd;

declare const self: DedicatedWorkerGlobalScope;

let running = false;
let initialized = false;
let modelPath = '';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function headWithRetries(url: string, attempts = 3, delayMs = 1000) {
  let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return;
      lastErr = new Error(`Model not accessible: ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < attempts - 1) await delay(delayMs);
  }
  throw lastErr;
}

self.onmessage = async (ev) => {
  const cmd = ev.data as Cmd;
  try {
    if (cmd.type === 'init') {
      modelPath = cmd.modelPath;
      try {
        await headWithRetries(modelPath);
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
