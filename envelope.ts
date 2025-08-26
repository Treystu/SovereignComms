export type KeyPair = { publicKey: CryptoKey; privateKey: CryptoKey };

export async function generateKeyPair(): Promise<KeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  ) as unknown as KeyPair;
}

export async function exportPublicKeyJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', key);
}
// TODO: add AES-GCM envelope in v0.1
