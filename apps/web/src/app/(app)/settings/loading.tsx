// SPDX-License-Identifier: Apache-2.0

import { SkeletonCard } from '@/components/ui/skeleton';

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} className="h-32" lines={4} />
      ))}
    </div>
  );
}
