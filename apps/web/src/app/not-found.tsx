// SPDX-License-Identifier: Apache-2.0

// Root 404. Plain server component — middleware already handles unauthed
// requests by redirecting to /login, so this page is reached only when
// authed users hit a typo'd URL.

import { Link } from 'next-view-transitions';

export default function NotFound() {
  return (
    <main className="bg-bg-elev-1 text-fg flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <span
        aria-hidden="true"
        className="inline-flex size-16 items-center justify-center rounded-sm"
        style={{
          background: 'none',
                  }}
      >
        <span className="text-fg text-2xl font-bold">H</span>
      </span>
      <div className="flex flex-col gap-2" role="alert">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="text-fg-muted text-sm max-w-xs">
          That chart pattern didn&apos;t resolve. The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Link
        href="/chat"
        className="bg-fg text-black inline-flex h-9 items-center rounded-sm px-4 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Go to chat
      </Link>
    </main>
  );
}
