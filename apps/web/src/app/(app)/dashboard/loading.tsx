// SPDX-License-Identifier: Apache-2.0

import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-2 p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <SkeletonCard className="h-64" lines={6} />
    </div>
  );
}
