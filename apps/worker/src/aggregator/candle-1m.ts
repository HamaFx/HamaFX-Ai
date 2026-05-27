// In-process 1-minute candle aggregator.
//
// The SignalR consumer dispatches normalised ticks to `feed(tick)`. The
// aggregator maintains one open bar per symbol. When the next tick lands
// in a NEW minute (per UTC `Math.floor(ts / 60_000)`), the open bar is
// emitted as `CandleClosed` and a fresh bar is started with the tick's
// mid as `o = c`.
//
// Pure data — no IO, no logging — so it's fully golden-testable. The
// flush path that writes closed bars to `candles_1m` lives in
// `persistence/candles-1m.ts` and is wired up at the worker bootstrap.

import type { Symbol } from '@hamafx/shared';

import type { NormalizedTick } from '../signalr/consumer.js';

export interface ClosedCandle {
  symbol: Symbol;
  /** Bar open time, ms epoch UTC. Aligned to the start of the minute. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Real volume — null for FX (BiQuote returns 0). */
  v: number | null;
  /** Number of ticks observed inside the bar. */
  tickVolume: number;
  source: 'biquote-signalr';
}

interface OpenBar {
  bucket: number; // floor(ts / 60_000)
  o: number;
  h: number;
  l: number;
  c: number;
  ticks: number;
}

const MINUTE_MS = 60_000;

export class Candle1mAggregator {
  private readonly bars = new Map<Symbol, OpenBar>();
  private readonly onClosed: (bar: ClosedCandle) => void;

  constructor(onClosed: (bar: ClosedCandle) => void) {
    this.onClosed = onClosed;
  }

  /**
   * Feed a tick. Updates the open bar in place; if the tick crosses a
   * minute boundary, the previous bar is closed (and dispatched to
   * `onClosed`) and a fresh one starts.
   *
   * Ticks within the same minute as an existing bar update H/L/C and bump
   * the tick counter. Out-of-order ticks (`bucket < open.bucket`) are
   * silently ignored — the BiQuote stream is monotonic in practice but
   * we'd rather drop a stray than corrupt the bar.
   */
  feed(tick: NormalizedTick): void {
    const bucket = Math.floor(tick.ts / MINUTE_MS);
    const existing = this.bars.get(tick.symbol);

    if (!existing) {
      this.bars.set(tick.symbol, this.openBar(bucket, tick.mid));
      return;
    }

    if (bucket < existing.bucket) {
      // Stale tick — ignore.
      return;
    }

    if (bucket === existing.bucket) {
      if (tick.mid > existing.h) existing.h = tick.mid;
      if (tick.mid < existing.l) existing.l = tick.mid;
      existing.c = tick.mid;
      existing.ticks += 1;
      return;
    }

    // bucket > existing.bucket — rollover. Close the previous bar(s) and
    // start a fresh one. We only emit one closed bar even if `bucket`
    // jumped multiple minutes (gap during BiQuote outage / weekend) —
    // creating empty bars for missing minutes is undesirable.
    this.emitClosed(tick.symbol, existing);
    this.bars.set(tick.symbol, this.openBar(bucket, tick.mid));
  }

  /**
   * Force-close every currently-open bar. Used at shutdown so we don't
   * lose the last partial bar (acceptable trade-off; the tick count tells
   * downstream consumers it was partial).
   */
  closeAll(): void {
    for (const [symbol, bar] of this.bars) {
      this.emitClosed(symbol, bar);
    }
    this.bars.clear();
  }

  /** Test introspection. */
  peek(symbol: Symbol): OpenBar | undefined {
    return this.bars.get(symbol);
  }

  private openBar(bucket: number, mid: number): OpenBar {
    return { bucket, o: mid, h: mid, l: mid, c: mid, ticks: 1 };
  }

  private emitClosed(symbol: Symbol, bar: OpenBar): void {
    this.onClosed({
      symbol,
      t: bar.bucket * MINUTE_MS,
      o: bar.o,
      h: bar.h,
      l: bar.l,
      c: bar.c,
      v: null,
      tickVolume: bar.ticks,
      source: 'biquote-signalr',
    });
  }
}
