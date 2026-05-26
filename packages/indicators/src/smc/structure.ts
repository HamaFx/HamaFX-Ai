// BOS / CHoCH detection.
//
//   BOS  (Break Of Structure): break of last swing in the prevailing trend.
//                              Confirms continuation.
//   CHoCH (Change of Character): break against the prevailing trend.
//                                Marks potential trend flip.
//
// State machine:
//   1. Walk swings in chronological order. The trend "starts" once we have
//      one swing-high above a prior swing-high (uptrend) or one swing-low
//      below a prior swing-low (downtrend). Until then we have no trend.
//   2. Walk candles forward from the latest reference swing. A close that
//      breaks the most-recent UNBROKEN swing in the trend direction = BOS.
//      A close that breaks the swing in the OPPOSITE direction = CHoCH and
//      flips the trend.
//
// Edge cases handled:
//   - Multiple unbroken swings of the same type stacked (we always pick the
//     most-recent one to break; older ones become stale once a closer one
//     breaks).
//   - First-ever break (no prior trend): emitted as BOS in the break's
//     direction; trend established from there.

import type { Candle, StructureDirection, StructureEvent, SwingPoint } from '@hamafx/shared';

export interface DetectStructureOptions {
  /**
   * If true, only count breaks that close beyond the level. If false, a
   * mere wick beyond the level confirms a break. Default: true (closes).
   */
  closeBased?: boolean;
}

export function detectStructure(
  candles: Candle[],
  swings: SwingPoint[],
  opts: DetectStructureOptions = {},
): StructureEvent[] {
  const closeBased = opts.closeBased ?? true;
  if (candles.length === 0 || swings.length === 0) return [];

  const events: StructureEvent[] = [];

  // Track most recent unbroken swing high / low we could break against.
  let lastHigh: { swing: SwingPoint; idx: number } | null = null;
  let lastLow: { swing: SwingPoint; idx: number } | null = null;
  let trend: StructureDirection | null = null;

  // Iterate candles. For each, we (a) check if any pre-existing reference
  // swing has been broken by this candle, (b) if a swing's `index` was just
  // passed, register it as a new reference.
  let nextSwingPtr = 0;

  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i]!;

    // (a) Check for breaks against existing references.
    const breakValue = (high: boolean) => (closeBased ? c.c : high ? c.h : c.l);

    if (lastHigh && breakValue(true) > lastHigh.swing.price) {
      const direction: StructureDirection = 'bullish';
      const kind = trend === 'bullish' || trend === null ? 'bos' : 'choch';
      events.push({
        kind,
        direction,
        brokenAt: i,
        time: c.t,
        level: lastHigh.swing.price,
        swingIndex: lastHigh.idx,
      });
      trend = 'bullish';
      // Once broken, this high is no longer a reference. The next swing
      // high above this break becomes the new reference.
      lastHigh = null;
    } else if (lastLow && breakValue(false) < lastLow.swing.price) {
      const direction: StructureDirection = 'bearish';
      const kind = trend === 'bearish' || trend === null ? 'bos' : 'choch';
      events.push({
        kind,
        direction,
        brokenAt: i,
        time: c.t,
        level: lastLow.swing.price,
        swingIndex: lastLow.idx,
      });
      trend = 'bearish';
      lastLow = null;
    }

    // (b) Register any swing that "completes" at this index. A swing's
    // `index` field is its bar; a swing only becomes a reference once the
    // bar k+1 after it has formed (i.e. swing pivots are "confirmed" with
    // a lag). We use swing.index + swing.lookback as the confirmation bar.
    while (nextSwingPtr < swings.length) {
      const s = swings[nextSwingPtr]!;
      if (s.index + s.lookback > i) break;
      if (s.type === 'high') lastHigh = { swing: s, idx: nextSwingPtr };
      else lastLow = { swing: s, idx: nextSwingPtr };
      nextSwingPtr += 1;
    }
  }

  return events;
}
