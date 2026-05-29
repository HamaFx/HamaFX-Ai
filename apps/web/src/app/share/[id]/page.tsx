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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Shared analysis · ${id.slice(0, 8)}` };
}

export default async function ShareSnapshotPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const token = sp.t ?? '';

  const secret = process.env.AUTH_COOKIE_SECRET ?? '';
  const payload = secret ? verifyShareToken(token, secret) : null;
  if (!payload || payload.id !== id) {
    return (
      <ShareShell title="Link expired or invalid">
        <p className="text-fg-muted text-sm">
          This share link couldn&apos;t be verified. It may be expired or tampered with.
        </p>
      </ShareShell>
    );
  }

  const snap = await getActiveSnapshot(id);
  if (!snap) {
    return (
      <ShareShell title="Snapshot not available">
        <p className="text-fg-muted text-sm">
          This snapshot has expired or been removed.
        </p>
      </ShareShell>
    );
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
            <span className="text-fg-subtle text-[10px] tabular-nums">
              {snap.overlay.markers.length}m / {snap.overlay.priceLines.length}l
            </span>
          </header>
          <ul className="text-fg-muted flex flex-wrap gap-1.5 text-[11px]">
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
      <footer className="text-fg-subtle mt-4 text-[10px]">
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
