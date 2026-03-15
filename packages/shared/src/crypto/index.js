const APP_SECRET = 'codefabrik-vereins-v1'; // Replaced by DB key in v0.4 (SQLCipher)

// Web Crypto API — works in Electron renderer and Node.js 20+
const webcrypto = globalThis.crypto;

export async function computeHmac(message) {
  const enc = new TextEncoder();
  const key = await webcrypto.subtle.importKey(
    'raw', enc.encode(APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await webcrypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
