import { RtcEvents } from './RtcSession';
import { log } from './logger';
import { Heartbeat } from './src/heartbeat';

export type WsOptions = RtcEvents & { url: string; heartbeatMs?: number };

export class WebSocketSession {
  public events: RtcEvents;
  private ws?: WebSocket;
  private hb: Heartbeat;
  private url: string;

  constructor(opts: WsOptions) {
    this.events = opts;
    this.url = opts.url;
    const interval = opts.heartbeatMs ?? 5000;
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
    };
    this.ws.onclose = (e) => {
      const reason = e.reason || 'ws-close';
      const msg = `close:${e.code}${reason ? ' ' + reason : ''}`;
      log('ws', msg);
      this.hb.stop();
      this.events.onClose?.(reason);
      this.events.onState?.({ ice: 'ws', dc: 'closed', rtt: this.hb.rtt });
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
    this.hb.stop();
    this.ws?.close();
  }

  getStats() {
    return { rtt: this.hb.rtt };
  }
}
