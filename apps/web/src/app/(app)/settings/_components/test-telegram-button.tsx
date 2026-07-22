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

// Settings island for Telegram test message. Uses sonner toasts for
// confirmation/error rather than inline status text.

import { IconArrowRight } from '@tabler/icons-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { apiMutate, ApiError } from '@/lib/api-client';

interface SuccessBody {
  id?: string | null;
}

interface MissingBody {
  missing?: unknown;
}

export function TestTelegramButton(): React.JSX.Element {
  const [pending, startTransition] = useTransition();

  function send(): void {
    startTransition(async () => {
      try {
        const json = await apiMutate<SuccessBody | MissingBody>(
          '/api/admin/test-telegram',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          },
        );
        const typed = json as SuccessBody;
        toast.success('Telegram sent', {
          description: `message id: ${typed.id ?? 'unknown'}`,
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 503) {
          const missing = (err.details as { missing?: unknown } | undefined)?.missing;
          const vars = Array.isArray(missing)
            ? missing.filter((v): v is string => typeof v === 'string')
            : [];
          toast.error('Telegram not configured', {
            description: vars.length > 0 ? `Missing: ${vars.join(', ')}` : err.message,
          });
          return;
        }
        toast.error('Telegram failed', {
          description: err instanceof Error ? err.message : 'unknown error',
        });
      }
    });
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={send}
      loading={pending}
      aria-busy={pending}
      className="focus-visible:ring-fg min-h-[44px] focus-visible:ring-2"
    >
      <IconArrowRight className="size-4" />
      {pending ? 'Sending…' : 'Send test Telegram'}
    </Button>
  );
}
