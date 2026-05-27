// RFC 8030 web-push sender with VAPID (RFC 8292) auth and aes128gcm
// content encoding (RFC 8291). Implemented directly with Node `crypto` +
// `crypto.subtle` so we avoid the `web-push` package's history of
// Node-version pinning issues on Vercel.
//
// The flow:
//
//   1. Generate an ephemeral P-256 keypair (the "AS key") for this push.
//   2. ECDH(AS-private, ua-public) → shared secret.
//   3. HKDF(shared secret, salt = random 16B, info = "WebPush: info\0" || ua-pub || as-pub)
//        → IKM   (RFC 8291 §3.3 "PRK_key" derivation).
//   4. HKDF(IKM, salt = the same random 16B, info = "Content-Encoding: aes128gcm\0")
//        → CEK   (16-byte AES-128-GCM key).
//   5. HKDF(IKM, salt = the same random 16B, info = "Content-Encoding: nonce\0")
//        → NONCE (12-byte AES-GCM IV).
//   6. Pad the payload (we use 1 byte of padding marker, no extra zeroes):
//        plaintext = payload || 0x02
//   7. AES-128-GCM(CEK, NONCE, plaintext) → ciphertext + 16B tag.
//   8. Build the aes128gcm body:
//        salt(16B) || rs(4B BE = 4096) || idlen(1B) || keyid(idlen B = AS pub raw 65B)
//        || ciphertext(plaintext.len + 16)
//   9. Build the VAPID JWT (ES256) — header `{alg:"ES256",typ:"JWT"}`,
//      payload `{aud, exp, sub}`. Sign with VAPID_PRIVATE_KEY (raw 32B
//      P-256 d, base64url-encoded).
//  10. POST the body to the subscription's `endpoint` with headers:
//        Content-Encoding: aes128gcm
//        Content-Type: application/octet-stream
//        TTL: 60
//        Authorization: vapid t=<jwt>, k=<vapid-public-key-uncompressed-raw-base64url>
//
// References:
//   - RFC 8030 (HTTP Push)
//   - RFC 8291 (Message Encryption for Web Push)
//   - RFC 8292 (VAPID)
//   - https://datatracker.ietf.org/doc/html/rfc8291#section-3.4

import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  createSign,
  diffieHellman,
  generateKeyPairSync,
  randomBytes,
  type KeyObject,
} from 'node:crypto';

import type { PushSubscriptionRow } from './persistence';

export interface VapidEnv {
  VAPID_PUBLIC_KEY?: string | undefined;
  VAPID_PRIVATE_KEY?: string | undefined;
  VAPID_SUBJECT?: string | undefined;
}

export interface SendWebPushResult {
  ok: boolean;
  status: number;
  message?: string;
}

/**
 * Send a single web-push notification to one subscription endpoint.
 *
 * Returns the status code so the caller can decide between:
 *   - 2xx → markFired
 *   - 404 / 410 → drop the subscription, treat alert as fired
 *   - other non-2xx → leave the alert active so the next cron tick retries
 */
