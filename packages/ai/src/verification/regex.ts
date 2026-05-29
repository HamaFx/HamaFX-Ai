// Phase 3 hardening §5 + §6 — centralised verification regexes.
//
// `verification.ts` (the citation enforcer) used a permissive
// `/\b\d{1,5}\.\d{2,5}\b/` for "looks like a price". That regex matched
// version-like decimals (`1.0`, `2024.05`) and any other number with a
// decimal — noise that trained the user to ignore the muted footer
// warnings. The verify_call tool has its own price-handling that (so
// far) doesn't share the regex; centralising the source-of-truth here
// keeps the two in sync as the schema evolves.
//
// Three exported building blocks:
//
//   - `PRICE_TOKEN`: per-symbol price-shape probe. Anchored to our
//     three supported instruments (XAUUSD 4-digit thousands, FX
//     0.xxxx / 1.xxxx).
//   - `EVENT_TOKEN`: high-impact macro events the model is most prone
//     to invent.
//   - `ATTRIBUTION_TOKEN`: explicit reference verbs. The pre-fix list
//     accepted bare "from" / "source", which appeared in too many
//     non-attribution contexts.
//
// All three are constants — `new RegExp` per call would be wasteful
// in a heuristic that runs on every assistant turn.

/**
 * Matches a price-shaped token for one of our three supported symbols.
 *
 *   - XAUUSD: `1xxx.xx`–`4xxxx.xx` (gold typically trades 1500–4000;
 *     the upper bound covers a black-swan spike).
 *   - EURUSD / GBPUSD: `0.xxxx` or `1.xxxx` to four or five decimals.
 *
 * Boundary guards:
 *   - `(?<!\d\.)` — not part of a longer numeric token (e.g. `1.2.3`).
 *   - `(?<!\d)` — not part of a longer integer (e.g. `12024.05`).
 *   - `(?!\d)` — no digit immediately after.
 *   - `(?!\.\d)` — not followed by a `.<digit>` continuation, which
 *     catches dotted timestamps like `2024.05.27` and version strings
 *     like `1.0.0` that would otherwise pass the simpler boundary.
 */
export const PRICE_TOKEN = new RegExp(
  String.raw`(?<!\d\.)(?<!\d)\b(` +
    // gold band
    String.raw`[1-4]\d{3}\.\d{1,2}` +
    `|` +
    // FX bands
    String.raw`[01]\.\d{4,5}` +
    String.raw`)\b(?!\d)(?!\.\d)`,
  'g',
);

/**
 * Matches the macro-event names the model is most likely to invent.
 * Includes both the abbreviation and a canonical phrase for the bigger
 * releases.
 */
export const EVENT_TOKEN =
  /\b(NFP|CPI|PCE|FOMC|GDP|PPI|PMI|Fed|FOMC minutes|ECB|BoE|BoJ|nonfarm|jobless)\b/gi;

/**
 * Explicit attribution verbs. The pre-fix list accepted bare "from",
 * which is too noisy ("from the previous high", "from yesterday",
 * etc.). This shorter list requires a verb that actually points at a
 * source.
 */
export const ATTRIBUTION_TOKEN =
  /\b(per|via|according to|sourced from|cite[sd]?|reported by|tool result)\b/i;
