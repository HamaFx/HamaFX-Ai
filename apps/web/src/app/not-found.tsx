// Root 404. Plain server component — middleware already handles unauthed
// requests by redirecting to /login, so this page is reached only when
// authed users hit a typo'd URL.

import { Link } from 'next-view-transitions';

export default function NotFound() {
  return (
    <main className="bg-bg text-fg flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">Page not found.</h1>
        <p className="text-fg-muted text-sm">
          The route doesn&apos;t exist. Try one of the tabs in the bottom nav.
        </p>
      </div>
      <Link
        href="/chat"
        className="bg-brand text-brand-fg inline-flex h-9 items-center rounded-md px-3 text-sm font-medium hover:opacity-90"
      >
        Open chat
      </Link>
    </main>
  );
}
