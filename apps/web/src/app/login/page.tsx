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
  // Only allow same-origin paths in `next` to prevent open redirects.
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat';

  return (
    <main className="bg-bg relative flex min-h-svh items-center justify-center overflow-hidden px-6 py-12">
      {/* Ambient radial gradient — single static element, GPU-cheap. */}
      <div
        aria-hidden="true"
        className="bg-brand/15 pointer-events-none absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
      />
      <div
        aria-hidden="true"
        className="bg-info/10 pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] translate-x-1/3 translate-y-1/3 rounded-full blur-3xl"
      />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-stretch gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={56}
            height={56}
            className="rounded-2xl shadow-lg shadow-black/30"
            priority
          />
          <div className="flex flex-col gap-1">
            <h1 className="text-fg text-2xl font-semibold tracking-tight">HamaFX-Ai</h1>
            <p className="text-fg-muted text-sm">Personal trading copilot</p>
          </div>
        </header>
        <LoginForm next={safeNext} />
      </div>
    </main>
  );
}
