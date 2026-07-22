// SPDX-License-Identifier: Apache-2.0

import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function PortfolioLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header matching actual page layout */}
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-1 h-4 w-72" />
      </div>
      {/* Stat cards — matches grid-cols-2 sm:grid-cols-4 on actual page */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-2 p-4">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
      {/* Positions table skeleton */}
      <SkeletonCard className="h-48" lines={5} />
      {/* Concentration skeleton */}
      <SkeletonCard className="h-36" lines={3} />
      {/* Account settings skeleton */}
      <SkeletonCard className="h-32" lines={3} />
    </div>
  );
}
