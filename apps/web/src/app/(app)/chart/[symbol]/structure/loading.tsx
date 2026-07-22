// SPDX-License-Identifier: Apache-2.0

import { SkeletonCard } from '@/components/ui/skeleton';

export default function StructureLoading() {
  return (
    <div className="flex flex-col gap-4">
      <SkeletonCard className="h-64" lines={8} />
      <div className="grid grid-cols-2 gap-3">
        <SkeletonCard className="h-32" lines={4} />
        <SkeletonCard className="h-32" lines={4} />
      </div>
    </div>
  );
}
