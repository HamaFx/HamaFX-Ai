// SPDX-License-Identifier: Apache-2.0

import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function TelegramLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-64" />
      <SkeletonCard className="h-40" lines={4} />
      <SkeletonCard className="h-32" lines={3} />
    </div>
  );
}
