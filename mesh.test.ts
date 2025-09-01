import { describe, it, expect, vi } from 'vitest';
import { MeshRouter, Message } from './Mesh';

const flushMicrotasks = async () => {
  // Ensure queued microtasks propagate through the mesh
  await Promise.resolve();
  await Promise.resolve();
};

describe('MeshRouter', () => {
  it('honors TTL and dedupes', async () => {
    vi.useFakeTimers();

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
    await flushMicrotasks();

    expect(inboxC.length).toBeGreaterThan(0);
    const ids = new Set(inboxC.map((m) => m.id));
    expect(ids.size).toBe(inboxC.length);
    expect(typeof inboxC[0].timestamp).toBe('number');

    inboxC.length = 0;
    a.send({ id: 'y', ttl: 0, type: 'chat', payload: 'nope' } as any);
    await flushMicrotasks();
    expect(inboxC.length).toBe(0);

    vi.useRealTimers();
  });

  it('drops negative TTL messages immediately', async () => {
    vi.useFakeTimers();

    const a = new MeshRouter('A');
    const inbox: Message[] = [];
    a.connectPeer('INBOX', (m) => inbox.push(m), { local: true });

    a.send({ id: 'neg', ttl: -1, type: 'chat', payload: 'nope' } as any);
    await flushMicrotasks();
    expect(inbox.length).toBe(0);

    a.send({ id: 'neg', ttl: 1, type: 'chat', payload: 'ok' } as any);
    await flushMicrotasks();
    expect(inbox.length).toBe(1);

    vi.useRealTimers();
  });

  it('prunes seen ids after timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const a = new MeshRouter('A');
    const inbox: Message[] = [];
    a.connectPeer('INBOX', (m) => inbox.push(m), { local: true });

    a.send({ id: 'z', ttl: 1, type: 'chat', payload: 'hi' } as any);
    await flushMicrotasks();
    expect(inbox.length).toBe(1);

    // Duplicate should be dropped while in seen window
    a.send({ id: 'z', ttl: 1, type: 'chat', payload: 'hi again' } as any);
    await flushMicrotasks();
    expect(inbox.length).toBe(1);

    // Advance beyond the seen TTL (5 minutes)
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    // Should be delivered again after pruning
    a.send({ id: 'z', ttl: 1, type: 'chat', payload: 'hi later' } as any);
    await flushMicrotasks();
    expect(inbox.length).toBe(2);

    vi.useRealTimers();
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
