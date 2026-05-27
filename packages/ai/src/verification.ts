// Phase 7c — citation enforcement.
//
// After `streamText` finishes, scan the assistant's text for
// factual-looking claims (price tokens, event names, sentiment counts,
// "as of <time>" stamps) and check each one against the tool calls the
// model actually invoked this turn. When a claim doesn't appear to be
// backed by any tool, surface it through a `data-citation-warning` part
// appended to the assistant message's `parts` JSON.
//
// This is intentionally heuristic and `stance: 'soft'` — false positives
// are tolerable because the warning renders as a tone-muted footer that
// the user can dismiss with a glance. The system prompt also asks the
// model to cite tool outputs; the enforcer's job is to make non-compliance
// visible, not to silence the answer.

import type { CitationWarningPart } from '@hamafx/shared';

interface EnforceArgs {
  /** The assistant text that just streamed. */
  text: string;
  /** AI SDK's `response.messages` from `onFinish`, used to read tool calls. */
  responseMessages: ReadonlyArray<{ content: unknown }>;
}

const PRICE_REGEX = /\b\d{1,5}\.\d{2,5}\b/g;
const EVENT_REGEX =
  /\b(NFP|CPI|PCE|FOMC|GDP|PPI|PMI|Fed|FOMC minutes|ECB|BoE|BoJ|nonfarm|jobless)\b/gi;
const ATTRIBUTION_REGEX = /\b(per|via|according to|from|source)\b/i;

const NUMERIC_TOOLS = new Set([
  'get_price',
  'get_candles',
  'get_indicators',
  'get_market_structure',
  'get_correlation',
  'forecast_volatility',
  'analyze_technical',
  'analyze_fundamental',
  'analyze_chart_image',
  'get_session_levels',
  'get_intermarket',
  'compute_position_health',
  'compute_risk',
  'replay_setup',
  'get_seasonality',
]);

const NEWS_OR_EVENT_TOOLS = new Set([
  'get_news',
  'get_calendar',
  'analyze_fundamental',
  'search_knowledge',
]);

/** Aggregate per-claim findings into a single warning part, or null. */
export function enforceCitations(args: EnforceArgs): CitationWarningPart | null {
  const text = args.text.trim();
  if (text.length === 0) return null;

  const toolsInvoked = readToolNames(args.responseMessages);

  const unsupported: string[] = [];

  // Price-shaped tokens: only flag when the surrounding sentence has no
  // attribution clue AND the relevant tool wasn't called.
  const priceMatches = text.match(PRICE_REGEX) ?? [];
  if (priceMatches.length > 0 && !hasAny(toolsInvoked, NUMERIC_TOOLS)) {
    for (const m of priceMatches.slice(0, 3)) {
      const claim = surroundingPhrase(text, m, 80);
      if (!ATTRIBUTION_REGEX.test(claim)) unsupported.push(claim);
    }
  }

  // Event names without a calendar/news/RAG tool call.
  const eventMatches = text.match(EVENT_REGEX) ?? [];
  if (eventMatches.length > 0 && !hasAny(toolsInvoked, NEWS_OR_EVENT_TOOLS)) {
    for (const m of dedupeIgnoreCase(eventMatches).slice(0, 3)) {
      const claim = surroundingPhrase(text, m, 80);
      unsupported.push(claim);
    }
  }

  if (unsupported.length === 0) return null;

  return {
    type: 'data-citation-warning',
    unsupportedClaims: dedupePreserveOrder(unsupported).slice(0, 5),
    toolsInvoked: [...toolsInvoked].slice(0, 20),
    stance: 'soft',
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readToolNames(messages: ReadonlyArray<{ content: unknown }>): Set<string> {
  const names = new Set<string>();
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content) {
      if (
        part &&
        typeof part === 'object' &&
        'type' in part &&
        ((part as { type: string }).type === 'tool-call' ||
          (part as { type: string }).type === 'tool-result')
      ) {
        const name = (part as { toolName?: string }).toolName;
        if (typeof name === 'string') names.add(name);
      }
    }
  }
  return names;
}

function hasAny(set: Set<string>, candidates: ReadonlySet<string>): boolean {
  for (const c of candidates) if (set.has(c)) return true;
  return false;
}

function surroundingPhrase(haystack: string, needle: string, span: number): string {
  const idx = haystack.indexOf(needle);
  if (idx < 0) return needle;
  const start = Math.max(0, idx - Math.floor(span / 2));
  const end = Math.min(haystack.length, idx + needle.length + Math.floor(span / 2));
  return haystack.slice(start, end).trim();
}

function dedupeIgnoreCase(xs: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = x.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function dedupePreserveOrder(xs: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}
