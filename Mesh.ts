export type Message = { id: string; ttl: number; from: string; type: string; payload: any };

/**
 * Simple in-memory mesh relay with TTL and dedupe.
 */
export class MeshRouter {
  private peers: Map<string, (msg: Message) => void> = new Map();
  private local: Set<string> = new Set();
  private seen: Set<string> = new Set();
  constructor(public readonly selfId: string) {}

  connectPeer(id: string, handler: (msg: Message) => void, opts?: { local?: boolean }) {
    this.peers.set(id, handler);
    if (opts?.local) this.local.add(id);
  }
  disconnectPeer(id: string) {
    this.peers.delete(id);
    this.local.delete(id);
  }

  send(msg: Omit<Message, 'from'>) {
    const full: Message = { ...msg, from: this.selfId };
    this.deliver(full);
  }

  private deliver(msg: Message) {
    if (this.seen.has(msg.id)) return;
    this.seen.add(msg.id);
    for (const [id, h] of this.peers) {
      if (id === msg.from) continue; // no immediate echo back to sender id
      if (msg.ttl <= 0 && !this.local.has(id)) continue;
      const forwarded: Message = { ...msg, ttl: msg.ttl - 1 };
      queueMicrotask(() => h(forwarded));
    }
  }

  // external ingress from RTC: call this when a remote peer delivers a message
  ingress(msg: Message) { this.deliver(msg); }
}
