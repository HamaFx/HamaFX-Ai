// SPDX-License-Identifier: Apache-2.0

import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function CalendarLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* CalendarHero placeholder */}
      <div className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="size-12 shrink-0 rounded-sm" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-sm" />
          <div className="flex gap-3">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonCard key={i} className="h-20" lines={2} />
      ))}
    </div>
  );
}
