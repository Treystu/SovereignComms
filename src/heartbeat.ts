export type HeartbeatOptions = {
  intervalMs?: number;
  send: (data: string) => void;
  onTimeout: () => void;
  onRtt?: (rtt: number) => void;
};

export class Heartbeat {
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastPing = 0;
  private lastPong = Date.now();
  public rtt = 0;
  private opts: HeartbeatOptions;

  constructor(opts: HeartbeatOptions) {
    this.opts = opts;
    this.intervalMs = opts.intervalMs ?? 5000;
  }

  start() {
    this.stop();
    this.timer = setInterval(() => {
      try {
        this.lastPing = Date.now();
        this.opts.send('ping');
      } catch {}
      if (Date.now() - this.lastPong > this.intervalMs * 2) {
        this.opts.onTimeout();
      }
    }, this.intervalMs);
  }

  stop() {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  handle(data: string | ArrayBuffer): boolean {
    if (typeof data !== 'string') return false;
    if (data === 'ping') {
      try {
        this.opts.send('pong');
      } catch {}
      return true;
    }
    if (data === 'pong') {
      this.lastPong = Date.now();
      this.rtt = this.lastPong - this.lastPing;
      this.opts.onRtt?.(this.rtt);
      return true;
    }
    return false;
  }
}
