export type Message = { id: string; ttl: number; from: string; type: string; payload: any };

/**
 * Simple in-memory mesh relay with TTL and dedupe.
 */
export class MeshRouter {
  private peers: Map<string, (msg: Message) => void> = new Map();
  private seen: Set<string> = new Set();
  /** callback when we hear about an unknown peer */
  onPeer?: (id: string, via: string) => void;

  constructor(public readonly selfId: string) {}

  connectPeer(id: string, handler: (msg: Message) => void) {
    this.peers.set(id, handler);
    // let the network know about our updated view
    this.announce();
  }
  disconnectPeer(id: string) { this.peers.delete(id); }

  send(msg: Omit<Message, 'from'>) {
    const full: Message = { ...msg, from: this.selfId };
    this.deliver(full);
  }

  private deliver(msg: Message) {
    if (this.seen.has(msg.id)) return;
    this.seen.add(msg.id);

     if (msg.type === 'announce') this.handleAnnounce(msg);
    for (const [id, h] of this.peers) {
      if (id === msg.from) continue; // no immediate echo back to sender id
      if (msg.ttl <= 0) continue;
      const forwarded: Message = { ...msg, ttl: msg.ttl - 1 };
      queueMicrotask(() => h(forwarded));
    }
  }

  // external ingress from RTC: call this when a remote peer delivers a message
  ingress(msg: Message) { this.deliver(msg); }

  /** broadcast our known peers */
  announce() {
    const payload = [...this.peers.keys(), this.selfId];
    const id = `${this.selfId}-announce-${Math.random().toString(36).slice(2)}`;
    this.send({ id, ttl: 5, type: 'announce', payload });
  }

  private handleAnnounce(msg: Message) {
    const peers: string[] = Array.isArray(msg.payload) ? msg.payload : [];
    for (const p of peers) {
      if (p === this.selfId) continue;
      if (this.peers.has(p)) continue;
      this.onPeer?.(p, msg.from);
    }
  }
}
