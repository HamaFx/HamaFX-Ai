'use client';

// Refresh button — calls the cron endpoint (session-cookie auth) then
// asks Next to revalidate the server component. Confirmation/error
// surface through sonner toasts (no inline status string).

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

interface RefreshButtonProps {
  endpoint: string;
  label?: string;
}

export function RefreshButton({ endpoint, label = 'Refresh now' }: RefreshButtonProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function refresh() {
    startTransition(async () => {
      try {
        const res = await fetch(endpoint);
        if (res.ok) {
          const json = (await res.json().catch(() => ({}))) as {
            processed?: number;
            note?: string;
          };
          toast.success('Refreshed', {
            description: json.note ?? `Processed ${json.processed ?? 0} items`,
          });
          router.refresh();
        } else {
          toast.error('Refresh failed', { description: `HTTP ${res.status}` });
        }
      } catch (err) {
        toast.error('Refresh failed', {
          description: err instanceof Error ? err.message : 'Network error',
        });
      }
    });
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={refresh}
      loading={pending}
      className="focus-visible:ring-brand min-h-[44px] focus-visible:ring-2"
    >
      <RefreshCw className={`size-3.5 ${pending ? 'animate-spin' : ''}`} />
      {pending ? 'Loading…' : label}
    </Button>
  );
}
