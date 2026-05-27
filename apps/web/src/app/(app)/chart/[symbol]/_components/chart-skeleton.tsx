// Animated pulse placeholder matching chart aspect ratio.
export function ChartSkeleton() {
  return (
    <div className="border-border bg-bg-elev-1 flex aspect-[16/9] w-full animate-pulse items-center justify-center rounded-lg border md:aspect-[21/9]">
      <span className="text-fg-subtle text-xs">Loading chart…</span>
    </div>
  );
}
