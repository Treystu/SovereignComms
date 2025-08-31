export type Message = { id: string; ttl: number; from: string; type: string; payload: any };

/**
 * Simple in-memory mesh relay with TTL and dedupe.
 */
export class MeshRouter {
  private peers: Map<string, (msg: Message) => void> = new Map();
  private seen: Set<string> = new Set();
  constructor(public readonly selfId: string) {}

  connectPeer(id: string, handler: (msg: Message) => void) { this.peers.set(id, handler); }
  disconnectPeer(id: string) { this.peers.delete(id); }

  send(msg: Omit<Message, 'from'>) {
    const full: Message = { ...msg, from: this.selfId };
    this.deliver(full);
  }

  private deliver(msg: Message) {
    if (msg.ttl < 0 || this.seen.has(msg.id)) return;
    this.seen.add(msg.id);
    for (const [id, h] of this.peers) {
      if (id === msg.from) continue; // no immediate echo back to sender id
      const forwarded: Message = { ...msg, from: this.selfId, ttl: msg.ttl - 1 };
      queueMicrotask(() => h(forwarded));
    }
  }

  // external ingress from RTC: call this when a remote peer delivers a message
  ingress(msg: Message) { this.deliver(msg); }
}
