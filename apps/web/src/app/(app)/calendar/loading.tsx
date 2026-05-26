// Skeleton for /calendar. Mirrors the day-grouped layout so headings + rows
// don't reflow when data lands.

export default function CalendarLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-bg-elev-2 h-12 w-2/3 animate-pulse rounded-md" />
      {Array.from({ length: 2 }).map((_, g) => (
        <section key={g} className="flex flex-col gap-2">
          <div className="bg-bg-elev-2 h-3 w-24 animate-pulse rounded" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="border-border bg-bg-elev-1 h-[72px] animate-pulse rounded-lg border"
            />
          ))}
        </section>
      ))}
    </div>
  );
}
