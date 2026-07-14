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

// §4.4: "Continue with Google" OAuth button.
// Renders only when NEXT_PUBLIC_GOOGLE_ENABLED is set and AUTH_GOOGLE_ID/SECRET
// are configured server-side. Uses next-auth/react signIn() for the OAuth flow.

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { IconBrandGoogle } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';

interface OAuthButtonsProps {
  /** Safe redirect path after OAuth sign-in. */
  callbackUrl?: string;
  /** Label prefix, e.g. "Sign in" or "Sign up". */
  action: 'Sign in' | 'Sign up';
  /** Whether the parent form is in a pending state (disables OAuth buttons too). */
  disabled?: boolean;
}

export function OAuthButtons({ callbackUrl, action, disabled }: OAuthButtonsProps) {
  const [googleLoading, setGoogleLoading] = useState(false);

  if (process.env.NEXT_PUBLIC_GOOGLE_ENABLED !== 'true') return null;

  const isLoading = disabled || googleLoading;

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      await signIn('google', { callbackUrl: callbackUrl || '/chat' });
    } catch {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex items-center">
        <div className="flex-grow border-t border-border" />
        <span className="mx-3 flex-shrink text-fg-muted text-xs">or continue with</span>
        <div className="flex-grow border-t border-border" />
      </div>

      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={handleGoogle}
        loading={googleLoading}
        disabled={isLoading}
        className="w-full gap-3"
      >
        <IconBrandGoogle className="size-5" />
        {action} with Google
      </Button>
    </div>
  );
}
