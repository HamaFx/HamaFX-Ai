// Auto-Journal — parse a "Journal: I shorted XAUUSD at 2392 SL 2398 TP 2378"
// shortcut into a structured `JournalShortcut` so the chat route can save
// the trade before delegating to the LLM.
//
// Tolerant by design — the user might type "Journal:", "journal:", "JRNL:",
// short verbs ("buy", "sold"), commas instead of spaces, and lowercase
// symbols. We accept all of those and round-trip them through a single
// regex with a few `.match()` follow-ups.
//
// Returns `null` on any parse failure; the caller leaves the user message
// untouched and lets the regular `log_journal` tool flow handle it.

import type { Symbol, TradeSide } from '@hamafx/shared';

export interface JournalShortcut {
  side: TradeSide;
  symbol: Symbol;
  entry: number;
  stop: number | null;
  target: number | null;
}

const PREFIX_RE = /^\s*(?:journal|jrnl)\s*:\s*/i;

const SIDE_LONG_RE = /\b(?:long(?:ed|ing)?|buy|bought|buying)\b/i;
const SIDE_SHORT_RE = /\b(?:short(?:ed|ing)?|sell|sold|selling)\b/i;

const SYMBOL_RE = /\b(xauusd|eurusd|gbpusd|gold)\b/i;

const ENTRY_RE = /\b(?:at|@)\s*([0-9]+(?:\.[0-9]+)?)/i;
const STOP_RE = /\b(?:sl|stop(?:\s*loss)?)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i;
const TARGET_RE = /\b(?:tp|target|take[\s-]*profit|tp1)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i;

const SUPPORTED_SYMBOLS: readonly Symbol[] = ['XAUUSD', 'EURUSD', 'GBPUSD'] as const;

export function parseJournalShortcut(text: string): JournalShortcut | null {
  if (typeof text !== 'string') return null;

  const m0 = text.match(PREFIX_RE);
  if (!m0) return null;
  const body = text.slice(m0[0].length);

  // Side: long XOR short. If both match (e.g. "long but later shorted"),
  // bail out — the user can be explicit by re-typing.
  const isLong = SIDE_LONG_RE.test(body);
  const isShort = SIDE_SHORT_RE.test(body);
  if (isLong === isShort) return null;
  const side: TradeSide = isLong ? 'long' : 'short';

  const sm = body.match(SYMBOL_RE);
  if (!sm) return null;
  const sym = sm[1]!.toUpperCase();
  const symbol: Symbol | null =
    sym === 'GOLD' ? 'XAUUSD' : (SUPPORTED_SYMBOLS as readonly string[]).includes(sym) ? (sym as Symbol) : null;
  if (!symbol) return null;

  const em = body.match(ENTRY_RE);
  if (!em) return null;
  const entry = Number.parseFloat(em[1]!);
  if (!Number.isFinite(entry) || entry <= 0) return null;

  const sm2 = body.match(STOP_RE);
  const stop = sm2 ? Number.parseFloat(sm2[1]!) : null;

  const tm = body.match(TARGET_RE);
  const target = tm ? Number.parseFloat(tm[1]!) : null;

  return {
    side,
    symbol,
    entry,
    stop: stop !== null && Number.isFinite(stop) ? stop : null,
    target: target !== null && Number.isFinite(target) ? target : null,
  };
}

/**
 * Render a `JournalShortcut` back to a human-readable line. Used by the
 * chat route to append a system message confirming the saved entry.
 */
export function describeShortcut(s: JournalShortcut): string {
  const parts = [`${s.side} ${s.symbol} @ ${s.entry}`];
  if (s.stop !== null) parts.push(`SL ${s.stop}`);
  if (s.target !== null) parts.push(`TP ${s.target}`);
  return parts.join(' · ');
}
