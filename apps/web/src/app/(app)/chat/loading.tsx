// SPDX-License-Identifier: Apache-2.0

import { Skeleton } from '@/components/ui/skeleton';

export default function ChatLoading() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-4">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="flex flex-col gap-3 pt-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-sm border border-border bg-bg-elev-1 p-4">
            <Skeleton className="size-10 shrink-0 rounded-sm" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
