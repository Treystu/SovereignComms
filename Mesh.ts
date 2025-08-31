export type Message = { id: string; ttl: number; from: string; type: string; payload: any };

/** Interface for a transport used by MeshRouter. */
export interface MeshBackend {
  send(msg: Message): void;
  close(): void;
  onmessage?: (msg: Message) => void;
  onclose?: () => void;
}

/**
 * MeshRouter routes messages between peers using pluggable transports.
 * It handles TTL, de-duplication and automatic reconnection of transports
 * when network partitions occur.
 */
export class MeshRouter {
  private peers: Map<string, MeshBackend> = new Map();
  private factories: Map<string, () => MeshBackend> = new Map();
  private seen: Set<string> = new Set();
  constructor(
    public readonly selfId: string,
    private readonly reconnectBaseMs: number = 50,
    private readonly reconnectMaxMs: number = 10_000,
  ) {}

  /**
   * Connect to a peer using the provided factory. When the underlying
   * transport closes the router will attempt to reconnect with an
   * exponential backoff.
   */
  connectPeer(id: string, factory: () => MeshBackend) {
    this.factories.set(id, factory);
    this.openPeer(id, 0);
  }

  /** Disconnect from a peer and stop reconnect attempts. */
  disconnectPeer(id: string) {
    this.factories.delete(id);
    const peer = this.peers.get(id);
    peer?.close();
    this.peers.delete(id);
  }

  /** Send a message originating from this router. */
  send(msg: Omit<Message, 'from'>) {
    const full: Message = { ...msg, from: this.selfId };
    this.deliver(full);
  }

  /** Incoming message from an external transport. */
  ingress(msg: Message) {
    this.deliver(msg);
  }

  private openPeer(id: string, attempt: number) {
    const factory = this.factories.get(id);
    if (!factory) return;
    const backend = factory();
    backend.onmessage = (m) => this.ingress(m);
    backend.onclose = () => {
      this.peers.delete(id);
      const delay = Math.min(this.reconnectBaseMs * 2 ** attempt, this.reconnectMaxMs);
      setTimeout(() => this.openPeer(id, attempt + 1), delay);
    };
    this.peers.set(id, backend);
  }

  private deliver(msg: Message) {
    if (this.seen.has(msg.id)) return;
    this.seen.add(msg.id);
    for (const [id, peer] of this.peers) {
      if (id === msg.from) continue; // no echo to sender
      if (msg.ttl <= 0) continue;
      const forwarded: Message = { ...msg, ttl: msg.ttl - 1 };
      queueMicrotask(() => peer.send(forwarded));
    }
  }
}

/** WebSocket backend implementation */
export class WebSocketBackend implements MeshBackend {
  private ws: WebSocket;
  onmessage?: (msg: Message) => void;
  onclose?: () => void;

  constructor(private url: string) {
    this.ws = this.createSocket();
  }

  private createSocket(): WebSocket {
    const ws = new WebSocket(this.url);
    ws.onmessage = (ev) => {
      try {
        const msg: Message = JSON.parse(ev.data as any);
        this.onmessage?.(msg);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => this.onclose?.();
    return ws;
  }

  send(msg: Message) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close() {
    this.ws.close();
  }
}

/** WebTransport backend implementation (minimal) */
export class WebTransportBackend implements MeshBackend {
  private transport: any;
  private writer?: any;
  onmessage?: (msg: Message) => void;
  onclose?: () => void;

  constructor(private url: string) {
    this.open();
  }

  private async open() {
    try {
      const WT = (globalThis as any).WebTransport;
      if (!WT) throw new Error('WebTransport unavailable');
      this.transport = new WT(this.url);
      const reader = this.transport.datagrams.readable.getReader();
      this.writer = this.transport.datagrams.writable.getWriter();
      const dec = new TextDecoder();
      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            this.onmessage?.(JSON.parse(dec.decode(value)));
          }
        } catch {
          /* ignore */
        }
        this.onclose?.();
      })();
    } catch {
      this.onclose?.();
    }
  }

  send(msg: Message) {
    if (!this.writer) return;
    const enc = new TextEncoder().encode(JSON.stringify(msg));
    this.writer.write(enc);
  }

  close() {
    try { this.transport.close(); } catch {}
  }
}
