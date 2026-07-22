// SPDX-License-Identifier: Apache-2.0

import { Skeleton } from '@/components/ui/skeleton';

export default function OfflineLoading() {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4">
      <Skeleton className="size-12 rounded-sm" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}
