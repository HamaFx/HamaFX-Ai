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

// Bespoke renderer for the `verify_call` tool part.
//
// Two states:
//   - agree=true  — green ring, "Geometry checks out" + nearest opposing
//                   liquidity reference if available.
//   - agree=false — amber ring (warning, not error), one row per caveat
//                   with a glyph keyed off `caveat.code`.

import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import type { ToolPartProps } from './registry';

const CAVEAT_GLYPH: Record<string, string> = {
  invalid_stop_side: '⊙',
  invalid_target_side: '⊙',
  no_invalidation: '∅',
  opposing_liquidity_in_path: '∿',
  thin_structure: '≈',
  market_price_unavailable: '¤',
  level_far_from_market: 'Δ',
};

export function VerifyCallPart({ output, state, errorMessage }: ToolPartProps<'verify_call'>) {
  if (state === 'error') return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  if (state === 'loading' || !output) return <SkeletonCard />;

  const tone = output.agree ? 'border-emerald-500/40' : 'border-warn/40';
  const headerTone = output.agree ? 'text-bull' : 'text-warn';
  const Icon = output.agree ? CheckCircle2 : AlertTriangle;

  return (
    <div className={`bg-zinc-950 flex flex-col gap-3 rounded-sm border p-3 ${tone}`}>
      <header className={`flex items-center gap-2 text-sm font-semibold ${headerTone}`}>
        <Icon className="size-4" />
        {output.agree ? 'Setup verified' : `${output.caveats.length} caveat${output.caveats.length === 1 ? '' : 's'}`}
      </header>

      <p className="text-fg text-xs tabular-nums">{output.rationale}</p>

      {output.caveats.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {output.caveats.map((c, i) => (
            <li
              key={i}
              className="border-warn/30 bg-warn/5 flex items-baseline gap-2 rounded-sm border px-2 py-1.5 text-body-sm"
            >
              <span className="text-amber-500 font-semibold">{CAVEAT_GLYPH[c.code] ?? '!'}</span>
              <span className="text-fg flex-1">{c.message}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {output.nearestOpposingLiquidity ? (
        <p className="text-fg-subtle text-body-sm tabular-nums">
          Nearest opposing{' '}
          {output.nearestOpposingLiquidity.kind === 'swing_high' ? 'swing high' : 'swing low'}:{' '}
          <span className="text-fg-muted font-medium">
            {output.nearestOpposingLiquidity.price.toFixed(output.symbol === 'XAUUSD' ? 2 : 5)}
          </span>{' '}
          ({output.nearestOpposingLiquidity.barsAgo} bars back)
        </p>
      ) : null}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-zinc-950 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Verifying setup"
    >
      <div className="bg-zinc-900 h-4 w-1/2 animate-pulse rounded" />
      <div className="bg-zinc-900 mt-3 h-16 animate-pulse rounded" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-red-500/30 bg-zinc-950 text-red-500 rounded-sm border p-3 text-sm"
    >
      Setup verification failed{message ? ` · ${message}` : ''}
    </div>
  );
}
