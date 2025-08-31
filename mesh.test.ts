import { describe, it, expect } from 'vitest';
import { MeshRouter, Message } from './Mesh';

describe('MeshRouter', () => {
  it('honors TTL and dedupes', async () => {
    const a = new MeshRouter('A', 8, 1024);
    const b = new MeshRouter('B', 8, 1024);
    const c = new MeshRouter('C', 8, 1024);

    const inboxC: Message[] = [];

    a.connectPeer('B', (m)=> b.ingress(m));
    b.connectPeer('A', (m)=> a.ingress(m));
    b.connectPeer('C', (m)=> c.ingress(m));
    c.connectPeer('B', (m)=> b.ingress(m));

    c.connectPeer('A', (m)=> a.ingress(m)); // extra edge
    c.connectPeer('INBOX', (m)=> inboxC.push(m), { local: true });

    a.send({ id: 'x', ttl: 2, type: 'chat', payload: 'hi' } as any);
    await new Promise(r=>setTimeout(r, 10));

    expect(inboxC.length).toBeGreaterThan(0);
    const ids = new Set(inboxC.map(m => m.id));
    expect(ids.size).toBe(inboxC.length);

    inboxC.length = 0;
    a.send({ id: 'y', ttl: 0, type: 'chat', payload: 'nope' } as any);
    await new Promise(r=>setTimeout(r, 10));
    expect(inboxC.length).toBe(0);
  });
});
