'use client';

/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { IconCheck } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginAction, resendVerificationAction } from '../actions';
import { OAuthButtons } from '../_components/oauth-buttons';
import { PasswordField } from '../_components/password-field';
import { FormError } from '../_components/form-error';

import { Suspense } from 'react';

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '';

  const [state, action, pending] = useActionState(loginAction, { error: '' });
  const [success, setSuccess] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (state.requires2FA) setRequires2FA(true);
    if (state.success) setSuccess(true);
  }, [state.requires2FA, state.success]);

  return (
    <div className="flex flex-col gap-6">
      <OAuthButtons callbackUrl={next || '/chat'} action="Sign in" disabled={pending || success} />

      <div>
        <form action={action} className="flex w-full flex-col gap-5">
          <input type="hidden" name="next" value={next} />

          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-fg text-sm font-semibold">Email</label>
            <Input id="email" name="email" type="email" autoComplete="email"
              autoFocus={!requires2FA} required disabled={success}
              readOnly={pending || requires2FA} />
          </div>

          <PasswordField value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password" required disabled={success}
            readOnly={pending || requires2FA} />

          {requires2FA && (
            <div className="flex flex-col gap-2">
              <label htmlFor="totpCode" className="text-fg text-sm font-semibold">2FA Code</label>
              <Input id="totpCode" name="totpCode" type="text" inputMode="numeric"
                pattern="[0-9]*" maxLength={6} autoComplete="one-time-code"
                autoFocus required disabled={success} readOnly={pending}
                placeholder="Enter 6-digit code" />
            </div>
          )}

          <div className="flex items-center justify-between -mt-3">
            <label className="flex items-center gap-2 text-fg-muted text-xs cursor-pointer hover:text-fg transition-colors">
              <input type="checkbox" name="rememberMe" value="true" defaultChecked className="rounded-sm border-border" />
              Remember me
            </label>
            <Link href="/forgot-password" className="text-fg-muted hover:text-fg text-xs underline underline-offset-2 transition-colors">
              Forgot password?
            </Link>
          </div>

          <FormError message={state?.error ?? ''} />

          <Button
            type="submit"
            size="lg"
            loading={pending}
            disabled={pending || success}
            variant={success ? 'success' : 'primary'}
          >
            {success ? (
              <>
                <IconCheck className="size-5" /> Welcome back
              </>
            ) : pending ? (
              'Signing in…'
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      </div>

      <p className="text-fg-subtle text-center text-sm">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-fg font-medium hover:underline">
          Create an account
        </Link>
      </p>

      {/* P3-1: Resend verification email */}
      <ResendVerification />

      {process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === 'true' && (
        <div className="flex flex-col items-center gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => {
              window.location.href = '/api/dev/login';
            }}
            className="text-fg-muted hover:text-fg cursor-pointer text-xs underline underline-offset-2 transition-colors"
          >
            Skip login (dev only)
          </button>
        </div>
      )}
    </div>
  );
}

/** P3-1: Inline resend-verification trigger for users who missed the email. */
function ResendVerification() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleResend() {
    if (!email || !email.includes('@')) { setError('Enter a valid email'); return; }
    setLoading(true);
    setError('');
    const result = await resendVerificationAction(email);
    if ('error' in result && result.error) setError(result.error);
    else setSent(true);
    setLoading(false);
  }

  return (
    <div className="border-t border-border pt-4 flex flex-col gap-2">
      <p className="text-fg-subtle text-xs text-center">
        Didn&apos;t receive a verification email?
      </p>
      {!sent ? (
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            className="h-9 text-sm flex-1"
            aria-label="Email for verification resend"
          />
          <Button type="button" size="sm" variant="secondary"
            loading={loading} disabled={loading}
            onClick={handleResend}>
            Resend
          </Button>
        </div>
      ) : (
        <p className="text-success text-xs text-center" role="status">
          Verification email sent — check your inbox.
        </p>
      )}
      {error && <FormError message={error} />}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-8"><span className="text-fg-subtle">Loading...</span></div>}>
      <LoginForm />
    </Suspense>
  );
}
