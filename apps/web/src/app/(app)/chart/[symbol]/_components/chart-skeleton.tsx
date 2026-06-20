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

// Animated shimmer placeholder matching chart aspect ratio.

export function ChartSkeleton() {
  return (
    <div className="border border-divider bg-bg-elev-1 rounded-lg relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden md:aspect-[21/9]">
      <div className="shimmer absolute inset-0 opacity-50" />
      <span className="text-fg-subtle relative text-xs font-medium tracking-wide">
        Loading chart…
      </span>
    </div>
  );
}
