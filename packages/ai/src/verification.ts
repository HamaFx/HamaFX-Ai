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

// Phase 7c — citation enforcement.
//
// After `streamText` finishes, scan the assistant's text for
// factual-looking claims (price tokens, macro event names) and check
// each one against the tool calls the model actually invoked this
// turn. When a claim doesn't appear to be backed by any tool, surface
// it through a `data-citation-warning` part appended to the assistant
// message's `parts` JSON.
//
// Phase 3 hardening §5 — precision tightened so the warning earns
// trust:
//
//   - PRICE_TOKEN now only matches values in the bands of our three
//     supported instruments (gold `1xxx.xx`–`4xxxx.xx`, FX `0.xxxx`
//     / `1.xxxx`). The previous regex matched any decimal, including
//     version-like `1.0` and timestamps `2026.05.27`.
//   - ATTRIBUTION_TOKEN requires an explicit reference verb (`per`,
//     `via`, `according to`, `cited`, …) instead of accepting bare
//     `from` / `source`.
//   - Tool detection counts `tool-call` parts, not `tool-result`,
//     because a replayed tool-result from an older message could
//     falsely satisfy "covered this turn".
//   - The output collapses into ONE muted footer line ("Numbers in
//     this answer weren't verified against a tool call this turn.")
//     instead of a per-claim list, so a noisy assistant doesn't
//     produce a wall of warnings.

import type { CitationWarningPart } from '@hamafx/shared';

import { ATTRIBUTION_TOKEN, EVENT_TOKEN, PRICE_TOKEN } from './verification/regex';

interface EnforceArgs {
  /** The assistant text that just streamed. */
  text: string;
  /** AI SDK's `response.messages` from `onFinish`, used to read tool calls. */
  responseMessages: ReadonlyArray<{ content: unknown }>;
}

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

const SUMMARY_MESSAGE = (
  "Numbers in this answer weren't verified against a tool call this turn."
);

/**
 * Per-claim finding exposed on the warning part. Phase B — item 9.
 */
export interface CitationFinding {
  text: string;
  supported: boolean;
  supportingTool: string | null;
}

/**
 * Phase B — UX_UPGRADE_PLAN.md item 9.
 * Internal type returned by `collectFindings`. The public API
 * (the one called by the agent) is still `enforceCitations` which
 * returns a flat `CitationWarningPart` (with the new optional
 * `findings` field populated for downstream drill-down).
 */
export interface CitationFindingReport {
  findings: CitationFinding[];
  toolsInvoked: string[];
}

/** Internal: per-claim analysis without the legacy summary line. */
export function collectFindings(args: EnforceArgs): CitationFindingReport | null {
  const text = args.text.trim();
  if (text.length === 0) return null;
  const toolsInvoked = readToolCallNames(args.responseMessages);
  const findings: CitationFinding[] = [];

  if (!hasAny(toolsInvoked, NUMERIC_TOOLS)) {
    const priceMatches = uniqueMatches(text, PRICE_TOKEN);
    for (const m of priceMatches) {
      const sentence = containingSentence(text, m);
      if (ATTRIBUTION_TOKEN.test(sentence)) continue;
      findings.push({
        text: surroundingPhrase(text, m, 80),
        supported: false,
        supportingTool: null,
      });
      if (findings.length >= 8) break;
    }
  }

  if (!hasAny(toolsInvoked, NEWS_OR_EVENT_TOOLS)) {
    const eventMatches = uniqueMatches(text, EVENT_TOKEN);
    for (const m of eventMatches) {
      findings.push({
        text: surroundingPhrase(text, m, 80),
        supported: false,
        supportingTool: null,
      });
      if (findings.length >= 8) break;
    }
  }

  if (findings.length === 0) return null;
  return { findings, toolsInvoked: [...toolsInvoked] };
}

/**
 * Public entry point. Aggregates the structured findings into a
 * single warning part. `unsupportedClaims[0]` carries the legacy
 * summary line; the per-claim drill-down lives in the new
 * `findings` field. Both shapes are persisted so a future reader
 * that doesn't know about `findings` still gets the headline.
 */
export function enforceCitations(args: EnforceArgs): CitationWarningPart | null {
  const report = collectFindings(args);
  if (!report) return null;
  return {
    type: 'data-citation-warning',
    unsupportedClaims: [SUMMARY_MESSAGE],
    toolsInvoked: report.toolsInvoked.slice(0, 20),
    stance: 'soft',
    createdAt: Date.now(),
    findings: report.findings,
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Phase 3 hardening §5 — count `tool-call` parts only. `tool-result`
 * parts are echoed back into the conversation history on subsequent
 * turns, which would let a stale result satisfy "covered this turn".
 */
function readToolCallNames(messages: ReadonlyArray<{ content: unknown }>): Set<string> {
  const names = new Set<string>();
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const part of m.content) {
      if (
        part &&
        typeof part === 'object' &&
        'type' in part &&
        (part as { type: string }).type === 'tool-call'
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

/**
 * Extract the sentence containing `needle` from `haystack`. Sentence
 * boundaries are `.`, `!`, `?` followed by whitespace or EOL. Falls
 * back to a 200-char window when no sentence boundary is found.
 *
 * Used by the attribution check so words clipped by the
 * `surroundingPhrase` window (e.g. "According to" → "cording to") don't
 * lose their `\b`-anchored match.
 */
function containingSentence(haystack: string, needle: string): string {
  const idx = haystack.indexOf(needle);
  if (idx < 0) return needle;
  // Walk left to a sentence boundary or start of text.
  let start = idx;
  while (start > 0 && !/[.!?]/.test(haystack[start - 1] ?? '')) start -= 1;
  while (start < idx && /\s/.test(haystack[start] ?? '')) start += 1;
  // Walk right to a sentence boundary or end of text.
  let end = idx + needle.length;
  while (end < haystack.length && !/[.!?]/.test(haystack[end] ?? '')) end += 1;
  if (end < haystack.length) end += 1; // include the punctuation
  // Bound to 200 chars in case the text has no sentence punctuation.
  if (end - start > 200) {
    start = Math.max(0, idx - 100);
    end = Math.min(haystack.length, idx + needle.length + 100);
  }
  return haystack.slice(start, end).trim();
}

/**
 * Run a global regex across `text` and return the unique match strings
 * in the order they were first seen. Resets the regex's lastIndex so
 * repeated calls share the same RegExp instance safely.
 */
function uniqueMatches(text: string, re: RegExp): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // RegExp objects with `g` carry state across `.exec()` calls; reset
  // first so a previous turn doesn't leak into this one.
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = m[0];
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
    if (out.length >= 10) break;
  }
  return out;
}