export async function sendWebPush(
  sub: PushSubscriptionRow,
  payload: string,
  env: VapidEnv,
): Promise<SendWebPushResult> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return { ok: false, status: 0, message: 'VAPID keys not configured' };
  }

  const uaPublicRaw = base64UrlToBytes(sub.p256dh); // 65 bytes uncompressed
  const authSecret = base64UrlToBytes(sub.auth); // 16 bytes
  const payloadBytes = new TextEncoder().encode(payload);

  // 1. Ephemeral AS keypair (P-256). We need raw uncompressed pub bytes for
  //    the keyid field; `jwk` export gives x/y separately so we reconstruct.
  const { privateKey: asPriv, publicKey: asPub } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });
  const asPublicRaw = ecPublicKeyToRaw(asPub); // 65 bytes uncompressed

  // 2. ECDH AS-private × ua-public.
  const uaPublicKey = rawPublicKeyToObject(uaPublicRaw);
  const sharedSecret = ecdhP256(asPriv, uaPublicKey); // 32 bytes

  // 3-5. RFC 8291 key derivation.
  const salt = randomBytes(16);
  const cekInfo = buildKeyInfo(uaPublicRaw, asPublicRaw);
  const ikm = hkdf(authSecret, sharedSecret, cekInfo, 32);
  const cek = hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  // 6-7. AES-128-GCM encrypt with one padding byte (delimiter 0x02 — last
  //      record of the stream per RFC 8188 §2).
  const paddedPlaintext = new Uint8Array(payloadBytes.length + 1);
  paddedPlaintext.set(payloadBytes, 0);
  paddedPlaintext[payloadBytes.length] = 0x02;
  const ciphertext = await aesGcmEncrypt(cek, nonce, paddedPlaintext);

  // 8. aes128gcm body: salt(16) || rs(4 BE) || idlen(1) || keyid(idlen) || ct
  const body = new Uint8Array(16 + 4 + 1 + asPublicRaw.length + ciphertext.length);
  body.set(salt, 0);
  // Record size = 4096; encoded big-endian uint32.
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  dv.setUint32(16, 4096, false);
  body[20] = asPublicRaw.length;
  body.set(asPublicRaw, 21);
  body.set(ciphertext, 21 + asPublicRaw.length);

  // 9. VAPID JWT (ES256).
  const aud = audienceFor(sub.endpoint);
  const jwt = signVapidJwt(env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY, {
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12h, max allowed is 24h
    sub: env.VAPID_SUBJECT ?? 'mailto:owner@hamafx.local',
  });

  // 10. POST. Vercel Node fetch supports BodyInit = Uint8Array.
  let res: Response;
  try {
    res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '60',
        Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      },
      // BodyInit accepts BufferSource; copy to a fresh ArrayBuffer-backed
      // view so we never pass a SharedArrayBuffer.
      body: new Uint8Array(body),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : 'fetch failed',
    };
  }

  if (res.ok) {
    return { ok: true, status: res.status };
  }
  const text = await res.text().catch(() => '');
  return {
    ok: false,
    status: res.status,
    message: `push HTTP ${res.status}: ${text.slice(0, 200)}`,
  };
}

// ---------------------------------------------------------------------------
// VAPID JWT (ES256)
// ---------------------------------------------------------------------------

interface VapidClaims {
  aud: string;
  exp: number;
  sub: string;
}

function signVapidJwt(
  privateKeyBase64Url: string,
  publicKeyBase64Url: string,
  claims: VapidClaims,
): string {
  const header = { typ: 'JWT', alg: 'ES256' };
  const headerB64 = bytesToBase64Url(utf8(JSON.stringify(header)));
  const payloadB64 = bytesToBase64Url(utf8(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = importVapidPrivateKey(privateKeyBase64Url, publicKeyBase64Url);
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  // DER signature; ES256 needs raw r||s (each 32 bytes).
  const der = signer.sign(key);
  const raw = derToJoseEcdsaSig(new Uint8Array(der), 32);

  return `${signingInput}.${bytesToBase64Url(raw)}`;
}

function importVapidPrivateKey(
  privateKeyBase64Url: string,
  publicKeyBase64Url: string,
): KeyObject {
  // VAPID private key: raw 32-byte `d`, base64url.
  // VAPID public  key: 65-byte uncompressed point (0x04 || x || y), base64url.
  const d = base64UrlToBytes(privateKeyBase64Url);
  if (d.length !== 32) {
    throw new Error(`VAPID_PRIVATE_KEY must be 32 raw bytes (got ${d.length})`);
  }
  const pub = base64UrlToBytes(publicKeyBase64Url);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error(
      `VAPID_PUBLIC_KEY must be 65-byte uncompressed P-256 (got len=${pub.length})`,
    );
  }
  const x = bytesToBase64Url(pub.slice(1, 33));
  const y = bytesToBase64Url(pub.slice(33, 65));
  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: privateKeyBase64Url,
      x,
      y,
    },
    format: 'jwk',
  });
}

function audienceFor(endpoint: string): string {
  const u = new URL(endpoint);
  return `${u.protocol}//${u.host}`;
}

// ---------------------------------------------------------------------------
// EC + ECDH helpers (Node `crypto`)
// ---------------------------------------------------------------------------

