import { RtcEvents } from './RtcSession';
import { log } from './logger';
import { Heartbeat } from './src/heartbeat';

export type WsOptions = RtcEvents & {
  url: string;
  heartbeatMs?: number;
  signal?: AbortSignal;
  reconnect?: boolean;
  reconnectMinDelayMs?: number;
  reconnectMaxDelayMs?: number;
  /** Maximum WebSocket bufferedAmount before queuing */
  maxBufferedAmount?: number;
};

export class WebSocketSession {
  public events: RtcEvents;
  private ws?: WebSocket;
  private hb: Heartbeat;
  private url: string;
  private outbox: (string | ArrayBuffer | ArrayBufferView)[] = [];
  private readonly maxOutboxSize = 100;
  private shouldReconnect: boolean;
  private reconnectDelay: number;
  private readonly minDelay: number;
  private readonly maxDelay: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abortSignal?: AbortSignal;
  private abortHandler?: () => void;
  private flushTimer?: ReturnType<typeof setInterval>;
  private readonly maxBufferedAmount: number;
  private readonly handleOnline = () => {
    log('ws', 'online');
    if (this.shouldReconnect && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
      this.timer && clearTimeout(this.timer);
      this.timer = null;
      this.connect();
    }
  };
  private readonly handleOffline = () => {
    log('ws', 'offline');
    this.ws?.close();
  };

  constructor(opts: WsOptions) {
    this.events = opts;
    this.url = opts.url;
    const interval = opts.heartbeatMs ?? 5000;
    this.shouldReconnect = !!opts.reconnect;
    this.reconnectDelay = opts.reconnectMinDelayMs ?? 1000;
    this.minDelay = this.reconnectDelay;
    this.maxDelay = opts.reconnectMaxDelayMs ?? 16000;
    this.maxBufferedAmount = opts.maxBufferedAmount ?? 64 * 1024;
    log('ws', 'WebSocketSession created ' + this.url);
    this.hb = new Heartbeat({
      intervalMs: interval,
      send: (msg) => {
        try {
          this.send(msg);
        } catch {}
      },
      onTimeout: () => {
        this.events.onClose?.('timeout');
        this.close();
      },
      onRtt: (rtt) => {
        this.events.onState?.({
          ice: 'ws',
          dc: this.ws?.readyState === WebSocket.OPEN ? 'open' : 'closed',
          rtt,
        });
      },
    });
    this.abortSignal = opts.signal;
    this.abortHandler = () => {
      this.events.onClose?.('aborted');
      this.close();
    };
    this.abortSignal?.addEventListener('abort', this.abortHandler);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
    this.connect();
  }

  private connect() {
    log('ws', 'connecting');
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      log('ws', 'open');
      this.hb.start();
      this.events.onOpen?.();
      this.events.onState?.({ ice: 'ws', dc: 'open', rtt: this.hb.rtt });
      this.flushOutbox();
      this.reconnectDelay = this.minDelay;
    };
    this.ws.onclose = (e) => {
      const reason = e.reason || 'ws-close';
      const msg = `close:${e.code}${reason ? ' ' + reason : ''}`;
      log('ws', msg);
      this.hb.stop();
      this.events.onClose?.(reason);
      this.events.onState?.({ ice: 'ws', dc: 'closed', rtt: this.hb.rtt });
      if (this.shouldReconnect) {
        this.timer && clearTimeout(this.timer);
        const jitter = Math.random() * 0.3 * this.reconnectDelay;
        const delay = this.reconnectDelay + jitter;
        this.timer = setTimeout(() => {
          this.timer = null;
          this.connect();
        }, delay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
      }
    };
    this.ws.onerror = (e) => {
      const err =
        e instanceof ErrorEvent
          ? e.message
          : (e as any)?.message || (e as any)?.reason || e.type || 'error';
      log('ws', 'error:' + err);
      this.events.onError?.(err);
    };
    this.ws.onmessage = (m) => {
      const data = m.data;
      log('ws', 'message:' + (typeof data === 'string' ? data : '[binary]'));
      if (this.hb.handle(data)) return;
      this.events.onMessage?.(data);
    };
  }

  send(data: string | ArrayBuffer | ArrayBufferView) {
    if (
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN ||
      this.ws.bufferedAmount > this.maxBufferedAmount ||
      this.outbox.length > 0
    ) {
      log('ws', 'queue msg');
      this.outbox.push(data);
      if (this.outbox.length > this.maxOutboxSize) {
        const drop = this.outbox.length - this.maxOutboxSize;
        this.outbox.splice(0, drop);
        log('ws', 'drop queued:' + drop);
      }
      this.ensureFlush();
      return;
    }
    log('ws', 'send:' + (typeof data === 'string' ? data : '[binary]'));
    if (typeof data === 'string') {
      this.ws.send(data);
    } else {
      const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
      this.ws.send(buf as any);
    }
    if (this.ws.bufferedAmount > this.maxBufferedAmount) {
      this.ensureFlush();
    }
  }

  close() {
    log('ws', 'close requested');
    this.shouldReconnect = false;
    this.timer && clearTimeout(this.timer);
    this.hb.stop();
    this.abortSignal?.removeEventListener('abort', this.abortHandler!);
    this.ws?.close();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
  }

  getStats() {
    return {
      rtt: this.hb.rtt,
      dc: this.ws?.readyState === WebSocket.OPEN ? 'open' : 'closed',
      ice: 'ws',
    };
  }

  private flushOutbox() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    while (
      this.outbox.length > 0 &&
      this.ws.bufferedAmount <= this.maxBufferedAmount
    ) {
      const m = this.outbox.shift()!;
      if (typeof m === 'string') this.ws.send(m);
      else if (m instanceof ArrayBuffer) this.ws.send(new Uint8Array(m) as any);
      else this.ws.send(m as any);
    }
    if (this.outbox.length === 0) {
      this.events.onDrain?.();
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = undefined;
      }
    } else {
      this.ensureFlush();
    }
  }

  private ensureFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flushOutbox(), 50);
  }
}
