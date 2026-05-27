'use client';

// Settings island for Telegram test message. Uses sonner toasts for
// confirmation/error rather than inline status text.

import { Send } from 'lucide-react';
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

export function TestTelegramButton(): React.JSX.Element {
  const [pending, startTransition] = useTransition();

  function send(): void {
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/test-telegram', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });

        if (res.ok) {
          const json = (await res.json().catch(() => ({}))) as SuccessBody;
          toast.success('Telegram sent', {
            description: `message id: ${json.id ?? 'unknown'}`,
          });
          return;
        }

        if (res.status === 503) {
          const json = (await res.json().catch(() => ({}))) as MissingBody;
          const vars = Array.isArray(json.missing)
            ? json.missing.filter((v): v is string => typeof v === 'string')
            : [];
          toast.error('Telegram not configured', {
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
        toast.error('Telegram failed', { description: message });
      } catch (err) {
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
      className="focus-visible:ring-brand min-h-[44px] focus-visible:ring-2"
    >
      <Send className="size-4" />
      {pending ? 'Sending…' : 'Send test Telegram'}
    </Button>
  );
}
