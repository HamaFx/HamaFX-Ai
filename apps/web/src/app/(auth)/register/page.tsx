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
import { IconCheck, IconEye, IconEyeOff } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { registerAction } from '../actions';

export default function RegisterPage() {
  const [state, action, pending] = useActionState(registerAction, { error: '' });
  const [success, setSuccess] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordsMatch = password === confirmPassword;
  const confirmTouched = confirmPassword.length > 0;

  useEffect(() => {
    if (state.success) {
      setSuccess(true);
    }
  }, [state.success]);

  const submitDisabled = pending || success || (confirmTouched && !passwordsMatch);

  return (
    <div className="flex flex-col gap-6">
        <form action={action} className="flex w-full flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-fg text-sm font-semibold">
              Full Name
            </label>
            <Input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              autoFocus
              required
              disabled={pending || success}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-fg text-sm font-semibold">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={pending || success}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-fg text-sm font-semibold">
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                disabled={pending || success}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-fg-muted hover:text-fg absolute right-2 top-1/2 -translate-y-1/2"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
              </button>
            </div>
            {password.length > 0 && (
              <div className="text-xs text-fg-subtle grid grid-cols-2 gap-1 mt-1">
                <div className="flex items-center gap-1">
                  <span className={password.length >= 8 ? "text-success" : "text-danger"}>
                    {password.length >= 8 ? "✓" : "✗"}
                  </span>
                  <span>Min 8 characters</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={/[A-Z]/.test(password) ? "text-success" : "text-danger"}>
                    {/[A-Z]/.test(password) ? "✓" : "✗"}
                  </span>
                  <span>One uppercase letter</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={/[a-z]/.test(password) ? "text-success" : "text-danger"}>
                    {/[a-z]/.test(password) ? "✓" : "✗"}
                  </span>
                  <span>One lowercase letter</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={/[0-9]/.test(password) ? "text-success" : "text-danger"}>
                    {/[0-9]/.test(password) ? "✓" : "✗"}
                  </span>
                  <span>One number</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="confirm-password" className="text-fg text-sm font-semibold">
              Confirm Password
            </label>
            <div className="relative">
              <Input
                id="confirm-password"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                disabled={pending || success}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="text-fg-muted hover:text-fg absolute right-2 top-1/2 -translate-y-1/2"
                tabIndex={-1}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
              </button>
            </div>
            {confirmTouched && !passwordsMatch ? (
              <p role="alert" className="text-danger text-xs mt-1">Passwords do not match</p>
            ) : null}
          </div>

          {state?.error ? (
            <p id="register-error" role="alert" className="text-danger text-sm">
              {state.error}
            </p>
          ) : null}

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
