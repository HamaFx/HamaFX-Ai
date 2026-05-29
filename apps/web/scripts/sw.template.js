/* eslint-disable no-undef, no-restricted-globals */
/**
 * sw.template.js — service worker source template.
 *
 * Consumed by apps/web/scripts/generate-sw.mjs, which substitutes
 * `__BUILD_ID__` with the resolved build id and writes the result to
 * apps/web/public/sw.js. This file is NEVER served to the browser as-is.
 *
 * Implements design §6:
 *   - install:  fetch /sw-precache.json → caches.open(CACHE_NAME).addAll(urls)
 *   - activate: delete non-current caches, clients.claim()
 *   - fetch:    strategies table (cache-first, network-first w/ timeout, bypass)
 *
 * Bypass list (per user's confirmed decision; Req 5 §10 is OFF):
 *   - /api/auth/*
 *   - /api/cron/*
 *   - /api/chat
 *   - /api/admin/*
 *   - /api/market/*
 *
 * Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.11
 */

const CACHE_NAME = 'hamafx-shell-v__BUILD_ID__';
const PRECACHE_URL = '/sw-precache.json';
const NAV_TIMEOUT_MS = 3000;

/**
 * Path prefixes that the SW must NOT handle. Requests matching any of these
 * fall through to the browser's default networking with no caching.
 *
 * `/api/chat` is a streaming SSE endpoint; intercepting would break the
 * stream. `/api/market/*` is intentionally bypassed per the user's
 * decision — Req 5 §10 (network-first cache for /api/market/quote) is OFF.
 */
const BYPASS_PREFIXES = ['/api/auth', '/api/cron', '/api/admin', '/api/chat', '/api/market'];

/** Cache-first prefixes (single-character match against URL.pathname). */
const CACHE_FIRST_PREFIXES = ['/_next/static/', '/icons/'];
const CACHE_FIRST_EXACT = new Set(['/favicon.ico', '/manifest.webmanifest']);

// --- install ---------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch(PRECACHE_URL, { cache: 'no-cache' });
        if (!res.ok) {
          throw new Error(`precache manifest HTTP ${res.status}`);
        }
        const urls = await res.json();
        if (!Array.isArray(urls)) {
          throw new Error('precache manifest is not an array');
        }
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(urls);
      } catch (err) {
        // Best-effort: a missing precache must not wedge installation.
        // The fetch handler degrades to network-only when the cache is empty.
        // eslint-disable-next-line no-console
        console.warn('[sw] precache failed:', err);
      } finally {
        // Phase 3 hardening §23 — `skipWaiting` is intentional for
        // personal-mode. The trade-off: instant updates on the next
        // navigation vs. a small risk of a tab keeping the old chunks
        // until reload. Since this is a single-user PWA where the user
        // expects "deploy → I see it", the immediate-activation path
        // wins. If we ever ship multi-page sessions or shared caches
        // we'd flip this to a postMessage handshake (`SKIP_WAITING`).
        await self.skipWaiting();
      }
    })(),
  );
});

// --- activate --------------------------------------------------------------

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// --- fetch -----------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cross-origin: passthrough, never cache.
  if (url.origin !== self.location.origin) return;

  // Bypass list: never cache, never SW-handle.
  for (const prefix of BYPASS_PREFIXES) {
    if (url.pathname.startsWith(prefix)) return;
  }

  // Navigations: network-first with timeout, fallback to cached /chat → /offline.
  if (req.mode === 'navigate') {
    event.respondWith(handleNavigation(req));
    return;
  }

  // Static fingerprinted assets + icons + manifest + favicon: cache-first.
  if (
    CACHE_FIRST_EXACT.has(url.pathname) ||
    CACHE_FIRST_PREFIXES.some((p) => url.pathname.startsWith(p))
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Everything else: network-only (no respondWith → browser default).
});

/**
 * Network-first navigation handler with a 3s timeout.
 *
 * Falls back to cached `/chat` (the app shell) and then cached `/offline`
 * (a tiny page rendered when even `/chat` is missing — e.g. first run before
 * precache populates).
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handleNavigation(req) {
  try {
    const network = await fetchWithTimeout(req, NAV_TIMEOUT_MS);
    if (network) return network;
  } catch {
    /* fall through to cache */
  }
  const cache = await caches.open(CACHE_NAME);
  const chat = await cache.match('/chat');
  if (chat) return chat;
  const offline = await cache.match('/offline');
  if (offline) return offline;
  return new Response('Offline', {
    status: 503,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

/**
 * Cache-first strategy. On a cache miss, fetch from the network and populate
 * the cache (best-effort — opaque/error responses are not cached).
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  if (hit) return hit;
  const network = await fetch(req);
  if (network && network.ok && network.type !== 'opaque') {
    try {
      await cache.put(req, network.clone());
    } catch {
      /* quota / non-cacheable — ignore */
    }
  }
  return network;
}

/**
 * Wrap fetch with an abortable timeout.
 *
 * @param {Request} req
 * @param {number} ms
 * @returns {Promise<Response>}
 */
function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    fetch(req, { signal: ctrl.signal })
      .then((r) => {
        clearTimeout(timer);
        resolve(r);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

// --- push (Phase 3) --------------------------------------------------------
//
// `push` payloads are JSON `{ title, body, url }`. Show a notification and
// stash the click target in `notification.data.url` so the click handler
// can focus an existing client or open a new one.

self.addEventListener('push', (event) => {
  /** @type {{ title?: string; body?: string; url?: string }} */
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'HamaFX-Ai', {
      body: data.body ?? '',
      data: { url: data.url ?? '/alerts' },
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'hamafx-alert',
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/alerts';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(target);
            } catch {
              /* same-origin navigation may be blocked across tabs — ignore */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
