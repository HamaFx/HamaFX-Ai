import type { Metadata } from 'next';
import Image from 'next/image';

import { LoginForm } from './_components/login-form';

export const metadata: Metadata = {
  title: 'Sign in',
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat';

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden px-6 py-12"
      style={{ background: 'oklch(13% 0.018 265)' }}
    >
      {/* Animated ambient orbs */}
      <div
        aria-hidden="true"
        className="animate-orb-1 pointer-events-none absolute left-1/2 top-1/3 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[120px]"
        style={{ background: 'oklch(78% 0.16 78 / 1)' }}
      />
      <div
        aria-hidden="true"
        className="animate-orb-2 pointer-events-none absolute -bottom-32 -right-32 h-[28rem] w-[28rem] rounded-full opacity-25 blur-[120px]"
        style={{ background: 'oklch(72% 0.18 295 / 1)' }}
      />
      <div
        aria-hidden="true"
        className="animate-orb-3 pointer-events-none absolute -top-32 -left-32 h-[24rem] w-[24rem] rounded-full opacity-20 blur-[100px]"
        style={{ background: 'oklch(72% 0.16 200 / 1)' }}
      />
      {/* Noise overlay */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.03] mix-blend-overlay"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="login-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#login-noise)" />
      </svg>

      <div className="card-premium relative z-10 flex w-full max-w-sm flex-col items-stretch gap-7 px-7 py-9">
        <header className="flex flex-col items-center gap-3.5 text-center">
          <div className="relative">
            <Image
              src="/icons/icon-192.png"
              alt=""
              width={64}
              height={64}
              className="rounded-2xl shadow-xl shadow-black/40"
              priority
            />
            <span
              aria-hidden="true"
              className="animate-breathe absolute inset-0 -z-10 rounded-2xl"
              style={{
                background:
                  'linear-gradient(135deg, oklch(78% 0.16 78 / 0.5), oklch(72% 0.18 295 / 0.5))',
                filter: 'blur(20px)',
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-fg text-2xl font-bold tracking-tight">
              Hama<span className="text-brand">FX</span>
              <span className="text-fg-subtle font-normal">·Ai</span>
            </h1>
            <p className="text-fg-muted text-sm">Personal trading copilot</p>
          </div>
        </header>
        <LoginForm next={safeNext} />
        <p className="text-fg-subtle text-center text-[11px]">
          XAUUSD · EURUSD · GBPUSD
        </p>
      </div>
    </main>
  );
}
