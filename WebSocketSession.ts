import { RtcEvents } from './RtcSession';
import { log } from './logger';

const BUFFER_THRESHOLD = 64 * 1024; // 64KB

export type WsOptions = RtcEvents & { url: string; heartbeatMs?: number };

export class WebSocketSession {
  public events: RtcEvents;
  private ws?: WebSocket;
  private sendQueue: (string | ArrayBuffer | ArrayBufferView)[] = [];
  private flushTimer?: any;
  private heartbeatMs: number;
  private hbTimer?: any;
  private lastPing = 0;
  private lastPong = Date.now();
  private rtt = 0;
  private url: string;

  constructor(opts: WsOptions) {
    this.events = opts;
    this.url = opts.url;
    this.heartbeatMs = opts.heartbeatMs ?? 5000;
    log('ws', 'WebSocketSession created ' + this.url);
    this.connect();
  }

  private connect() {
    log('ws', 'connecting');
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      log('ws', 'open');
      this.startHeartbeat();
      this.events.onOpen?.();
      this.events.onState?.({ ice: 'ws', dc: 'open', rtt: this.rtt });
      this.flushQueue();
    };
    this.ws.onclose = (e) => {
      const reason = e.reason || 'ws-close';
      const msg = `close:${e.code}${reason ? ' ' + reason : ''}`;
      log('ws', msg);
      this.stopHeartbeat();
      this.events.onClose?.(reason);
      this.events.onState?.({ ice: 'ws', dc: 'closed', rtt: this.rtt });
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
      if (data === 'ping') {
        try {
          this.ws?.send('pong');
        } catch {}
        return;
      }
      if (data === 'pong') {
        this.lastPong = Date.now();
        this.rtt = this.lastPong - this.lastPing;
        this.events.onState?.({ ice: 'ws', dc: 'open', rtt: this.rtt });
        return;
      }
      this.events.onMessage?.(data);
    };
  }

  send(data: string | ArrayBuffer | ArrayBufferView) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log('ws', 'send failed: not open');
      throw new Error('WebSocket not open');
    }
    if (this.ws.bufferedAmount > BUFFER_THRESHOLD || this.sendQueue.length) {
      log('ws', 'queue send');
      this.sendQueue.push(data);
      this.scheduleFlush();
      return;
    }
    this.rawSend(data);
  }

  private rawSend(data: string | ArrayBuffer | ArrayBufferView) {
    if (!this.ws) return;
    log('ws', 'send:' + (typeof data === 'string' ? data : '[binary]'));
    if (typeof data === 'string') {
      this.ws.send(data);
    } else {
      const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
      this.ws.send(buf as any);
    }
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flushQueue();
    });
  }

  private flushQueue() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    while (this.sendQueue.length && this.ws.bufferedAmount < BUFFER_THRESHOLD) {
      const msg = this.sendQueue.shift();
      if (msg !== undefined) this.rawSend(msg);
    }
    if (this.sendQueue.length === 0) {
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = undefined;
      }
      this.events.onDrain?.();
    } else {
      this.scheduleFlush();
    }
  }

  close() {
    log('ws', 'close requested');
    this.stopHeartbeat();
    this.ws?.close();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.hbTimer = setInterval(() => {
      try {
        this.lastPing = Date.now();
        this.send('ping');
      } catch {}
      if (Date.now() - this.lastPong > this.heartbeatMs * 2) {
        this.events.onClose?.('timeout');
        this.close();
      }
    }, this.heartbeatMs);
  }

  private stopHeartbeat() {
    if (this.hbTimer) clearInterval(this.hbTimer);
  }

  getStats() {
    return { rtt: this.rtt };
  }
}
