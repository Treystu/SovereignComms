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
export interface MeshSeenAdapter {
  load(): Promise<Record<string, number>>;
  save(id: string, ts: number): Promise<void>;
  prune(expireBefore: number): Promise<void>;
}

export class IndexedDbSeenAdapter implements MeshSeenAdapter {
  private db: Promise<IDBDatabase>;
  private store = 'seen';
  constructor(dbName = 'mesh-router') {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.store);
      req.onerror = () => reject(req.error!);
      req.onsuccess = () => resolve(req.result);
    });
  }
  async load() {
    const db = await this.db;
    return new Promise<Record<string, number>>((res, rej) => {
      const tx = db.transaction(this.store, 'readonly');
      const store = tx.objectStore(this.store);
      const out: Record<string, number> = {};
      const req = store.openCursor();
      req.onerror = () => rej(req.error!);
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          out[cur.key as string] = cur.value as number;
          cur.continue();
        } else res(out);
      };
    });
  }
  async save(id: string, ts: number) {
    const db = await this.db;
    return new Promise<void>((res, rej) => {
      const tx = db.transaction(this.store, 'readwrite');
      tx.objectStore(this.store).put(ts, id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error!);
    });
  }
  async prune(expireBefore: number) {
    const db = await this.db;
    return new Promise<void>((res, rej) => {
      const tx = db.transaction(this.store, 'readwrite');
      const store = tx.objectStore(this.store);
      const req = store.openCursor();
      req.onerror = () => rej(req.error!);
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          if ((cur.value as number) < expireBefore) store.delete(cur.key);
          cur.continue();
        }
      };
      tx.oncomplete = () => res();
    });
  }
}

export class MeshRouter extends EventTarget {
  private peers: Map<string, (msg: Message) => void> = new Map();
  private local: Set<string> = new Set();
  // Track when each message id was seen so old ids can be purged
  private seen: Map<string, number> = new Map();
  private readonly seenTtlMs = 5 * 60 * 1000; // 5 minutes
  constructor(public readonly selfId: string, private adapter?: MeshSeenAdapter) {
    super();
    this.adapter?.load().then((entries) => {
      for (const [id, ts] of Object.entries(entries)) this.seen.set(id, ts);
    });
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
    this.adapter?.prune(now - this.seenTtlMs).catch(() => {});
  }

  private deliver(msg: Message) {
    const now = Date.now();
    this.pruneSeen(now);
    if (msg.ttl < 0 || this.seen.has(msg.id)) return;
    this.seen.set(msg.id, now);
    this.adapter?.save(msg.id, now).catch(() => {});
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
