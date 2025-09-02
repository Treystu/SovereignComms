import { describe, it, expect } from 'vitest';
import { MeshRouter, Message, FileChunkPayload } from './Mesh';
import { encryptEnvelope, decryptEnvelope, generateKeyPair } from './envelope';

async function sendFileThroughMesh(
  file: File,
  sender: MeshRouter,
  receiver: MeshRouter,
) {
  const chunkSize = 16 * 1024;
  const total = Math.ceil(file.size / chunkSize);
  for (let i = 0; i < total; i++) {
    const slice = file.slice(i * chunkSize, Math.min(file.size, (i + 1) * chunkSize));
    const buf = await slice.arrayBuffer();
    const payload: FileChunkPayload = {
      name: file.name,
      type: file.type,
      size: file.size,
      chunk: i,
      total,
      data: Array.from(new Uint8Array(buf)),
    };
    sender.send({ id: crypto.randomUUID(), ttl: 1, type: 'file', payload } as Message);
  }
}

describe('file transfer', () => {
  it('transfers a small file via mesh', async () => {
    const a = new MeshRouter('A');
    const b = new MeshRouter('B');
    a.connectPeer('B', (m) => b.ingress(m));
    b.connectPeer('A', (m) => a.ingress(m));
    const received: number[] = [];
    b.connectPeer(
      'INBOX',
      (m) => {
        const p = m.payload as FileChunkPayload;
        received.push(...p.data);
      },
      { local: true },
    );

    const data = new Uint8Array(40000); // 40KB sample
    data.forEach((_, i) => (data[i] = i % 256));
    const file = new File([data], 'sample.bin');

    await sendFileThroughMesh(file, a, b);
    await new Promise((r) => setTimeout(r, 0));

    expect(received.length).toBe(data.length);
    expect(new Uint8Array(received)).toEqual(data);
  });

  it('encrypts and decrypts file chunks', async () => {
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const buf = new Uint8Array([1, 2, 3, 4]).buffer;
    const { iv, ciphertext } = await encryptEnvelope(
      buf,
      a.ecdh.privateKey,
      b.ecdh.publicKey,
    );
    const plain = await decryptEnvelope(
      { iv, ciphertext },
      b.ecdh.privateKey,
      a.ecdh.publicKey,
    );
    expect(new Uint8Array(plain)).toEqual(new Uint8Array(buf));
  });
});
