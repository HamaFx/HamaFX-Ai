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
