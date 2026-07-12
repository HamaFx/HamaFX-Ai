/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function BillingLoading() {
  return (
    <div className="flex flex-col gap-8">
      {/* Section header */}
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <Skeleton className="size-6 rounded-sm" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      {/* Subscription status */}
      <div className="rounded-sm border border-border bg-bg-elev-1 p-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      </div>
      {/* Plan cards */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-28" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-sm border border-border bg-bg-elev-1 p-4 flex flex-col gap-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-8 w-16" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-9 w-full mt-2" />
            </div>
          ))}
        </div>
      </div>
      {/* Payment history */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} className="h-14" lines={2} />
        ))}
      </div>
    </div>
  );
}
