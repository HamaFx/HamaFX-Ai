// SPDX-License-Identifier: Apache-2.0

// Animated shimmer placeholder matching chart aspect ratio.

export function ChartSkeleton() {
  return (
    <div role="status" aria-label="Loading content" className="border border-border bg-bg-elev-1 rounded-sm relative flex h-[60svh] w-full items-center justify-center overflow-hidden">
      <div className="shimmer absolute inset-0 opacity-50" />
      <span className="text-fg-subtle relative text-xs font-medium tracking-wide">
        Loading chart…
      </span>
    </div>
  );
}
