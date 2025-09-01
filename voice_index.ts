export type VoiceWorkerCmd =
  | { type: 'init'; modelPath: string }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'transcribeBlob'; blob: Blob };

export type VoiceWorkerEvt =
  | { type: 'status'; status: string }
  | { type: 'partial'; text: string }
  | { type: 'final'; text: string }
  | { type: 'error'; error: string };

export class VoiceClient {
  private worker: Worker;
  private listeners = new Set<(e: VoiceWorkerEvt) => void>();

  constructor() {
    this.worker = new Worker(new URL('./voice_worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => {
      const e = ev.data as VoiceWorkerEvt;
      this.listeners.forEach((l) => l(e));
    };
  }

  on(fn: (e: VoiceWorkerEvt) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  post(cmd: VoiceWorkerCmd) { this.worker.postMessage(cmd); }
  dispose() {
    this.worker.terminate();
    this.listeners.clear();
  }
}
