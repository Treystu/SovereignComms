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

export async function deriveAesKey(
  peerPublicKey: CryptoKey,
  myPrivateKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(
  message: string,
  key: CryptoKey
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(message);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  const buf = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(ciphertext), iv.byteLength);
  return buf;
}

export async function decrypt(
  ciphertext: Uint8Array,
  key: CryptoKey
): Promise<string> {
  const iv = ciphertext.slice(0, 12);
  const data = ciphertext.slice(12);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return new TextDecoder().decode(plain);
}
