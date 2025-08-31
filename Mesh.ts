export type Message = {
  id: string;
  ttl: number;
  from: string;
  type: string;
  payload: any;
  timestamp?: number;
};

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
    const full: Message = {
      ...msg,
      from: this.selfId,
      timestamp: msg.timestamp ?? Date.now(),
    };
    this.deliver(full);
  }

  private deliver(msg: Message) {
    const withTs: Message = msg.timestamp ? msg : { ...msg, timestamp: Date.now() };
    if (this.seen.has(withTs.id)) return;
    this.seen.add(withTs.id);
    for (const [id, h] of this.peers) {
      if (id === withTs.from) continue; // no immediate echo back to sender id
      if (withTs.ttl <= 0) continue;
      const forwarded: Message = { ...withTs, ttl: withTs.ttl - 1 };
      queueMicrotask(() => h(forwarded));
    }
  }

  // external ingress from RTC: call this when a remote peer delivers a message
  ingress(msg: Message) { this.deliver(msg); }
}
