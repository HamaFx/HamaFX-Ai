'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resetPasswordAction } from '../actions';
import { PasswordField } from '../_components/password-field';
import { FormError } from '../_components/form-error';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(resetPasswordAction, { error: '' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);

  const passwordsMatch = password === confirmPassword;
  const confirmTouched = confirmPassword.length > 0;

  useEffect(() => {
    if (state?.success && countdown === null) setCountdown(3);
  }, [state?.success, countdown]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const id = setTimeout(() => {
      if (countdown <= 1) router.push('/login');
      else setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown, router]);

  if (!token) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-danger text-sm">Invalid or missing reset link. Please request a new one.</p>
        <Link href="/forgot-password" className="text-fg font-medium hover:underline text-sm">
          Request new reset link
        </Link>
      </div>
    );
  }

  const submitDisabled = pending || !!state?.success || (confirmTouched && !passwordsMatch);

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex w-full flex-col gap-5">
        <input type="hidden" name="token" value={token} />

        <PasswordField value={password} onChange={(e) => setPassword(e.target.value)}
          id="password" name="password" autoComplete="new-password"
          minLength={8} required disabled={pending || !!state?.success}
          showStrengthMeter />

        <div className="flex flex-col gap-2">
          <label htmlFor="confirm-password" className="text-fg text-sm font-semibold">Confirm New Password</label>
          <Input id="confirm-password" name="confirmPassword"
            type="password" autoComplete="new-password" required
            disabled={pending || !!state?.success}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={confirmTouched && !passwordsMatch} />
          {confirmTouched && !passwordsMatch && (
            <p role="alert" className="text-danger text-xs mt-1">Passwords do not match</p>
          )}
        </div>

        <FormError message={state?.error ?? ''} />

        {state?.success && (
          <p className="text-success text-sm" role="status">{state.message}</p>
        )}

        <Button type="submit" size="lg" loading={pending}
          disabled={submitDisabled}
          variant={state?.success ? 'success' : 'primary'}>
          {state?.success ? 'Password reset' : 'Reset password'}
        </Button>
      </form>

      {state?.success ? (
        <p className="text-fg-subtle text-center text-sm">
          <Link href="/login" className="text-fg font-medium hover:underline">
            Redirecting to sign in in {countdown}s…
          </Link>
        </p>
      ) : (
        <p className="text-fg-subtle text-center text-sm">
          <Link href="/login" className="text-fg font-medium hover:underline">Back to sign in</Link>
        </p>
      )}
    </div>
  );
}
