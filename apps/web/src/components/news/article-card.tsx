// One news article row. External link, opens in a new tab. Designed for
// dense mobile lists — title clamps at 3 lines, summary at 2.

import type { NewsArticle } from '@hamafx/shared';

import { cn } from '@/lib/cn';

interface ArticleCardProps {
  article: NewsArticle;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const sentimentClass =
    article.sentiment === 'positive'
      ? 'bg-bull/15 text-bull'
      : article.sentiment === 'negative'
        ? 'bg-bear/15 text-bear'
        : 'bg-bg-elev-2 text-fg-muted';

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="border-border bg-bg-elev-1 hover:bg-bg-elev-2 block rounded-lg border p-3 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-3 flex-1 text-sm font-semibold leading-snug">{article.title}</h3>
        {article.sentiment ? (
          <span
            className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', sentimentClass)}
          >
            {article.sentiment}
          </span>
        ) : null}
      </div>

      {article.summary ? (
        <p className="text-fg-muted mt-1.5 line-clamp-2 text-xs leading-snug">{article.summary}</p>
      ) : null}

      <div className="text-fg-subtle mt-2 flex flex-wrap items-center gap-2 text-[10px]">
        <span>{article.publisher ?? article.source}</span>
        <span aria-hidden>·</span>
        <time dateTime={new Date(article.publishedAt).toISOString()}>
          {formatRelative(article.publishedAt)}
        </time>
        {article.symbols.length > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span className="flex flex-wrap gap-1">
              {article.symbols.map((s) => (
                <span
                  key={s}
                  className="border-border rounded border px-1 py-0.5 text-[9px] uppercase tabular-nums"
                >
                  {s}
                </span>
              ))}
            </span>
          </>
        ) : null}
      </div>
    </a>
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
