import { describe, it, expect } from 'vitest';
import { MeshRouter, Message } from './Mesh';

describe('MeshRouter', () => {
  it('honors TTL and dedupes', async () => {
    const a = new MeshRouter('A');
    const b = new MeshRouter('B');
    const c = new MeshRouter('C');

    const inboxC: Message[] = [];

    a.connectPeer('B', (m)=> b.ingress(m));
    b.connectPeer('A', (m)=> a.ingress(m));
    b.connectPeer('C', (m)=> c.ingress(m));
    c.connectPeer('B', (m)=> b.ingress(m));

    c.connectPeer('A', (m)=> a.ingress(m)); // extra edge
    c.connectPeer('INBOX', (m)=> inboxC.push(m));

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

  it('announces peers and expands mesh', async () => {
    const a = new MeshRouter('A');
    const b = new MeshRouter('B');
    const c = new MeshRouter('C');

    const link = (x: MeshRouter, y: MeshRouter) => {
      x.connectPeer(y.selfId, (m) => y.ingress(m));
      y.connectPeer(x.selfId, (m) => x.ingress(m));
    };

    // initial chain A-B-C
    link(a, b);
    link(b, c);

    // hook for automatic linking when we learn about a new peer
    a.onPeer = (id) => { if (id === 'C') link(a, c); };
    c.onPeer = (id) => { if (id === 'A') link(c, a); };

    const inboxC: Message[] = [];
    c.connectPeer('INBOX', (m) => inboxC.push(m));

    // wait for announcements to propagate and new links to form
    await new Promise(r => setTimeout(r, 20));

    a.send({ id: 'z', ttl: 5, type: 'chat', payload: 'hi' } as any);
    await new Promise(r => setTimeout(r, 20));

    expect(inboxC.length).toBeGreaterThan(0);
  });
});
