export type KeyPair = {
  ecdh: CryptoKeyPair;
  ecdsa: CryptoKeyPair;
};

export async function generateKeyPair(): Promise<KeyPair> {
  const ecdh = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  )) as CryptoKeyPair;
  const ecdsa = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  return { ecdh, ecdsa };
}

export async function exportPublicKeyJwk(key: CryptoKey): Promise<JsonWebKey> {
  return (crypto.subtle as any).exportKey('jwk', key);
}

export async function importPublicKeyJwk(
  jwk: JsonWebKey,
  type: 'ECDH' | 'ECDSA' = 'ECDH',
): Promise<CryptoKey> {
  const algorithm =
    type === 'ECDH'
      ? { name: 'ECDH', namedCurve: 'P-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' };
  const usages = type === 'ECDH' ? [] : ['verify'];
  return (crypto.subtle as any).importKey('jwk', jwk, algorithm, true, usages);
}

export async function sign(
  data: ArrayBuffer,
  priv: CryptoKey,
): Promise<ArrayBuffer> {
  return crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    priv,
    data,
  );
}

export async function verify(
  data: ArrayBuffer,
  sig: ArrayBuffer,
  pub: CryptoKey,
): Promise<boolean> {
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    pub,
    sig,
    data,
  );
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
  const ciphertext = await (crypto.subtle as any).encrypt(
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
  const params: AesGcmParams = {
    name: 'AES-GCM',
    iv: envelope.iv as any,
  };
  return (crypto.subtle as any).decrypt(params, key, envelope.ciphertext);
}

export async function fingerprintPublicKey(key: CryptoKey): Promise<string> {
  const jwk = await exportPublicKeyJwk(key);
  const data = new TextEncoder().encode(JSON.stringify(jwk));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
