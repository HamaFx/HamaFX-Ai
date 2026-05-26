// Skeleton for the news list. Three shimmering rows match the typical
// article-card height so the page doesn't reflow when content lands.

export default function NewsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-bg-elev-2 h-12 w-2/3 animate-pulse rounded-md" />
      <ul className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <li
            key={i}
            className="border-border bg-bg-elev-1 h-[88px] animate-pulse rounded-lg border"
          />
        ))}
      </ul>
    </div>
  );
}
