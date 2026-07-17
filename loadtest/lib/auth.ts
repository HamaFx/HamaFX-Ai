// Auth harness for k6 load tests.
//
// Implements both strategies from the prompt plan (Section 4):
//   Strategy A ('legacy'): no cookies/CSRF needed; the SUT runs with
//     AUTH_MODE=legacy and NODE_ENV !== 'production'.
//   Strategy B ('session'): real NextAuth credentials login to obtain
//     session cookies + CSRF tokens for N seeded users.
//
// Usage:
//   export function setup() { return bootstrapAuth(); }
//   export default function (ctxs) {
//     const ctx = pickUser(ctxs);
//     applyAuth(ctx);
//     // ... make requests ...
//   }

import http from 'k6/http';
import type { RefinedResponse, ResponseType } from 'k6/http';
import type { SessionCtx } from '../config/environments';
import { env } from '../config/environments';
import seededUsers from './data/seeded-users.json' with { type: 'json' };

// ── Bootstrap (called in setup()) ──────────────────────────────────

export function bootstrapAuth(): SessionCtx[] {
  if (env.authMode === 'legacy') {
    return bootstrapLegacy();
  }
  return bootstrapSession();
}

/** Strategy A: single synthetic context. No cookies or CSRF needed. */
function bootstrapLegacy(): SessionCtx[] {
  return [
    {
      cookies: {},
      csrfToken: '',
      email: '__system__',
    },
  ];
}

/** Strategy B: log in each seeded user and capture session + CSRF cookies. */
function bootstrapSession(): SessionCtx[] {
  const ctxs: SessionCtx[] = [];

  // Look up seeded users from the manifest written by seed-users.mjs.
  // If the manifest is missing or empty, we can't run Strategy B.
  const users = Array.isArray(seededUsers) ? seededUsers : [];
  if (users.length === 0) {
    throw new Error(
      'No seeded users found in lib/data/seeded-users.json. ' +
        'Run "npm run seed" first (Strategy B only).',
    );
  }

  for (const user of users.slice(0, env.userCount)) {
    const loginRes = http.get(`${env.baseUrl}/api/auth/csrf`, {
      tags: { group: 'auth_setup' },
    });

    // The CSRF endpoint returns { csrfToken: "..." }
    let csrfSetupToken = '';
    try {
      const body = JSON.parse(loginRes.body as string);
      csrfSetupToken = body.csrfToken ?? '';
    } catch {
      // If JSON parse fails, try to extract from cookie
    }

    // POST the credentials callback to sign in.
    // We need the CSRF token from /api/auth/csrf for this POST.
    const callbackRes = http.post(
      `${env.baseUrl}/api/auth/callback/credentials`,
      JSON.stringify({
        csrfToken: csrfSetupToken,
        email: user.email,
        password: env.password,
        redirect: false,
        callbackUrl: `${env.baseUrl}/chat`,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...(csrfSetupToken
            ? { 'x-csrf-token': csrfSetupToken }
            : {}),
        },
        tags: { group: 'auth_setup' },
        redirects: 0, // Don't follow; we want the Set-Cookie header
      },
    );

    // Extract session cookie from the response.
    const sessionCookie = extractCookie(callbackRes, 'authjs.session-token');
    if (!sessionCookie) {
      throw new Error(
        `Failed to obtain session cookie for ${user.email}. ` +
          `Response status: ${callbackRes.status}`,
      );
    }

    // Do one GET to any endpoint to receive the hfx_csrf cookie.
    // Middleware uses 'hfx_csrf' in dev and '__Host-hfx_csrf' in prod.
    const warmupRes = http.get(
      `${env.baseUrl}/api/chat/threads`,
      {
        cookies: { 'authjs.session-token': sessionCookie },
        tags: { group: 'auth_setup' },
      },
    );

    const csrfCookie =
      extractCookie(warmupRes, 'hfx_csrf') ??
      extractCookie(warmupRes, '__Host-hfx_csrf') ??
      '';

    ctxs.push({
      cookies: { 'authjs.session-token': sessionCookie },
      csrfToken: csrfCookie,
      email: user.email,
      threadId: user.threadId,
    });
  }

  return ctxs;
}

// ── Apply (called at the start of each VU iteration) ────────────────

/**
 * Set the per-VU cookie jar and return the CSRF header (if any) for
 * state-changing requests.
 */
export function applyAuth(ctx: SessionCtx): { csrfHeader: Record<string, string> } {
  const jar = http.cookieJar();
  jar.clear(env.baseUrl);

  for (const [name, value] of Object.entries(ctx.cookies)) {
    jar.set(env.baseUrl, name, value);
  }

  if (ctx.csrfToken) {
    return { csrfHeader: { 'x-csrf-token': ctx.csrfToken } };
  }
  return { csrfHeader: {} };
}

// ── User selection ─────────────────────────────────────────────────

/**
 * Deterministic user selection by __VU/__ITER so load spreads across
 * seeded users.
 */
export function pickUser(ctxs: SessionCtx[]): SessionCtx {
  if (ctxs.length === 0) {
    throw new Error('No auth contexts available');
  }
  const idx = (__VU * 7919 + __ITER * 6271) % ctxs.length;
  return ctxs[idx]!;
}

// ── Helpers ────────────────────────────────────────────────────────

function extractCookie(
  res: RefinedResponse<ResponseType | undefined>,
  name: string,
): string | undefined {
  const setCookie = res.headers['Set-Cookie'];
  if (!setCookie) return undefined;
  // Set-Cookie may be a comma-joined string or an array.
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of cookies) {
    const match = c.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return undefined;
}
