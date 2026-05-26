// Mobile-friendly skeleton for /chart/[symbol]. Next renders this during
// data fetches in the page's server component. Keeps the layout stable so
// the chart never jumps when bars stream in.

export default function ChartLoading() {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div className="bg-bg-elev-2 h-8 w-32 animate-pulse rounded-md" />
        <div className="bg-bg-elev-2 h-8 w-44 animate-pulse rounded-md" />
      </header>
      <div className="border-border bg-bg-elev-1 h-[60svh] animate-pulse rounded-lg border" />
    </div>
  );
}
