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

// Settings island for Resend email test. Uses sonner toasts for
// confirmation/error rather than inline status text.

import { Mail } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

interface SuccessBody {
  id?: string | null;
}
interface MissingBody {
  missing?: unknown;
}
interface ErrorBody {
  error?: unknown;
}

export function TestEmailButton(): React.JSX.Element {
  const [pending, startTransition] = useTransition();

  function send(): void {
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/test-alert-email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });

        if (res.ok) {
          const json = (await res.json().catch(() => ({}))) as SuccessBody;
          toast.success('Email sent', {
            description: `message id: ${json.id ?? 'unknown'}`,
          });
          return;
        }

        if (res.status === 503) {
          const json = (await res.json().catch(() => ({}))) as MissingBody;
          const vars = Array.isArray(json.missing)
            ? json.missing.filter((v): v is string => typeof v === 'string')
            : [];
          toast.error('Email not configured', {
            description: `Missing: ${vars.join(', ')}`,
          });
          return;
        }

        let message = `HTTP ${res.status}`;
        const text = await res.text().catch(() => '');
        if (text) {
          try {
            const parsed = JSON.parse(text) as ErrorBody;
            if (typeof parsed.error === 'string' && parsed.error) {
              message = parsed.error;
            } else {
              message = text.slice(0, 200);
            }
          } catch {
            message = text.slice(0, 200);
          }
        }
        toast.error('Email failed', { description: message });
      } catch (err) {
        toast.error('Email failed', {
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
      className="focus-visible:ring-brand min-h-[44px] focus-visible:ring-2"
    >
      <Mail className="size-4" />
      {pending ? 'Sending…' : 'Send test email'}
    </Button>
  );
}
