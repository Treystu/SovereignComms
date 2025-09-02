export type FileChunkPayload = {
  name: string;
  type: string;
  size: number;
  chunk: number;
  total: number;
  data: number[];
};

export type Message = {
  id: string;
  ttl: number;
  from: string;
  type: string;
  payload: any | FileChunkPayload;
  timestamp?: number;
  enc?: boolean;
};

import { log } from './logger';

/**
 * Simple in-memory mesh relay with TTL and dedupe.
 */
export class MeshRouter extends EventTarget {
  private peers: Map<string, (msg: Message) => void> = new Map();
  private local: Set<string> = new Set();
  // Track when each message id was seen so old ids can be purged
  private seen: Map<string, number> = new Map();
  private readonly seenTtlMs = 5 * 60 * 1000; // 5 minutes
  constructor(public readonly selfId: string) {
    super();
  }

  connectPeer(
    id: string,
    handler: (msg: Message) => void,
    opts?: { local?: boolean },
  ) {
    this.peers.set(id, handler);
    if (opts?.local) this.local.add(id);
  }
  disconnectPeer(id: string) {
    this.peers.delete(id);
    this.local.delete(id);
  }

  send(msg: Omit<Message, 'from'>) {
    const full: Message = {
      ...msg,
      from: this.selfId,
      timestamp: msg.timestamp ?? Date.now(),
    };
    this.deliver(full);
  }

  private pruneSeen(now = Date.now()) {
    for (const [id, ts] of this.seen) {
      if (now - ts > this.seenTtlMs) this.seen.delete(id);
    }
  }

  private deliver(msg: Message) {
    const now = Date.now();
    this.pruneSeen(now);
    if (msg.ttl < 0 || this.seen.has(msg.id)) return;
    this.seen.set(msg.id, now);
    for (const [id, h] of this.peers) {
      if (id === msg.from) continue; // no immediate echo back to sender id

      const isLocal = this.local.has(id);
      if (msg.ttl <= 0 && !isLocal) continue;

      const forwarded: Message = isLocal
        ? msg
        : { ...msg, from: this.selfId, ttl: msg.ttl - 1 };
      queueMicrotask(() => {
        try {
          h(forwarded);
        } catch (err) {
          try {
            log(
              'error',
              `peer ${id} handler failed: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          } catch {}
          this.dispatchEvent(
            new CustomEvent('error', {
              detail: { error: err, message: forwarded, peerId: id },
            }),
          );
        }
      });
    }
  }

  // external ingress from RTC: call this when a remote peer delivers a message
  ingress(msg: Message) {
    this.deliver(msg);
  }
}
