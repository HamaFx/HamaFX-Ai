import type { Metadata } from 'next';

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
    <main className="bg-bg flex min-h-svh items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-sm flex-col items-stretch gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-fg text-2xl font-semibold tracking-tight">HamaFX-Ai</h1>
          <p className="text-fg-muted text-sm">Personal trading copilot. Enter your password.</p>
        </header>
        <LoginForm next={safeNext} />
      </div>
    </main>
  );
}
