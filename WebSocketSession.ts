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

  constructor(opts: WsOptions) {
    this.events = opts;
    this.url = opts.url;
    const interval = opts.heartbeatMs ?? 5000;
    this.shouldReconnect = !!opts.reconnect;
    this.reconnectDelay = opts.reconnectMinDelayMs ?? 1000;
    this.minDelay = this.reconnectDelay;
    this.maxDelay = opts.reconnectMaxDelayMs ?? 16000;
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
      // flush buffered messages
      const msgs = this.outbox.splice(0);
      for (const m of msgs) {
        try {
          this.send(m);
        } catch {}
      }
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
        this.timer = setTimeout(() => {
          this.timer = null;
          this.connect();
        }, this.reconnectDelay);
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log('ws', 'queue msg');
      this.outbox.push(data);
      if (this.outbox.length > this.maxOutboxSize) {
        this.outbox.splice(0, this.outbox.length - this.maxOutboxSize);
      }
      return;
    }
    log('ws', 'send:' + (typeof data === 'string' ? data : '[binary]'));
    if (typeof data === 'string') {
      this.ws.send(data);
    } else {
      const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
      this.ws.send(buf as any);
    }
  }

  close() {
    log('ws', 'close requested');
    this.shouldReconnect = false;
    this.timer && clearTimeout(this.timer);
    this.hb.stop();
    this.abortSignal?.removeEventListener('abort', this.abortHandler!);
    this.ws?.close();
  }

  getStats() {
    return { rtt: this.hb.rtt };
  }
}
