// SPDX-License-Identifier: Apache-2.0

// Usage page skeleton. Four cards stacked, matching the live layout.

import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function UsageLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-12 w-2/3" />
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} className="h-32" lines={4} />
      ))}
    </div>
  );
}
