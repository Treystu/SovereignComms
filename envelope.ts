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

export async function importPublicKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

export async function deriveAesGcmKey(priv: CryptoKey, pub: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: pub },
    priv,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptEnvelope(data: ArrayBuffer, priv: CryptoKey, pub: CryptoKey): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const key = await deriveAesGcmKey(priv, pub);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv, ciphertext };
}

export async function decryptEnvelope(envelope: { iv: Uint8Array; ciphertext: ArrayBuffer }, priv: CryptoKey, pub: CryptoKey): Promise<ArrayBuffer> {
  const key = await deriveAesGcmKey(priv, pub);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: envelope.iv as any }, key, envelope.ciphertext);
}
