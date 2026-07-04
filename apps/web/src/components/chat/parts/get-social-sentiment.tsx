/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { type GetSocialSentimentOutput } from '@hamafx/shared';
import {IconMessage, IconMessageCircle, IconChartBar, IconNewspaper, IconAlertCircle, type Icon} from '@tabler/icons-react';

interface GetSocialSentimentPartProps {
  /** Tool output, or `null` while streaming / before completion. */
  output: GetSocialSentimentOutput | null;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

const SENTIMENT_COLORS: Record<string, string> = {
  very_bullish: 'bg-bull/15 text-bull border border-bull/20',
  bullish: 'bg-bull/10 text-bull/90 border border-bull/10',
  neutral: 'bg-bg-elev-2 text-fg-muted border border-border',
  bearish: 'bg-bear/10 text-bear/90 border border-bear/10',
  very_bearish: 'bg-bear/15 text-bear border border-bear/20',
};

const SOURCE_ICONS: Record<string, Icon> = {
  reddit: IconMessage,
  twitter: IconMessageCircle,
  retail_positioning: IconChartBar,
  news: IconNewspaper,
  aggregated: IconAlertCircle,
};

export function GetSocialSentimentPart({ output, state, errorMessage }: GetSocialSentimentPartProps) {
  if (state === 'error') {
    return (
      <div role="alert" className="border-bear/30 bg-bg-elev-1 text-bear rounded-sm border p-3 text-sm">
        Sentiment unavailable{errorMessage ? ` · ${errorMessage}` : ''}
      </div>
    );
  }
  if (state === 'loading' || !output) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-sm border p-3" aria-busy="true">
        <div className="bg-bg-elev-2 mb-2 h-3 w-32 animate-pulse rounded-sm" />
        <div className="bg-bg-elev-2 h-16 w-full animate-pulse rounded-sm" />
      </div>
    );
  }

  if (!output.available) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-sm border p-3 text-fg-muted text-sm text-center">
        No sentiment data available for {output.symbol}.
      </div>
    );
  }

  return (
    <div className="border-border bg-bg-elev-1 rounded-sm border p-3 space-y-4">
      <div className="text-fg-muted text-xs">
        Social Sentiment · {new Date(output.fetchedAt).toLocaleTimeString()}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-lg font-bold text-fg">{output.symbol}</span>
        <span
          className={`text-sm px-2.5 py-1 rounded-sm font-semibold ${
            SENTIMENT_COLORS[output.overall] || SENTIMENT_COLORS.neutral
          }`}
        >
          {output.overall.replace('_', ' ').toUpperCase()}
        </span>
      </div>

      {output.contrarianSignal && output.contrarianNote && (
          <div className="bg-warn/10 text-warn border border-warn/20 p-2.5 rounded-sm text-xs leading-[1.4]">
          <div className="font-semibold mb-0.5">Contrarian Warning</div>
          {output.contrarianNote}
        </div>
      )}

      <div className="space-y-2">
        {output.sources
          .filter((s) => s.available)
          .map((src, i) => {
            const Icon = SOURCE_ICONS[src.source] || IconAlertCircle;
            return (
              <div key={i} className="flex items-center justify-between gap-3 p-2 bg-bg-elev-1 rounded-sm text-xs">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-fg-muted shrink-0" />
                  <span className="text-fg font-medium capitalize flex-1">
                    {src.source.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {src.retailLongPct !== null && (
                    <span className="text-fg-muted tabular-nums">
                      {src.retailLongPct.toFixed(0)}% Long
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-sm font-medium ${
                      SENTIMENT_COLORS[src.sentiment] || SENTIMENT_COLORS.neutral
                    }`}
                  >
                    {src.sentiment.replace('_', ' ')}
                  </span>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
