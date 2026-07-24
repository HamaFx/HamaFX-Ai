// SPDX-License-Identifier: Apache-2.0

// <AdminErrorBlock> — shared error + retry block used across admin tabs.
// Replaces the identical `flex flex-col items-center gap-3 py-8` pattern
// that was copy-pasted into every data-table component.

'use client';

import { Button } from '@/components/ui/button';

interface AdminErrorBlockProps {
  message: string;
  onRetry: () => void;
}

export function AdminErrorBlock({ message, onRetry }: AdminErrorBlockProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-sm text-danger">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
