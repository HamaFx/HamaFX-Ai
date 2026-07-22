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

const EXPLORER_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://d3js.org",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join('; ');

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
  'Content-Security-Policy': EXPLORER_CSP,
  'X-Content-Type-Options': 'nosniff',
};

export const GET = withAdminAuth(async () => {
  // The HTML file is copied into apps/web/docs/ by predeploy-migrate.mjs.
  const htmlPath = resolve(process.cwd(), 'docs', 'architecture-explorer.html');

  try {
    const html = readFileSync(htmlPath, 'utf-8');
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
