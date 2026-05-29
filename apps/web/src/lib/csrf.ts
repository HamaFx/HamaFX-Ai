// CSRF protection utilities for the client side.
// Phase 3 hardening §22.

/**
 * Extracts the `hfx_csrf` cookie value set by the edge middleware.
 */
export function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\s*)hfx_csrf=([^;]*)/);
  return match && match[1] !== undefined ? decodeURIComponent(match[1]) : undefined;
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
