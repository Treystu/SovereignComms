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

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Encrypt arbitrary JSON-serializable data with AES-GCM.
export async function encrypt(key: CryptoKey, payload: any): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const buf = new Uint8Array(iv.length + cipher.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...buf));
}

// Decrypt data previously encrypted with `encrypt`.
export async function decrypt(key: CryptoKey, b64: string): Promise<any> {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const data = raw.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  const text = decoder.decode(plain);
  return JSON.parse(text);
}
