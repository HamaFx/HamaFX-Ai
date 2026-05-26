'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface LoginFormProps {
  next: string;
}

export function LoginForm({ next }: LoginFormProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? `Login failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      // Hard reload so middleware re-evaluates cleanly.
      window.location.assign(next);
    } catch {
      setError('Network error — try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-fg-muted text-sm font-medium">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={error ? 'login-error' : undefined}
        />
      </div>
      {error ? (
        <p id="login-error" role="alert" className="text-bear text-sm">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={submitting} disabled={!password || submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
