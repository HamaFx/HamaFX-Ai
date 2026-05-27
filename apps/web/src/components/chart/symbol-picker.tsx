'use client';

// Three-segment switch for the supported symbols. Renders as <Link> via the
// shared <Segmented> primitive so the URL stays in sync (cheap deep links
// to /chart/XAUUSD?tf=4h etc).

import { SYMBOLS, type Symbol } from '@hamafx/shared';

import { Segmented } from '@/components/ui/segmented';
import { useTimeframe } from '@/hooks/use-tf';

export function SymbolPicker({ active }: { active: Symbol }) {
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
      options={SYMBOLS.map((s) => ({ value: s, label: s }))}
    />
  );
}
