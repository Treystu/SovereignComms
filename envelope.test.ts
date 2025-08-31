import { describe, it, expect } from 'vitest';
import { generateKeyPair, deriveAesKey, encrypt, decrypt } from './envelope';

describe('envelope', () => {
  it('encrypts and decrypts round-trip', async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const aliceKey = await deriveAesKey(bob.publicKey, alice.privateKey);
    const bobKey = await deriveAesKey(alice.publicKey, bob.privateKey);
    const msg = 'secret message';
    const cipher = await encrypt(msg, aliceKey);
    const clear = await decrypt(cipher, bobKey);
    expect(clear).toBe(msg);
  });
});