function ecPublicKeyToRaw(pub: KeyObject): Uint8Array {
  const jwk = pub.export({ format: 'jwk' });
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new Error('expected EC public key with x,y');
  }
  const x = base64UrlToBytes(jwk.x);
  const y = base64UrlToBytes(jwk.y);
  const out = new Uint8Array(65);
  out[0] = 0x04;
  out.set(x, 1);
  out.set(y, 33);
  return out;
}

function rawPublicKeyToObject(raw: Uint8Array): KeyObject {
  if (raw.length !== 65 || raw[0] !== 0x04) {
    throw new Error(`expected uncompressed 65-byte P-256 public key, got len=${raw.length}`);
  }
  const x = bytesToBase64Url(raw.slice(1, 33));
  const y = bytesToBase64Url(raw.slice(33, 65));
  return createPublicKey({ key: { kty: 'EC', crv: 'P-256', x, y }, format: 'jwk' });
}

function ecdhP256(privateKey: KeyObject, publicKey: KeyObject): Uint8Array {
  // Node's diffieHellman returns the shared secret as a Buffer.
  const buf = diffieHellman({ privateKey, publicKey });
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------
// HKDF + AES-128-GCM
// ---------------------------------------------------------------------------

function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const h = createHmac('sha256', key);
  h.update(data);
  return new Uint8Array(h.digest());
}

function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  const prk = hmacSha256(salt, ikm);
  // Single-block expand (T(1) only) — sufficient since length ≤ 32.
  if (length > 32) throw new Error('hkdf length > 32 not supported here');
  const t1Input = new Uint8Array(info.length + 1);
  t1Input.set(info, 0);
  t1Input[info.length] = 0x01;
  const t1 = hmacSha256(prk, t1Input);
  return t1.slice(0, length);
}

function buildKeyInfo(uaPublic: Uint8Array, asPublic: Uint8Array): Uint8Array {
  // RFC 8291 §3.4: "WebPush: info\0" || ua_public(65) || as_public(65)
  const label = utf8('WebPush: info\0');
  const out = new Uint8Array(label.length + uaPublic.length + asPublic.length);
  out.set(label, 0);
  out.set(uaPublic, label.length);
  out.set(asPublic, label.length + uaPublic.length);
  return out;
}

async function aesGcmEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(key),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv), tagLength: 128 },
    cryptoKey,
    new Uint8Array(plaintext),
  );
  return new Uint8Array(ct);
}

// ---------------------------------------------------------------------------
// Encoding helpers (base64url, utf8, DER ↔ JOSE)
// ---------------------------------------------------------------------------

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Convert an ECDSA signature from ASN.1 DER to JOSE r||s (each `n` bytes).
 *
 * The DER signature is `SEQUENCE { INTEGER r, INTEGER s }`. ASN.1 INTEGERs
 * may have a leading 0x00 byte to keep them non-negative; strip it.
 */
function derToJoseEcdsaSig(der: Uint8Array, n: number): Uint8Array {
  if (der[0] !== 0x30) throw new Error('invalid DER (no SEQUENCE)');
  let i = 2;
  if (der[1]! & 0x80) {
    // long-form length
    i = 2 + (der[1]! & 0x7f);
  }
  if (der[i] !== 0x02) throw new Error('invalid DER (no INTEGER r)');
  const rLen = der[i + 1]!;
  let rStart = i + 2;
  let rEnd = rStart + rLen;
  while (der[rStart] === 0x00 && rEnd - rStart > n) rStart += 1;
  i = rEnd;
  if (der[i] !== 0x02) throw new Error('invalid DER (no INTEGER s)');
  const sLen = der[i + 1]!;
  let sStart = i + 2;
  let sEnd = sStart + sLen;
  while (der[sStart] === 0x00 && sEnd - sStart > n) sStart += 1;

  const out = new Uint8Array(n * 2);
  // Right-align each integer into n bytes.
  out.set(der.slice(rStart, rEnd), n - (rEnd - rStart));
  out.set(der.slice(sStart, sEnd), n + n - (sEnd - sStart));
  return out;
}
