// SPDX-License-Identifier: Apache-2.0

// CSRF protection utilities for the client side.
// Phase 3 hardening §22. P2-6: __Host- prefix in production.

/**
 * Extracts the CSRF cookie value set by the edge middleware.
 * P2-6: Handles both `hfx_csrf` (dev) and `__Host-hfx_csrf` (prod) names.
 */
export function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const name of ['__Host-hfx_csrf', 'hfx_csrf']) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    if (match?.[1] !== undefined) return decodeURIComponent(match[1]);
  }
  return undefined;
}

/**
 * Wraps `fetch` arguments to automatically append the `X-CSRF-Token` header
 * if the token is available. Use this for state-changing API calls.
 */
export function withCsrf(init?: RequestInit): RequestInit {
  const token = getCsrfToken();
  if (!token) return init ?? {};

  const headers = new Headers(init?.headers);
  headers.set('X-CSRF-Token', token);

  return { ...init, headers };
}

/**
 * A drop-in replacement for `fetch` that appends the `X-CSRF-Token` header.
 */
export async function fetchCsrf(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, withCsrf(init));
}
