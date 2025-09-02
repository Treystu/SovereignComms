import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  encryptEnvelope,
  decryptEnvelope,
  sign,
  verify,
} from './envelope';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('envelope', () => {
  it('encrypts and decrypts data', async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const data = encoder.encode('hello world');

    const envelope = await encryptEnvelope(
      data.buffer,
      alice.ecdh.privateKey,
      bob.ecdh.publicKey,
    );
    const decrypted = await decryptEnvelope(
      envelope,
      bob.ecdh.privateKey,
      alice.ecdh.publicKey,
    );

    expect(decoder.decode(decrypted)).toBe('hello world');
  });

  it('fails to decrypt with wrong key', async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const charlie = await generateKeyPair();
    const data = encoder.encode('test');

    const envelope = await encryptEnvelope(
      data.buffer,
      alice.ecdh.privateKey,
      bob.ecdh.publicKey,
    );

    await expect(
      decryptEnvelope(envelope, charlie.ecdh.privateKey, alice.ecdh.publicKey),
    ).rejects.toThrow();
  });

  it('fails to decrypt tampered ciphertext', async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const data = encoder.encode('secret');

    const envelope = await encryptEnvelope(
      data.buffer,
      alice.ecdh.privateKey,
      bob.ecdh.publicKey,
    );

    const tampered = new Uint8Array(envelope.ciphertext.slice(0));
    tampered[0] ^= 0xff;

    await expect(
      decryptEnvelope(
        { iv: envelope.iv, ciphertext: tampered.buffer },
        bob.ecdh.privateKey,
        alice.ecdh.publicKey,
      ),
    ).rejects.toThrow();
  });

  it('signs and verifies data', async () => {
    const alice = await generateKeyPair();
    const data = encoder.encode('verify me');
    const sig = await sign(data.buffer, alice.ecdsa.privateKey);
    const ok = await verify(data.buffer, sig, alice.ecdsa.publicKey);
    expect(ok).toBe(true);
  });

  it('fails verification with wrong key', async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const data = encoder.encode('verify fail');
    const sig = await sign(data.buffer, alice.ecdsa.privateKey);
    const ok = await verify(data.buffer, sig, bob.ecdsa.publicKey);
    expect(ok).toBe(false);
  });
});
