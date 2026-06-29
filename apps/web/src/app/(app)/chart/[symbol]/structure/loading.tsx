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
