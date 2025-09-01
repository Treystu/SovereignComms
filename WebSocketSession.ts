import { RtcEvents } from './RtcSession';
import { log } from './logger';

export type WsOptions = RtcEvents & { url: string; heartbeatMs?: number };

export class WebSocketSession {
  public events: RtcEvents;
  private ws?: WebSocket;
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
    };
    this.ws.onclose = (e) => {
      log('ws', 'close');
      this.stopHeartbeat();
      this.events.onClose?.(e.reason || 'ws-close');
      this.events.onState?.({ ice: 'ws', dc: 'closed', rtt: this.rtt });
    };
    this.ws.onerror = (e) => {
      log('ws', 'error');
      this.events.onError?.(e as any);
    };
    this.ws.onmessage = (m) => {
      const data = m.data;
      log('ws', 'message:' + (typeof data === 'string' ? data : '[binary]'));
      if (data === 'ping') { try { this.ws?.send('pong'); } catch {} return; }
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

  getStats() { return { rtt: this.rtt }; }
}

