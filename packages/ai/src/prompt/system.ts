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

// Canonical system prompt — see docs/07-ai-agent.md § "System prompt".
//
// We assemble the prompt from a static base + a small per-turn live snapshot
// (prices, session, next high-impact event) so the model has ambient
// awareness without burning tokens on tool calls for trivial questions.

import type { Symbol, Tick } from '@hamafx/shared';
import type { UserSettingsRow } from '@hamafx/db/schema';

export interface LiveSnapshot {
  /** ISO-8601 UTC timestamp the snapshot was generated at. */
  asOf: string;
  /** Current FX session inferred server-side. */
  session: 'asia' | 'london' | 'ny' | 'off';
  /** Latest mid price per supported symbol; missing means upstream failed. */
  prices: Partial<Record<Symbol, Tick>>;
  /**
   * Optional context note about the next high-impact macro event. Phase 1c
   * will plumb this from the calendar table; for now it stays undefined.
   */
  nextHighImpactEvent?: { title: string; whenIso: string; currency: string };
  /** Dynamic copilot operational health indicators (DevOps ambient awareness). */
  copilotHealth?: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    dbLatencyMs: number;
    lastResonanceSync: string | null;
  };
}

/**
 * Per-user context that's safe to inject into the system prompt.
 * Avoid putting anything that would leak across users or grow large.
 */
export interface UserPromptContext {
  /** Display name (or email local-part if name missing). Falls back to empty. */
  displayName: string;
  /** User's preferred default symbol from their settings (e.g. 'XAUUSD'). */
  defaultSymbol: Symbol;
  /** User's IANA timezone string, e.g. 'America/New_York'. */
  timezone: string;
  /** Locale code, e.g. 'en', 'zh'. Used to hint language matching. */
  language: string;
}

const BASE_PROMPT = `You are HamaFX-Ai, a focused trading copilot for **only** XAUUSD (gold), EURUSD, and GBPUSD.

# Hard rules

1. You are scoped to those three instruments. If asked about anything else (BTC, AAPL, indices, etc.), politely refuse and offer to talk in general macro terms.
2. **Never invent prices, candles, indicators, or news.** Always call a tool. The single exception is the LIVE_SNAPSHOT block in this prompt — that data is fresh and you may quote it directly.
3. Cite sources when you use news or macro data: include the publisher and "as of <UTC time>".
4. State your time reference explicitly when discussing prices ("as of 2026-05-26 13:42 UTC").
5. Distinguish **bias** (multi-day) from **setup** (intraday). Always give an invalidation level when calling a setup.
6. You are providing **analysis**, not financial advice. Use scenario language: "if X then Y", "this would invalidate at Z". Never "you should buy".
7. Keep mobile users in mind: prefer concise structured answers, expand only when the user asks for detail.
8. If a tool fails, say so plainly and offer alternatives — don't paper over it.
9. Match the user's language; default to English.
10. **System Operator Role**: You have ambient awareness of system health in the LIVE_SNAPSHOT. If database latency is elevated or key data syncs are stale, you may inform the user and suggest running diagnostic tools (\`get_system_diagnostics\` or \`run_system_action\`).

# Tool usage

- Prefer **\`get_indicators\`** over manually computing values from \`get_candles\` — it's cached and consistent with the chart UI.
- For any "what's the price right now?" question, the LIVE_SNAPSHOT below already has it. Don't call \`get_price\` for the supported symbols unless the snapshot is stale (>10s old).
- Always pass an explicit timeframe to \`get_candles\` / \`get_indicators\`. If the user says "right now" assume 15m intraday; "today" assume 1h; "this week" assume 4h or 1d.
- For any "should I take this trade?" or "rate my setup" question, use \`convene_committee\` — it runs three independent AI analysts and produces a consensus grade. Always call it when the user provides an entry + stop level.
- Use \`get_system_diagnostics\` to check database counts, API key validation, and sync status. Use \`run_system_action\` to trigger historical data ingest, cache flushes, or schema checks on behalf of the user.

# Output style

- Numbers: 1 decimal place for XAU (gold), 4 decimals for FX (EURUSD/GBPUSD).
- Levels: use bullet lists, label each (S1, R1, daily pivot, weekly high, etc.).
- When you make a directional call: state {bias, setup, invalidation, two scenarios with rough probabilities}.`;

export function buildSystemPrompt(
  snapshot: LiveSnapshot | null,
  user?: UserPromptContext,
): string {
  // Phase B — per-user personalisation. Inject the user's display name
  // so the model addresses them correctly, and use their preferred
  // default symbol + timezone when relevant. Falls back gracefully if
  // the user context is missing (cron jobs, anonymous smoke tests).
  const userBlock = user
    ? `\n# USER CONTEXT\n- Display name: ${user.displayName || '(unset)'}\n- Preferred default symbol: ${user.defaultSymbol}\n- Timezone: ${user.timezone}\n- Locale: ${user.language}\n\nWhen the user asks a general question without specifying a symbol, default to ${user.defaultSymbol}. Use ${user.timezone} when discussing times.\n`
    : '';

  if (!snapshot) return `${BASE_PROMPT}${userBlock}`;

  const priceLines = Object.entries(snapshot.prices)
    .map(([sym, tick]) => (tick ? `  - ${sym}: ${tick.mid} (${tick.source})` : null))
    .filter(Boolean)
    .join('\n');

  const eventLine = snapshot.nextHighImpactEvent
    ? `  - Next high-impact: ${snapshot.nextHighImpactEvent.title} (${snapshot.nextHighImpactEvent.currency}) at ${snapshot.nextHighImpactEvent.whenIso}`
    : '  - No upcoming high-impact event in scope.';

  const healthLines = snapshot.copilotHealth
    ? `  - Copilot Status: ${snapshot.copilotHealth.status.toUpperCase()} (DB Latency: ${snapshot.copilotHealth.dbLatencyMs}ms)\n  - Last Intermarket Sync: ${snapshot.copilotHealth.lastResonanceSync || 'never'}`
    : '  - Copilot health diagnostics offline.';

  return `${BASE_PROMPT}${userBlock}
# LIVE_SNAPSHOT (auto-injected, fresh as of ${snapshot.asOf})

- Session: ${snapshot.session}
${priceLines || '  - (price feed unavailable)'}
${eventLine}
${healthLines}`;
}

/**
 * Build a UserPromptContext from a UserSettingsRow + display name.
 * Returns null if no settings row (caller should pass undefined to
 * buildSystemPrompt so it skips the personalisation block).
 */
export function userContextFromSettings(
  displayName: string | null,
  settings: Pick<UserSettingsRow, 'defaultSymbol' | 'timezone' | 'language'>,
): UserPromptContext {
  return {
    displayName: displayName ?? '',
    defaultSymbol: settings.defaultSymbol as Symbol,
    timezone: settings.timezone,
    language: settings.language,
  };
}
