// Signed cookie auth — Edge-compatible (Web Crypto only).
//
// Token format:   base64url(payloadJson) + "." + base64url(hmacSha256Sig)
// Payload shape:  { iat: number; exp: number }   (ms epoch)
//
// Used by:
//   - /api/auth/login         → signCookie()
//   - /api/auth/logout        → clearCookie()
//   - middleware.ts           → verifyCookie()
//   - route handlers (Node)   → requireAuth()

const COOKIE_NAME = 'hfx_auth';
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AuthPayload {
  iat: number;
  exp: number;
}

/* --------------------------------------------------------------------------
 * base64url helpers (Edge-safe — uses btoa/atob, no Buffer)
 *
 * Helpers always allocate a fresh `ArrayBuffer`-backed `Uint8Array` so the
 * result satisfies `BufferSource` (= `ArrayBufferView<ArrayBuffer>`) without
 * casts. TS 5.9's lib.dom rejects `Uint8Array<ArrayBufferLike>` for crypto
 * inputs because that union includes `SharedArrayBuffer`.
 * -------------------------------------------------------------------------- */

type Bytes = Uint8Array<ArrayBuffer>;

function utf8(s: string): Bytes {
  const enc = new TextEncoder().encode(s);
  const out = new Uint8Array(new ArrayBuffer(enc.byteLength));
  out.set(enc);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin).replaceAll('+', '-').replaceAll('_', '/').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Bytes {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* --------------------------------------------------------------------------
 * HMAC-SHA-256 (Web Crypto)
 * -------------------------------------------------------------------------- */

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

/* --------------------------------------------------------------------------
 * Constant-time string comparison.
 * Length difference still leaks length, but values are fixed-length here.
 * -------------------------------------------------------------------------- */

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/* --------------------------------------------------------------------------
 * Sign / verify
 * -------------------------------------------------------------------------- */

export async function signAuthToken(
  secret: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<string> {
  const now = Date.now();
  const payload: AuthPayload = { iat: now, exp: now + ttlMs };
  const payloadBytes = utf8(JSON.stringify(payload));
  const key = await getKey(secret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, payloadBytes);
  const sigBytes = new Uint8Array(new ArrayBuffer(sigBuf.byteLength));
  sigBytes.set(new Uint8Array(sigBuf));
  return `${bytesToBase64Url(payloadBytes)}.${bytesToBase64Url(sigBytes)}`;
}

export async function verifyAuthToken(
  token: string | undefined,
  secret: string,
): Promise<AuthPayload | null> {
  if (!token) return null;

  const dot = token.indexOf('.');
  if (dot < 1 || dot >= token.length - 1) return null;

  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let payloadBytes: Bytes;
  let sigBytes: Bytes;
  try {
    payloadBytes = base64UrlToBytes(payloadB64);
    sigBytes = base64UrlToBytes(sigB64);
  } catch {
    return null;
  }

  const key = await getKey(secret);
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes, payloadBytes);
  if (!ok) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as AuthPayload).iat !== 'number' ||
    typeof (payload as AuthPayload).exp !== 'number'
  ) {
    return null;
  }

  const p = payload as AuthPayload;
  if (p.exp < Date.now()) return null;
  return p;
}

/* --------------------------------------------------------------------------
 * Cookie helpers — used in route handlers
 * -------------------------------------------------------------------------- */

export const AUTH_COOKIE_NAME = COOKIE_NAME;

export function authCookieSerialized(token: string, isProd: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(DEFAULT_TTL_MS / 1000)}`,
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

export function clearedCookieSerialized(isProd: boolean): string {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}
