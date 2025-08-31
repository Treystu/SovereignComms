import { describe, it, expect } from 'vitest';
import { MeshRouter, Message, MeshBackend } from './Mesh';

// helper to create in-memory backends that link two routers
function link(a: MeshRouter, b: MeshRouter) {
  a.connectPeer(b.selfId, () => ({
    send: (m: Message) => b.ingress(m),
    close: () => {},
  }));
}

// helper backend for inbox capturing
function inboxBackend(arr: Message[]): () => MeshBackend {
  return () => ({
    send: (m: Message) => arr.push(m),
    close: () => {},
  });
}

describe('MeshRouter', () => {
  it('honors TTL and dedupes', async () => {
    const a = new MeshRouter('A');
    const b = new MeshRouter('B');
    const c = new MeshRouter('C');

    const inboxC: Message[] = [];

    link(a, b);
    link(b, a);
    link(b, c);
    link(c, b);

    // extra edge
    link(c, a);

    c.connectPeer('INBOX', inboxBackend(inboxC));

    a.send({ id: 'x', ttl: 2, type: 'chat', payload: 'hi' } as any);
    await new Promise((r) => setTimeout(r, 10));

    expect(inboxC.length).toBeGreaterThan(0);
    const ids = new Set(inboxC.map((m) => m.id));
    expect(ids.size).toBe(inboxC.length);

    inboxC.length = 0;
    a.send({ id: 'y', ttl: 0, type: 'chat', payload: 'nope' } as any);
    await new Promise((r) => setTimeout(r, 10));
    expect(inboxC.length).toBe(0);
  });

  it('reconnects after network partition', async () => {
    const a = new MeshRouter('A', 5, 20); // fast reconnect for tests
    const b = new MeshRouter('B', 5, 20);
    const inboxB: Message[] = [];

    let currentAtoB: FlakyBackend | null = null;
    const factoryA = () => (currentAtoB = new FlakyBackend(b));

    a.connectPeer('B', factoryA);
    b.connectPeer('INBOX', inboxBackend(inboxB));

    // initial message works
    a.send({ id: '1', ttl: 2, type: 'chat', payload: 'hi' } as any);
    await new Promise((r) => setTimeout(r, 10));
    expect(inboxB.length).toBe(1);

    // simulate partition
    currentAtoB!.simulateClose();

    inboxB.length = 0;
    a.send({ id: '2', ttl: 2, type: 'chat', payload: 'lost' } as any);
    await new Promise((r) => setTimeout(r, 10));
    expect(inboxB.length).toBe(0); // not delivered while partitioned

    // wait for reconnection
    await new Promise((r) => setTimeout(r, 50));

    a.send({ id: '3', ttl: 2, type: 'chat', payload: 'again' } as any);
    await new Promise((r) => setTimeout(r, 10));
    expect(inboxB.length).toBe(1);
  });
});

class FlakyBackend implements MeshBackend {
  onmessage?: (msg: Message) => void;
  onclose?: () => void;
  constructor(private target: MeshRouter) {}
  send(msg: Message) {
    this.target.ingress(msg);
  }
  close() {}
  simulateClose() {
    this.onclose?.();
  }
}
