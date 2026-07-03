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

import { Skeleton } from '@/components/ui/skeleton';

export default function OfflineLoading() {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4">
      <Skeleton className="size-12 rounded-sm" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}
