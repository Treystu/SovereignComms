import { RtcEvents } from './RtcSession';
import { log } from './logger';

export type WsOptions = RtcEvents & {
  url: string;
  heartbeatMs?: number;
  reconnect?: boolean;
  maxBackoff?: number;
};

export class WebSocketSession {
  public events: RtcEvents;
  private ws?: WebSocket;
  private heartbeatMs: number;
  private hbTimer?: any;
  private lastPing = 0;
  private lastPong = Date.now();
  private rtt = 0;
  private url: string;
  private reconnect: boolean;
  private maxBackoff: number;
  private backoff = 1000;
  private reconnectTimer?: any;

  constructor(opts: WsOptions) {
    this.events = opts;
    this.url = opts.url;
    this.heartbeatMs = opts.heartbeatMs ?? 5000;
    this.reconnect = opts.reconnect ?? false;
    this.maxBackoff = opts.maxBackoff ?? 16000;
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
      this.backoff = 1000;
    };
    this.ws.onclose = (e) => {
      const reason = e.reason || 'ws-close';
      const msg = `close:${e.code}${reason ? ' ' + reason : ''}`;
      log('ws', msg);
      this.stopHeartbeat();
      this.events.onClose?.(reason);
      this.events.onState?.({ ice: 'ws', dc: 'closed', rtt: this.rtt });
      if (this.reconnect) {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        const delay = this.backoff;
        log('ws', 'reconnect in ' + delay);
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = undefined;
          this.connect();
        }, delay);
        this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
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
    this.stopHeartbeat();
    this.ws?.close();
  }

  stopReconnect() {
    this.reconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
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
