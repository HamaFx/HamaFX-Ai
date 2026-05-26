// POST /api/auth/login
//
// Personal-mode: a single password gate. We do a constant-time compare and,
// on success, set the signed `hfx_auth` cookie. No accounts, no sessions DB.

import { z } from 'zod';

import { AUTH_COOKIE_NAME, authCookieSerialized, signAuthToken, timingSafeEqual } from '@/lib/auth';
import { getAuthEnv } from '@/lib/env';

export const runtime = 'nodejs';

const Body = z.object({
  password: z.string().min(1),
});

/* --------------------------------------------------------------------------
 * Light-touch in-memory rate limit.
 * Buckets per IP. State only persists within a warm function instance — it's
 * a deterrent, not a real defence. For real hardening, swap to Upstash
 * `@upstash/ratelimit` later (kept off the critical path for personal mode).
 * -------------------------------------------------------------------------- */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= MAX_ATTEMPTS) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true };
}

function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(req: Request): Promise<Response> {
  const ip = getClientIp(req);
  const limit = rateLimit(ip);
  if (!limit.ok) {
    return Response.json(
      { error: { code: 'AUTH', message: 'Too many attempts. Try again later.' } },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION', message: 'Invalid JSON' } },
      { status: 400 },
    );
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'VALIDATION', message: 'Password required' } },
      { status: 400 },
    );
  }

  const env = getAuthEnv();
  if (!timingSafeEqual(parsed.data.password, env.APP_PASSWORD)) {
    return Response.json(
      { error: { code: 'AUTH', message: 'Incorrect password' } },
      { status: 401 },
    );
  }

  const token = await signAuthToken(env.AUTH_COOKIE_SECRET);
  const isProd = process.env.NODE_ENV === 'production';

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': authCookieSerialized(token, isProd),
    },
  });
}

// Tiny helper so we don't import an unused name.
void AUTH_COOKIE_NAME;
