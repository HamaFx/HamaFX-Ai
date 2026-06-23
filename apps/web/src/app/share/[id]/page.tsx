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

// /share/[id] — public read route for analysis snapshots.
//
// Bypassed by the password gate (see middleware.ts) and verified instead
// by an HMAC-signed token in the `?t=<token>` query param. The route
// renders title + body + (optional) overlay-on-chart preview.
//
// Status responses:
//   - 401 (rendered) → missing/invalid token
//   - 410 (rendered) → snapshot expired
//   - 404 (rendered) → snapshot id not found

import { getActiveSnapshot, verifyShareToken } from '@hamafx/ai';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) {
    return { title: 'Not Found' };
  }
  return { title: `Shared analysis · ${id.slice(0, 8)}` };
}

export default async function ShareSnapshotPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const token = sp.t ?? '';

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) {
    notFound();
  }

  const secret = process.env.AUTH_COOKIE_SECRET ?? '';
  const payload = secret ? verifyShareToken(token, secret) : null;
  if (!payload || payload.id !== id) {
    notFound();
  }

  const snap = await getActiveSnapshot(id);
  if (!snap) {
    notFound();
  }

  return (
    <ShareShell title={snap.title}>
      <article className="prose prose-invert max-w-none text-sm leading-relaxed">
        <p className="text-fg-muted whitespace-pre-wrap">{snap.body}</p>
      </article>
      {snap.overlay && snap.symbol && snap.tf ? (
        <section
          aria-label="Chart annotations"
          className="border-border bg-bg-elev-1 mt-4 rounded-lg border p-3"
        >
          <header className="mb-2 flex items-baseline justify-between">
            <h2 className="text-fg-muted text-sm font-medium">
              {snap.symbol} · {snap.tf}
            </h2>
            <span className="text-fg-subtle text-caption tabular-nums">
              {snap.overlay.markers.length}m / {snap.overlay.priceLines.length}l
            </span>
          </header>
          <ul className="text-fg-muted flex flex-wrap gap-1.5 text-body-sm">
            {snap.overlay.priceLines.slice(0, 8).map((line, i) => (
              <li
                key={`${line.title}-${i}`}
                className="border-border bg-bg-elev-2 rounded px-2 py-0.5"
                style={{ borderColor: line.color }}
              >
                {line.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <footer className="text-fg-subtle mt-4 text-caption">
        HamaFX-Ai · expires {new Date(snap.expiresAt).toISOString().slice(0, 16).replace('T', ' ')}Z
      </footer>
    </ShareShell>
  );
}

function ShareShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="bg-bg text-fg mx-auto flex min-h-svh max-w-2xl flex-col gap-3 p-4">
      <header>
        <h1 className="text-fg text-base font-semibold">{title}</h1>
      </header>
      {children}
    </main>
  );
}
