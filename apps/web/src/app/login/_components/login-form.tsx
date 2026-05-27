'use client';

import { Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface LoginFormProps {
  next: string;
}

export function LoginForm({ next }: LoginFormProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setStatus('submitting');
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
        setStatus('idle');
        return;
      }
      // Brief success flash before redirect.
      setStatus('success');
      setTimeout(() => window.location.assign(next), 350);
    } catch {
      setError('Network error — try again.');
      setStatus('idle');
    }
  }

  const submitting = status === 'submitting';
  const success = status === 'success';

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
          disabled={submitting || success}
        />
      </div>
      {error ? (
        <p id="login-error" role="alert" className="text-bear text-sm">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        loading={submitting}
        disabled={!password || submitting || success}
        className={success ? '!bg-bull !text-bg transition-colors' : ''}
      >
        {success ? (
          <>
            <Check className="size-4" /> Welcome
          </>
        ) : submitting ? (
          'Signing in…'
        ) : (
          'Sign in'
        )}
      </Button>
    </form>
  );
}
