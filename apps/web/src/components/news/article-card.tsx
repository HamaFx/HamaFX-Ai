// One news article — premium glass card with subtle hover lift, gradient
// border highlight, and animated sentiment chip.

import type { NewsArticle } from '@hamafx/shared';

import { cn } from '@/lib/cn';

interface ArticleCardProps {
  article: NewsArticle;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const sentimentClass =
    article.sentiment === 'positive'
      ? 'bg-bull/15 text-bull ring-1 ring-bull/30'
      : article.sentiment === 'negative'
        ? 'bg-bear/15 text-bear ring-1 ring-bear/30'
        : 'bg-bg-elev-2 text-fg-muted ring-1 ring-divider';

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'card-premium group relative block p-3.5',
        'transition-colors duration-200',
        'md:hover:bg-bg-elev-2/40',
      )}
    >
      <div className="relative flex items-start justify-between gap-3">
        <h3 className="text-fg line-clamp-3 flex-1 text-sm font-semibold leading-snug">
          {article.title}
        </h3>
        {article.sentiment ? (
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
              sentimentClass,
            )}
          >
            {article.sentiment}
            {article.sentimentScore !== null ? (
              <span className="ml-1 tabular-nums opacity-80">
                {article.sentimentScore > 0 ? '+' : ''}
                {article.sentimentScore.toFixed(2)}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {article.summary ? (
        <p className="text-fg-muted relative mt-1.5 line-clamp-2 text-xs leading-relaxed">
          {article.summary}
        </p>
      ) : null}

      <div className="text-fg-subtle relative mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
        <span className="font-medium">{article.publisher ?? article.source}</span>
        <span aria-hidden className="opacity-50">·</span>
        <time dateTime={new Date(article.publishedAt).toISOString()}>
          {formatRelative(article.publishedAt)}
        </time>
        {article.symbols.length > 0 ? (
          <>
            <span aria-hidden className="opacity-50">·</span>
            <span className="flex flex-wrap gap-1">
              {article.symbols.map((s) => (
                <span
                  key={s}
                  className="bg-bg-elev-2 text-fg-muted ring-divider rounded px-1.5 py-0.5 text-[9px] uppercase tabular-nums ring-1"
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
