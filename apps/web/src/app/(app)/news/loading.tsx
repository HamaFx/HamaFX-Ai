// SPDX-License-Identifier: Apache-2.0

import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function NewsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      {/* SentimentSummary placeholder */}
      <div className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-2 w-full rounded-sm" />
        <div className="flex gap-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} className="h-24" lines={3} />
      ))}
    </div>
  );
}
