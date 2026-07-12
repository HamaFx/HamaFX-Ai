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
