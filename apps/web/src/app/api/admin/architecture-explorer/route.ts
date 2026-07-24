// SPDX-License-Identifier: Apache-2.0

// Admin-only route that serves the self-contained architecture explorer HTML.
// Requires admin authentication — not publicly accessible.
// The CSP is explicitly set to allow inline scripts and same-origin resources
// because the explorer's scripts don't have the nonce that the main app's
// middleware CSP requires via 'strict-dynamic'.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { withAdminAuth } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// SECURITY: The explorer HTML contains inline scripts that do not carry the
// middleware nonce. We use 'unsafe-inline' in the CSP because hashing all
// inline scripts would require the generator to output stable hashes. This
// route is admin-only so the risk is limited.
//
// The file contents are cached at module scope after the first successful
// read so we don't hit disk on every request.

const EXPLORER_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join('; ');

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  // no-cache prevents Vercel edge CDN from serving stale CSP headers
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'CDN-Cache-Control': 'no-cache',
  'Content-Security-Policy': EXPLORER_CSP,
  'X-Content-Type-Options': 'nosniff',
};

const htmlPath = resolve(process.cwd(), 'public', 'architecture-explorer.html');
let cachedHtml: string | null = null;

function loadHtml(): string {
  if (cachedHtml !== null) return cachedHtml;
  cachedHtml = readFileSync(htmlPath, 'utf-8');
  return cachedHtml;
}

export const GET = withAdminAuth(async () => {
  // The HTML file is copied into apps/web/public/ by predeploy-migrate.mjs.
  // public/ is guaranteed to be available in Vercel serverless functions.

  try {
    const html = loadHtml();
    return new Response(html, { headers: HTML_HEADERS });
  } catch {
    return new Response(
      '<html><body><h2>Architecture Explorer Not Found</h2><p>Run <code>npx tsx src/index.ts --root &lt;project-root&gt;</code> from <code>tools/architecture-explorer</code> to generate it.</p></body></html>',
      {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
  }
});
