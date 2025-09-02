import { describe, it, expect } from 'vitest';
import { generateKeyPair, exportPublicKeyJwk, sign } from './envelope';
import { verifyAndImportPubKey } from './store';

const encoder = new TextEncoder();

describe('pubkey verification', () => {
  it('accepts valid signed key', async () => {
    const kp = await generateKeyPair();
    const jwk = await exportPublicKeyJwk(kp.ecdh.publicKey);
    const sigKey = await exportPublicKeyJwk(kp.ecdsa.publicKey);
    const data = encoder.encode(JSON.stringify(jwk));
    const sigBuf = await sign(data.buffer, kp.ecdsa.privateKey);
    const payload = { key: jwk, sig: Array.from(new Uint8Array(sigBuf)), sigKey };
    const pub = await verifyAndImportPubKey(payload);
    expect(pub.type).toBe('public');
  });

  it('rejects invalid signature', async () => {
    const kp = await generateKeyPair();
    const jwk = await exportPublicKeyJwk(kp.ecdh.publicKey);
    const sigKey = await exportPublicKeyJwk(kp.ecdsa.publicKey);
    const data = encoder.encode(JSON.stringify(jwk));
    const sigBuf = await sign(data.buffer, kp.ecdsa.privateKey);
    const tampered = new Uint8Array(sigBuf);
    tampered[0] ^= 0xff;
    const payload = { key: jwk, sig: Array.from(tampered), sigKey };
    await expect(verifyAndImportPubKey(payload)).rejects.toThrow();
  });
});

