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

// §4.5: Connected accounts card — shows linked OAuth providers
// with connect/disconnect actions. Currently supports Google.

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { IconBrandGoogle, IconLink } from '@tabler/icons-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { SettingsRow } from '../settings-row';

interface LinkedAccountsCardProps {
  /** Whether the user has a Google account linked. */
  googleLinked: boolean;
}

export function LinkedAccountsCard({ googleLinked }: LinkedAccountsCardProps) {
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === 'true';
  if (!googleEnabled) return null;

  return (
    <section
      aria-labelledby="linked-accounts-heading"
      className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-1 p-4"
    >
      <header className="flex items-center gap-3 pb-2">
        <h2 id="linked-accounts-heading" className="text-fg text-base font-semibold tracking-tight">
          Connected accounts
        </h2>
      </header>

      <SettingsRow
        icon={<IconBrandGoogle className="size-4" />}
        label="Google"
        description={googleLinked ? 'Your Google account is connected.' : 'Sign in with your Google account'}
        action={
          googleLinked ? (
            <span className="text-success text-xs font-medium">Connected</span>
          ) : (
            <GoogleConnectButton />
          )
        }
      />
    </section>
  );
}

function GoogleConnectButton() {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await signIn('google', { callbackUrl: '/settings' });
        } catch {
          setLoading(false);
          toast.error('Failed to connect Google account');
        }
      }}
    >
      <IconLink className="size-3.5" />
      Connect
    </Button>
  );
}
