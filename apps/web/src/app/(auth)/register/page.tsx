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
import { IconCheck } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { registerAction } from '../actions';
import { OAuthButtons } from '../_components/oauth-buttons';
import { PasswordField } from '../_components/password-field';
import { FormError } from '../_components/form-error';

export default function RegisterPage() {
  const [state, action, pending] = useActionState(registerAction, { error: '' });
  const [success, setSuccess] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const passwordsMatch = password === confirmPassword;
  const confirmTouched = confirmPassword.length > 0;

  useEffect(() => {
    if (state.success) setSuccess(true);
  }, [state.success]);

  const submitDisabled = pending || success || (confirmTouched && !passwordsMatch);

  return (
    <div className="flex flex-col gap-6">
      <OAuthButtons callbackUrl="/onboarding" action="Sign up" disabled={pending || success} />

      <form action={action} className="flex w-full flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="text-fg text-sm font-semibold">Full Name</label>
          <Input id="name" name="name" type="text" autoComplete="name"
            autoFocus required disabled={pending || success} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-fg text-sm font-semibold">Email</label>
          <Input id="email" name="email" type="email" autoComplete="email"
            required disabled={pending || success} />
        </div>

        <PasswordField value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password" minLength={8} required
          disabled={pending || success} showStrengthMeter />

        <div className="flex flex-col gap-2">
          <label htmlFor="confirm-password" className="text-fg text-sm font-semibold">Confirm Password</label>
          <Input id="confirm-password" name="confirmPassword"
            type="password" autoComplete="new-password" required
            disabled={pending || success}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={confirmTouched && !passwordsMatch} />
          {confirmTouched && !passwordsMatch && (
            <p role="alert" className="text-danger text-xs mt-1">Passwords do not match</p>
          )}
        </div>

        <FormError message={state?.error ?? ''} />

          <Button
            type="submit"
            size="lg"
            loading={pending}
            disabled={submitDisabled}
            variant={success ? 'success' : 'primary'}
          >
            {success ? (
              <>
                <IconCheck className="size-5" /> Account created
              </>
            ) : pending ? (
              'Creating account…'
            ) : (
              'Create account'
            )}
          </Button>
        </form>

      <p className="text-fg-subtle text-center text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-fg font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
