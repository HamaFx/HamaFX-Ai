'use client';

import { useActionState, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resetPasswordAction } from '../actions';
import { Suspense } from 'react';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const token = mounted ? (searchParams.get('token') || '') : '';

  const [state, action, pending] = useActionState(resetPasswordAction, { error: '' });
  const [password, setPassword] = useState('');

  if (!mounted) {
    return <div className="flex justify-center p-8"><span className="text-fg-subtle">Loading...</span></div>;
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-6">
        <div className="card-premium p-6">
          <p className="text-bear text-sm">Invalid or missing reset link. Please request a new one.</p>
          <div className="mt-4">
            <Link href="/forgot-password" className="text-brand font-medium hover:underline text-sm">
              Request new reset link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="card-premium p-6">
        <form action={action} className="flex w-full flex-col gap-5">
          <input type="hidden" name="token" value={token} />

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-fg text-sm font-semibold">
              New Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={pending || !!state?.success}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {password.length > 0 && (
              <div className="text-xs text-fg-subtle grid grid-cols-2 gap-1 mt-1">
                <div className="flex items-center gap-1">
                  <span className={password.length >= 8 ? "text-bull" : "text-bear"}>
                    {password.length >= 8 ? "✓" : "✗"}
                  </span>
                  <span>Min 8 characters</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={/[A-Z]/.test(password) ? "text-bull" : "text-bear"}>
                    {/[A-Z]/.test(password) ? "✓" : "✗"}
                  </span>
                  <span>One uppercase letter</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={/[a-z]/.test(password) ? "text-bull" : "text-bear"}>
                    {/[a-z]/.test(password) ? "✓" : "✗"}
                  </span>
                  <span>One lowercase letter</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={/[0-9]/.test(password) ? "text-bull" : "text-bear"}>
                    {/[0-9]/.test(password) ? "✓" : "✗"}
                  </span>
                  <span>One number</span>
                </div>
              </div>
            )}
          </div>

          {state?.error ? (
            <p id="error" role="alert" className="text-bear text-sm">
              {state.error}
            </p>
          ) : null}

          {state?.success ? (
            <p className="text-bull text-sm">{state.message}</p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            loading={pending}
            disabled={pending || !!state?.success}
            variant={state?.success ? 'success' : 'primary'}
          >
            {state?.success ? 'Password reset' : 'Reset password'}
          </Button>
        </form>
      </div>

      {state?.success ? (
        <p className="text-fg-subtle text-center text-sm">
          <Link href="/login" className="text-brand font-medium hover:underline">
            Sign in with new password
          </Link>
        </p>
      ) : (
        <p className="text-fg-subtle text-center text-sm">
          <Link href="/login" className="text-brand font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-8"><span className="text-fg-subtle">Loading...</span></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
