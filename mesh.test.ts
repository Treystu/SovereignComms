import { describe, it, expect } from 'vitest';
import { MeshRouter, Message } from './Mesh';

describe('MeshRouter', () => {
  it('honors TTL and dedupes', async () => {
    const a = new MeshRouter('A');
    const b = new MeshRouter('B');
    const c = new MeshRouter('C');

    const inboxC: Message[] = [];

    a.connectPeer('B', (m) => b.ingress(m));
    b.connectPeer('A', (m) => a.ingress(m));
    b.connectPeer('C', (m) => c.ingress(m));
    c.connectPeer('B', (m) => b.ingress(m));

    c.connectPeer('A', (m) => a.ingress(m)); // extra edge
    c.connectPeer('INBOX', (m) => inboxC.push(m), { local: true });

    a.send({ id: 'x', ttl: 2, type: 'chat', payload: 'hi' } as any);
    await new Promise((r) => setTimeout(r, 10));

    expect(inboxC.length).toBeGreaterThan(0);
    const ids = new Set(inboxC.map((m) => m.id));
    expect(ids.size).toBe(inboxC.length);
    expect(typeof inboxC[0].timestamp).toBe('number');

    inboxC.length = 0;
    a.send({ id: 'y', ttl: 0, type: 'chat', payload: 'nope' } as any);
    await new Promise((r) => setTimeout(r, 10));
    expect(inboxC.length).toBe(0);
  });

  it('emits error events when a handler throws', async () => {
    const router = new MeshRouter('A');
    const errors: any[] = [];
    router.addEventListener('error', (e: any) => errors.push(e.detail));

    router.connectPeer('B', () => {
      throw new Error('boom');
    });

    router.send({ id: 'z', ttl: 1, type: 'test', payload: null } as any);
    await new Promise((r) => setTimeout(r, 10));

    expect(errors.length).toBe(1);
    expect(errors[0].peerId).toBe('B');
  });
});
