'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resetPasswordAction } from '../actions';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(resetPasswordAction, { error: '' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);

  const passwordsMatch = password === confirmPassword;
  const confirmTouched = confirmPassword.length > 0;

  useEffect(() => {
    if (state?.success && countdown === null) {
      setCountdown(3);
    }
  }, [state?.success, countdown]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const id = setTimeout(() => {
      if (countdown <= 1) {
        router.push('/login');
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown, router]);

  if (!token) {
    return (
      <div className="flex flex-col gap-6">
        <div className="surface-panel p-6">
          <p className="text-red-500 text-sm">Invalid or missing reset link. Please request a new one.</p>
          <div className="mt-4">
            <Link href="/forgot-password" className="text-fg font-medium hover:underline text-sm">
              Request new reset link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const submitDisabled = pending || !!state?.success || (confirmTouched && !passwordsMatch);

  return (
    <div className="flex flex-col gap-6">
      <div className="surface-panel p-6">
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
                  <span className={password.length >= 8 ? "text-emerald-500" : "text-red-500"}>
                    {password.length >= 8 ? "✓" : "✗"}
                  </span>
                  <span>Min 8 characters</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={/[A-Z]/.test(password) ? "text-emerald-500" : "text-red-500"}>
                    {/[A-Z]/.test(password) ? "✓" : "✗"}
                  </span>
                  <span>One uppercase letter</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={/[a-z]/.test(password) ? "text-emerald-500" : "text-red-500"}>
                    {/[a-z]/.test(password) ? "✓" : "✗"}
                  </span>
                  <span>One lowercase letter</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={/[0-9]/.test(password) ? "text-emerald-500" : "text-red-500"}>
                    {/[0-9]/.test(password) ? "✓" : "✗"}
                  </span>
                  <span>One number</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="confirm-password" className="text-fg text-sm font-semibold">
              Confirm New Password
            </label>
            <Input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              disabled={pending || !!state?.success}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {confirmTouched && !passwordsMatch ? (
              <p role="alert" className="text-red-500 text-xs mt-1">Passwords do not match</p>
            ) : null}
          </div>

          {state?.error ? (
            <p id="error" role="alert" className="text-red-500 text-sm">
              {state.error}
            </p>
          ) : null}

          {state?.success ? (
            <p className="text-emerald-500 text-sm">{state.message}</p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            loading={pending}
            disabled={submitDisabled}
            variant={state?.success ? 'success' : 'primary'}
          >
            {state?.success ? 'Password reset' : 'Reset password'}
          </Button>
        </form>
      </div>

      {state?.success ? (
        <p className="text-fg-subtle text-center text-sm">
          <Link href="/login" className="text-fg font-medium hover:underline">
            Redirecting to sign in in {countdown}s…
          </Link>
        </p>
      ) : (
        <p className="text-fg-subtle text-center text-sm">
          <Link href="/login" className="text-fg font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      )}
    </div>
  );
}
