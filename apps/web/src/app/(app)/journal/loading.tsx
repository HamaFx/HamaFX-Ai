// SPDX-License-Identifier: Apache-2.0

import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function JournalLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* PageHeader skeleton matching actual page layout */}
      <Skeleton className="h-8 w-28" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-2 p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonCard key={i} className="h-24" lines={3} />
      ))}
    </div>
  );
}
