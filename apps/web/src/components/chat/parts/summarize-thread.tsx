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

// Bespoke renderer for the `summarize_thread` tool part.
//
// Synopsis paragraph plus three durable insights. A "Saved" pill confirms
// the synopsis was embedded into the memory index when `remembered=true`.

import type { ToolPartProps } from './registry';

export function SummarizeThreadPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'summarize_thread'>) {
  if (state === 'error') return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  if (state === 'loading' || !output) return <SkeletonCard />;

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">Thread synopsis</h3>
        {output.remembered ? (
          <span className="bg-bull/15 text-bull rounded-full px-2 py-0.5 text-[10px] font-semibold">
            Saved to memory
          </span>
        ) : (
          <span className="text-fg-subtle text-[10px]">Not saved</span>
        )}
      </header>

      <p className="text-fg text-sm">{output.synopsis}</p>

      {output.insights.length > 0 ? (
        <section>
          <h4 className="text-fg-subtle mb-1 text-[11px] uppercase tracking-wide">Key insights</h4>
          <ul className="flex flex-col gap-1">
            {output.insights.map((ins, i) => (
              <li
                key={i}
                className="border-divider/40 flex items-baseline gap-2 rounded-md border p-2 text-xs"
              >
                <span className="text-fg-muted">→</span>
                <span className="text-fg flex-1">{ins.text}</span>
                {ins.symbol ? (
                  <span className="bg-bg-elev-2 text-fg-muted rounded px-1.5 py-0.5 text-[10px] font-medium">
                    {ins.symbol}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-lg border p-3"
      aria-busy="true"
      aria-label="Summarising thread"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded" />
      <div className="bg-bg-elev-2 mt-3 h-16 animate-pulse rounded" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-lg border p-3 text-sm"
    >
      Thread summarisation failed{message ? ` · ${message}` : ''}
    </div>
  );
}
