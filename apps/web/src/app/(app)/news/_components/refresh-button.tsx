'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

interface RefreshButtonProps {
  endpoint: string;
  label?: string;
}

export function RefreshButton({ endpoint, label = 'Refresh now' }: RefreshButtonProps) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<'idle' | 'ok' | 'error'>('idle');
  const router = useRouter();

  function refresh() {
    startTransition(async () => {
      try {
        const res = await fetch(endpoint);
        if (res.ok) {
          setResult('ok');
          router.refresh();
        } else {
          setResult('error');
        }
      } catch {
        setResult('error');
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={refresh}
        loading={pending}
        className="focus-visible:ring-brand min-h-[44px] min-w-[44px] focus-visible:ring-2"
      >
        {pending ? 'Loading…' : label}
      </Button>
      {result === 'ok' ? (
        <span className="text-bull text-xs">Done — reloading…</span>
      ) : result === 'error' ? (
        <span className="text-bear text-xs">Failed — check API keys</span>
      ) : null}
    </div>
  );
}
