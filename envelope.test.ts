import { describe, it, expect } from 'vitest';
import { generateKeyPair, encryptEnvelope, decryptEnvelope } from './envelope';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('envelope', () => {
  it('encrypts and decrypts data', async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const data = encoder.encode('hello world');

    const envelope = await encryptEnvelope(
      data.buffer,
      alice.privateKey,
      bob.publicKey,
    );
    const decrypted = await decryptEnvelope(
      envelope,
      bob.privateKey,
      alice.publicKey,
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
      alice.privateKey,
      bob.publicKey,
    );

    await expect(
      decryptEnvelope(envelope, charlie.privateKey, alice.publicKey),
    ).rejects.toThrow();
  });

  it('fails to decrypt tampered ciphertext', async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const data = encoder.encode('secret');

    const envelope = await encryptEnvelope(
      data.buffer,
      alice.privateKey,
      bob.publicKey,
    );

    const tampered = new Uint8Array(envelope.ciphertext.slice(0));
    tampered[0] ^= 0xff;

    await expect(
      decryptEnvelope(
        { iv: envelope.iv, ciphertext: tampered.buffer },
        bob.privateKey,
        alice.publicKey,
      ),
    ).rejects.toThrow();
  });
});
