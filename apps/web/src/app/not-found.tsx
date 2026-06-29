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

// Root 404. Plain server component — middleware already handles unauthed
// requests by redirecting to /login, so this page is reached only when
// authed users hit a typo'd URL.

import { Link } from 'next-view-transitions';

export default function NotFound() {
  return (
    <main className="bg-bg text-fg flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <span
        aria-hidden="true"
        className="inline-flex size-16 items-center justify-center rounded-2xl"
        style={{
          background: 'var(--gradient-brand)',
          boxShadow: '0 0 24px -4px oklch(82% 0.14 85 / 0.3)',
        }}
      >
        <span className="text-bg text-2xl font-bold">H</span>
      </span>
      <div className="flex flex-col gap-2" role="alert">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="text-fg-muted text-sm max-w-xs">
          That chart pattern didn&apos;t resolve. The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Link
        href="/chat"
        className="bg-brand text-brand-fg inline-flex h-9 items-center rounded-md px-4 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Go to chat
      </Link>
    </main>
  );
}
