// HMAC-SHA-256 share-token sign + verify.
//
// Token format (matches the auth-cookie scheme in apps/web/src/lib/auth.ts):
//   base64url(payloadJson) + "." + base64url(hmacSha256Sig)
//
// Payload shape: { id: uuid, exp: ms epoch }. We hash with the same
// `AUTH_COOKIE_SECRET` the session cookie uses, so rotating that secret
// invalidates active share links — same blast radius as the session
// cookie, which the user already accepts.

import { createHmac, randomUUID } from 'node:crypto';

export interface ShareTokenPayload {
  /** uuid of the shared_snapshots row. */
  id: string;
  /** ms epoch UTC at which the token expires. */
  exp: number;
}

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Buffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replaceAll('-', '+').replaceAll('_', '/') + pad, 'base64');
}

function hmac(secret: string, payload: Buffer): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

/** Constant-time compare of two equal-length buffers. */
function timingSafeEqualBytes(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a[i]! ^ b[i]!;
  return result === 0;
}

export function signShareToken(payload: ShareTokenPayload, secret: string): string {
  const json = Buffer.from(JSON.stringify(payload), 'utf-8');
  const sig = hmac(secret, json);
  return `${toBase64Url(json)}.${toBase64Url(sig)}`;
}

export function verifyShareToken(token: string, secret: string): ShareTokenPayload | null {
  const dot = token.indexOf('.');
  if (dot < 1 || dot >= token.length - 1) return null;

  let payloadBytes: Buffer;
  let sigBytes: Buffer;
  try {
    payloadBytes = fromBase64Url(token.slice(0, dot));
    sigBytes = fromBase64Url(token.slice(dot + 1));
  } catch {
    return null;
  }

  const expected = hmac(secret, payloadBytes);
  if (!timingSafeEqualBytes(expected, sigBytes)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadBytes.toString('utf-8'));
  } catch {
    return null;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as ShareTokenPayload).id !== 'string' ||
    typeof (parsed as ShareTokenPayload).exp !== 'number'
  ) {
    return null;
  }

  const p = parsed as ShareTokenPayload;
  if (p.exp < Date.now()) return null;
  return p;
}

/**
 * Convenience for creating fresh payloads in tests + the share tool.
 * Uses a v4 uuid for the snapshot id.
 */
export function newShareId(): string {
  return randomUUID();
}
