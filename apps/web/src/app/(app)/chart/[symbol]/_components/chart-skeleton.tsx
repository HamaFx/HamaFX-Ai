// Animated shimmer placeholder matching chart aspect ratio.

export function ChartSkeleton() {
  return (
    <div className="card-premium relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden md:aspect-[21/9]">
      <div className="shimmer absolute inset-0 opacity-50" />
      <span className="text-fg-subtle relative text-xs font-medium tracking-wide">
        Loading chart…
      </span>
    </div>
  );
}
