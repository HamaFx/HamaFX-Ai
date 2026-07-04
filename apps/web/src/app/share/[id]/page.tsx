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
// renders markdown body, branded frame, chart annotations, and OG image.
//
// Status responses:
//   - 401 (rendered) → missing/invalid token
//   - 410 (rendered) → snapshot expired
//   - 404 (rendered) → snapshot id not found

import { getActiveSnapshot, verifyShareToken } from '@hamafx/ai';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

  const expiry = new Date(snap.expiresAt).toISOString().slice(0, 16).replace('T', ' ');

  return (
    <div className="min-h-svh bg-zinc-950 text-fg flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <div className="size-8 rounded-sm bg-zinc-900 text-fg flex items-center justify-center">
          <Sparkles className="size-4" />
        </div>
        <div>
          <h1 className="text-fg text-base font-bold">HamaFX·Ai</h1>
          <p className="text-fg-subtle text-caption">AI Trading Analysis</p>
        </div>
      </header>
      <main className="mx-auto max-w-2xl w-full px-4 py-6 flex flex-col gap-4">
        <h2 className="text-fg text-lg font-semibold">{snap.title}</h2>

        <article className="md-prose max-w-none text-sm leading-[1.4]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {snap.body}
          </ReactMarkdown>
        </article>

        {snap.overlay && snap.symbol && snap.tf ? (
          <section
            aria-label="Chart annotations"
            className="border border-zinc-800 bg-zinc-950 rounded-sm p-3"
          >
            <header className="mb-2 flex items-baseline justify-between">
              <h3 className="text-fg-muted text-sm font-medium">
                {snap.symbol} · {snap.tf}
              </h3>
              <span className="text-fg-subtle text-caption tabular-nums">
                {snap.overlay.markers.length}m / {snap.overlay.priceLines.length}l
              </span>
            </header>
            {snap.overlay.priceLines.length > 0 && (
              <div className="relative h-12 w-full bg-zinc-900 rounded-sm border border-zinc-800 mb-3 overflow-hidden">
                {(() => {
                  const lines = snap.overlay.priceLines;
                  const prices = lines.map(l => typeof l.price === 'number' ? l.price : parseFloat(l.price as string)).filter(p => !isNaN(p));
                  if (prices.length === 0) return null;
                  const min = Math.min(...prices);
                  const max = Math.max(...prices);
                  const range = max - min || 1;
                  return (
                    <svg className="size-full" viewBox="0 0 100 48" preserveAspectRatio="none" aria-label="Price lines visualization">
                      {lines.slice(0, 20).map((line, i) => {
                        const y = ((parseFloat(String(line.price)) - min) / range) * 100;
                        return (
                          <line
                            key={i}
                            x1="0" y1={`${y}%`} x2="100" y2={`${y}%`}
                            stroke={line.color || '#FAFAFA'}
                            strokeWidth="1.5"
                            strokeDasharray={i % 2 === 0 ? 'none' : '4 2'}
                          />
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>
            )}
            <ul className="text-fg-muted flex flex-wrap gap-1.5 text-body-sm">
              {snap.overlay.priceLines.slice(0, 8).map((line, i) => (
                <li
                  key={`${line.title}-${i}`}
                  className="border border-zinc-800 bg-zinc-900 rounded px-2 py-0.5"
                  style={{ borderColor: line.color }}
                >
                  {line.title}: {String(line.price)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <footer className="border-t border-zinc-800 px-6 py-4 text-center">
        <p className="text-fg-subtle text-caption">
          Generated by HamaFX·Ai · expires {expiry}Z
        </p>
      </footer>
    </div>
  );
}
