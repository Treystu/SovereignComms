export type KeyPair = { publicKey: CryptoKey; privateKey: CryptoKey };

export async function generateKeyPair(): Promise<KeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
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
    [],
  );
}

export async function fingerprintPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  const digest = await crypto.subtle.digest('SHA-256', raw);
  const bytes = Array.from(new Uint8Array(digest).slice(0, 16));
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.match(/.{1,4}/g)?.join(' ') ?? hex;
}

export async function deriveAesGcmKey(
  priv: CryptoKey,
  pub: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: pub },
    priv,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptEnvelope(
  data: ArrayBuffer,
  priv: CryptoKey,
  pub: CryptoKey,
): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const key = await deriveAesGcmKey(priv, pub);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  );
  return { iv, ciphertext };
}

export async function decryptEnvelope(
  envelope: { iv: Uint8Array; ciphertext: ArrayBuffer },
  priv: CryptoKey,
  pub: CryptoKey,
): Promise<ArrayBuffer> {
  const key = await deriveAesGcmKey(priv, pub);
  const params: AesGcmParams = { name: 'AES-GCM', iv: envelope.iv };
  return crypto.subtle.decrypt(params, key, envelope.ciphertext);
}
