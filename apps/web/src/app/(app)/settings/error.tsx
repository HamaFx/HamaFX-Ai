'use client';

import { IconRefresh } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <p className="text-fg-muted text-sm">Something went wrong loading this page</p>
      <p className="text-fg-subtle text-caption max-w-sm text-center">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <Button type="button" size="sm" variant="secondary" onClick={() => reset()}>
        <IconRefresh className="size-3.5" />
        Try again
      </Button>
    </div>
  );
}
