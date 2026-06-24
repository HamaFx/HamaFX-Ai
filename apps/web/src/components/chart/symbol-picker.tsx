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

// Three-segment switch for the supported symbols. Renders as <Link> via the
// shared <Segmented> primitive so the URL stays in sync (cheap deep links
// to /chart/XAUUSD?tf=4h etc).

import { SYMBOLS, type Symbol } from '@hamafx/shared';

import { Segmented } from '@/components/ui/segmented';
import { useTimeframe } from '@/hooks/use-tf';

export function SymbolPicker({ active, watchlist }: { active: Symbol; watchlist: string[] }) {
  const [tf] = useTimeframe();
  return (
    <Segmented<Symbol>
      as="link"
      label="Symbol"
      srLabel
      value={active}
      role="tablist"
      variant="gradient"
      groupId="symbol-indicator"
      hrefFor={(s) => `/chart/${s}?tf=${tf}`}
      options={watchlist.map((s) => ({ value: s, label: s }))}
    />
  );
}
