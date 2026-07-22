// SPDX-License-Identifier: Apache-2.0

// Mobile-friendly skeleton for /chart/[symbol]. Matches the live chart
// aspect ratio so there's no layout shift when bars stream in.

import { Skeleton } from '@/components/ui/skeleton';

export default function ChartLoading() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-32" />
      </header>
      <Skeleton className="h-[60svh] w-full" />
    </div>
  );
}
