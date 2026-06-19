'use client';

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

// Compact segmented control to enable/disable each SMC overlay kind on
// the chart. State lives in the URL via nuqs so refreshing keeps the
// view, and a future "share my chart view" feature falls out for free.
import type { StructureKind } from '@hamafx/shared';
import { parseAsArrayOf, parseAsStringLiteral, useQueryState } from 'nuqs';

import { cn } from '@/lib/cn';

const ALL_KINDS = ['swings', 'bos_choch', 'fvg', 'order_blocks', 'liquidity'] as const;
const LABEL: Record<StructureKind, string> = {
  swings: 'swings',
  bos_choch: 'BOS/CHoCH',
  fvg: 'FVG',
  order_blocks: 'OB',
  liquidity: 'sweeps',
};

const overlayParser = parseAsArrayOf(parseAsStringLiteral(ALL_KINDS)).withDefault([]);

/**
 * Returns the active set as a stable typed array + a setter that toggles
 * one kind at a time. URL representation is comma-separated, e.g.
 * `?overlays=bos_choch,fvg`.
 */
export function useOverlayToggles(): [
  readonly StructureKind[],
  (k: StructureKind) => void,
  () => void,
] {
  const [active, setActive] = useQueryState('overlays', overlayParser);
  const toggle = (k: StructureKind) => {
    const next = active.includes(k) ? active.filter((x) => x !== k) : [...active, k];
    void setActive(next.length === 0 ? null : next);
  };
  const clear = () => void setActive(null);
  return [active, toggle, clear];
}

interface OverlayToggleProps {
  active: readonly StructureKind[];
  onToggle: (k: StructureKind) => void;
}

export function OverlayToggle({ active, onToggle }: OverlayToggleProps) {
  return (
    <div
      role="group"
      aria-label="Chart overlays"
      className="border-border bg-bg-elev-2 inline-flex flex-wrap items-center gap-0.5 rounded-md border p-0.5"
    >
      {ALL_KINDS.map((k) => {
        const on = active.includes(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(k)}
            className={cn(
              'rounded px-2 py-1 text-[11px] font-medium tabular-nums transition-colors',
              on ? 'bg-brand text-brand-fg' : 'text-fg-muted hover:bg-bg-elev-1 hover:text-fg',
            )}
          >
            {LABEL[k]}
          </button>
        );
      })}
    </div>
  );
}
