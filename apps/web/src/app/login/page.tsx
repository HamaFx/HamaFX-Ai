import type { Metadata } from 'next';
import Image from 'next/image';

import { AmbientBackground } from '@/components/layout/ambient-background';

import { LoginForm } from './_components/login-form';

export const metadata: Metadata = {
  title: 'Sign in',
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

// Pure black canvas with a single warm orb behind the card. The previous
// version painted three vivid orbs + a noise filter on top of a tinted-blue
// surface — that read as "decorated dark blue" rather than "premium black".
export default async function LoginPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat';

  return (
    <main
      className="bg-bg relative flex min-h-svh flex-col overflow-hidden px-6"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 24px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
      }}
    >
      <AmbientBackground intensity="vivid" />

      {/* Mobile-first layout: header sits at top quarter, form is anchored
          to the lower half so the CTA lands in the thumb zone. */}
      <div className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-between gap-12 py-8">
        <header className="flex flex-col items-center gap-4 text-center">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={80}
            height={80}
            className="rounded-2xl shadow-xl shadow-black/60"
            priority
          />
          <div className="flex flex-col gap-2">
            <h1 className="text-fg text-3xl font-bold tracking-tight">
              Hama<span className="text-brand">FX</span>
              <span className="text-fg-subtle font-normal">·Ai</span>
            </h1>
            <p className="text-fg-muted text-base">Personal trading copilot</p>
          </div>
        </header>

        <div className="flex flex-col gap-6">
          <div className="card-premium p-6">
            <LoginForm next={safeNext} />
          </div>
          <p className="text-fg-subtle text-center text-xs tabular-nums">
            XAUUSD · EURUSD · GBPUSD
          </p>
        </div>
      </div>
    </main>
  );
}
