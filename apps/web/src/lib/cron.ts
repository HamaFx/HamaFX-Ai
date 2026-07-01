/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Helpers for Vercel-Cron-triggered route handlers.
//
// Vercel sends `Authorization: Bearer ${CRON_SECRET}` on every cron
// invocation when `crons` is configured in vercel.json and
// `CRON_SECRET` is set in env. The same secret is used by the GCE-VM
// systemd timers that hit the light cron URLs.
//
// `withCronAuth` is the sole entry point. It accepts two flavours of
// credential:
//
//   1. **Bearer token** (schedulers) — `Authorization: Bearer <secret>`.
//      Stable across deploys; rotate with the rest of the env block.
//   2. **Session cookie** (admin UI refresh buttons) — the same
//      password-cookie that gates the rest of the app. Lets the
//      operator hand-trigger a cron from the dashboard without
//      pasting `CRON_SECRET` into the client.
//
// Phase 3 hardening §15 — the synchronous `assertCronAuth` helper that
// used to live alongside `withCronAuth` was removed. It only ever
// covered path 1 (sync verification), so callers always had to fall
// back to the async path anyway. One canonical entry point keeps the
// auth contract obvious.

import * as Sentry from '@sentry/nextjs';

import { getAuthEnv } from './env';

// Keep-alive for the legacy signed-cookie auth used by the admin-UI
// cron trigger path. The crypto primitives live here to avoid dragging
// back the deleted `lib/auth.ts` module.

const AUTH_COOKIE_NAME = 'hfx_auth';

interface AuthPayload {
  iat: number;
  exp: number;
}

type Bytes = Uint8Array<ArrayBuffer>;

function utf8(s: string): Bytes {
  const enc = new TextEncoder().encode(s);
  const out = new Uint8Array(new ArrayBuffer(enc.byteLength));
  out.set(enc);
  return out;
}

function base64UrlToBytes(s: string): Bytes {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function verifyAuthToken(
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

/**
 * Tiny wrapper for cron handler bodies — handles auth + JSON response
 * shape + uniform error envelope. Accepts the bearer token (the
 * cron-scheduler path) or a valid session cookie (the admin-UI path).
 *
 * Returns 401 when neither credential is present or valid; 500 when
 * the handler body throws (with the error message in the response so
 * cron logs are useful for debugging).
 */
export async function withCronAuth(
  req: Request,
  fn: () => Promise<{ processed: number; note?: string }>,
): Promise<Response> {
  const env = getAuthEnv();

  // Path 1: Bearer token (cron schedulers).
  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.CRON_SECRET}`;
  const hasBearerAuth = header.length > 0 && timingSafeEqual(header, expected);

  // Path 2: Session cookie (admin UI refresh buttons).
  let hasSessionAuth = false;
  if (!hasBearerAuth) {
    const cookieHeader = req.headers.get('cookie') ?? '';
    const token = readCookie(cookieHeader, AUTH_COOKIE_NAME);
    if (token) {
      const payload = await verifyAuthToken(token, env.AUTH_COOKIE_SECRET ?? '');
      hasSessionAuth = payload !== null;
    }
  }

  if (!hasBearerAuth && !hasSessionAuth) {
    return Response.json({ error: { code: 'AUTH', message: 'Unauthorized' } }, { status: 401 });
  }

  try {
    const result = await fn();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: 'cron', route: routeTag(req), kind: 'handler-error' },
    });
    console.error('[cron] handler error', err);
    return Response.json(
      { error: { code: 'INTERNAL', message: 'Internal error' } },
      { status: 500 },
    );
  }
}

function readCookie(header: string, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

function routeTag(req: Request): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return 'unknown';
  }
}

export async function runCronJob(name: string, fn: () => Promise<void>, options: { timeout?: number } = {}): Promise<Response> {
  const startTime = Date.now();
  try {
    const timeout = options.timeout ?? 30_000;
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Cron job ${name} timed out`)), timeout)),
    ]);
    return Response.json({ ok: true, duration: Date.now() - startTime });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: 'cron', job: name, kind: 'job-error' },
    });
    console.error(`[cron] ${name} failed:`, error);
    return Response.json({ error: { code: 'INTERNAL', message: 'Internal error' } }, { status: 500 });
  }
}
