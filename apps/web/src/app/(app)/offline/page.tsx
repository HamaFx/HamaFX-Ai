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

// Server component. Rendered as the SW navigation fallback when the network
// is unavailable and the requested route is not in the precache.
export default function OfflinePage() {
  return (
    <section className="flex min-h-[60svh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-fg text-xl font-semibold">You&apos;re offline</h1>
      <p className="text-fg-muted text-sm">
        Check your connection and try again. Cached pages will keep working.
      </p>
    </section>
  );
}
