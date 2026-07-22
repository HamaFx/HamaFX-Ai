// SPDX-License-Identifier: Apache-2.0

// Admin-only route that serves the self-contained architecture explorer HTML.
// Requires admin authentication — not publicly accessible.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { withAdminAuth } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminAuth(async () => {
  // The HTML file is copied into apps/web/docs/ by predeploy-migrate.mjs.
  // On Vercel, process.cwd() is the Next.js project root (apps/web/).
  const htmlPath = resolve(process.cwd(), 'docs', 'architecture-explorer.html');

  try {
    const html = readFileSync(htmlPath, 'utf-8');
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
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
