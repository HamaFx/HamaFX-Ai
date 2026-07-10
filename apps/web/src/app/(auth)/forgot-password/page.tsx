'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { forgotPasswordAction } from '../actions';

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(forgotPasswordAction, { error: '' });

  return (
    <div className="flex flex-col gap-6">
      <div className="surface-panel p-6">
        <form action={action} className="flex w-full flex-col gap-5">
          <p className="text-fg-muted text-sm">
            Enter your email address and we'll send you a link to reset your password.
          </p>

          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-fg text-sm font-semibold">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              disabled={pending || !!state?.success}
            />
          </div>

          {state?.error ? (
            <p id="error" role="alert" className="text-danger text-sm">
              {state.error}
            </p>
          ) : null}

          {state?.success ? (
            <p className="text-success text-sm">
              {state.message}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            loading={pending}
            disabled={pending || !!state?.success}
            variant={state?.success ? 'success' : 'primary'}
          >
            {state?.success ? 'Email sent' : 'Send reset link'}
          </Button>
        </form>
      </div>

      <p className="text-fg-subtle text-center text-sm">
        Remember your password?{' '}
        <Link href="/login" className="text-fg font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
