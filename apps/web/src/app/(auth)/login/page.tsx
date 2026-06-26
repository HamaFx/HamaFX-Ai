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
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginAction } from '../actions';

import { Suspense } from 'react';

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '';

  const [state, action, pending] = useActionState(loginAction, { error: '' });
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (state.success) {
      setSuccess(true);
    }
  }, [state.success]);

  return (
    <div className="flex flex-col gap-6">
      <div className="card-premium p-6">
        <form action={action} className="flex w-full flex-col gap-5">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="build" value={process.env.NEXT_PUBLIC_BUILD_ID ?? ''} />
          
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
              disabled={pending || success}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-fg text-sm font-semibold">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending || success}
            />
          </div>

          {state?.error ? (
            <p id="login-error" role="alert" className="text-bear text-sm">
              {state.error}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            loading={pending}
            disabled={pending || success}
            variant={success ? 'success' : 'primary'}
          >
            {success ? (
              <>
                <Check className="size-5" /> Welcome back
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
        Don't have an account?{' '}
        <Link href="/register" className="text-brand font-medium hover:underline">
          Create an account
        </Link>
      </p>
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
