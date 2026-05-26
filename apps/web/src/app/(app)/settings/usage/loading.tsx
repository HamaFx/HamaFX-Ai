// Usage page skeleton. Four cards stacked, matching the live layout.

export default function UsageLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-bg-elev-2 h-12 w-2/3 animate-pulse rounded-md" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="border-border bg-bg-elev-1 h-32 animate-pulse rounded-lg border" />
      ))}
    </div>
  );
}
