export default function CalendarLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-8 w-48 animate-pulse rounded bg-bg-elev-2" />
      <div className="h-4 w-72 animate-pulse rounded bg-bg-elev-2" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="border-border bg-bg-elev-1 h-20 animate-pulse rounded-lg border" />
      ))}
    </div>
  );
}
