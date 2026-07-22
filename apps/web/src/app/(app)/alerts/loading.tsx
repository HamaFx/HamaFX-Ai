// SPDX-License-Identifier: Apache-2.0

import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function AlertsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-32" />
      <SkeletonCard className="h-48" lines={4} />
      <Skeleton className="h-6 w-48" />
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} className="h-20" lines={2} />
      ))}
    </div>
  );
}
