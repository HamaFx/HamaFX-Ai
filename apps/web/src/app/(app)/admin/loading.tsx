// SPDX-License-Identifier: Apache-2.0

import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar skeleton */}
      <div className="border-border flex gap-2 border-b pb-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-sm" />
        ))}
      </div>

      {/* Content skeleton */}
      <SkeletonCard className="h-64" lines={8} />
    </div>
  );
}
