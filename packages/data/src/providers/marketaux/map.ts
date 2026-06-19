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

// Marketaux entity ↔ internal symbol/currency tagging.
//
// Marketaux's entity model is stock-centric, but it does surface forex via
// `type=currency`. We also detect XAU/gold via keywords because gold isn't
// modelled as a currency entity by all sources.

import type { CurrencyTag, Symbol, SymbolOrCurrencyTag } from '@hamafx/shared';

interface MarketauxEntity {
  symbol?: string | undefined;
  name?: string | undefined;
  type?: string | undefined;
  industry?: string | undefined;
  match_score?: number | undefined;
  sentiment_score?: number | undefined;
}

const FX_CURRENCY_TAGS: Record<string, CurrencyTag> = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  // Marketaux occasionally reports gold/XAU as a "Commodities" entity rather
  // than a currency. We catch it via keyword detection in `extractSymbols`.
};

const GOLD_RE = /\b(gold|xau)\b/i;
const PAIR_RE: Array<[RegExp, Symbol]> = [
  [/\bxau[\s/-]?usd\b/i, 'XAUUSD'],
  [/\beur[\s/-]?usd\b/i, 'EURUSD'],
  [/\bgbp[\s/-]?usd\b/i, 'GBPUSD'],
];

/**
 * Derive symbol tags from a Marketaux article. We union:
 *   - explicit currency entities ($USD, $EUR, $GBP)
 *   - pair patterns in title/snippet ("EUR/USD", "EURUSD")
 *   - gold keywords ("gold", "XAU")
 *
 * Result is deduped + filtered to the 4 currency tags + 3 symbols we care
 * about; anything else falls out so the news_articles.symbols column stays
 * a tight, indexable set.
 */
export function extractSymbols(args: {
  entities: MarketauxEntity[];
  title: string;
  snippet: string | null;
}): SymbolOrCurrencyTag[] {
  const out = new Set<SymbolOrCurrencyTag>();

  // 1) Currency entities (Marketaux flags these explicitly).
  for (const e of args.entities) {
    if (e.type === 'currency' && e.symbol && FX_CURRENCY_TAGS[e.symbol]) {
      out.add(FX_CURRENCY_TAGS[e.symbol]!);
    }
  }

  const text = `${args.title} ${args.snippet ?? ''}`;

  // 2) Pair patterns → instrument symbols.
  for (const [re, sym] of PAIR_RE) {
    if (re.test(text)) out.add(sym);
  }

  // 3) Gold detection. We tag both the currency-style "XAU" and (when paired
  //    with USD context) the instrument "XAUUSD".
  if (GOLD_RE.test(text)) {
    out.add('XAU');
    // If there's USD context elsewhere in the article, bump to XAUUSD too.
    if (/\busd\b|\bdollar\b|\bfed\b/i.test(text)) out.add('XAUUSD');
  }

  return [...out];
}

/**
 * Aggregate per-entity sentiment scores into a single article-level
 * (label, score). We weight by `match_score` so headlines that strongly
 * mention an entity dominate.
 *
 * Returns null if no entities had numeric sentiment — Marketaux occasionally
 * omits scores for less prominent stories.
 */
export function aggregateSentiment(
  entities: MarketauxEntity[],
): { label: 'positive' | 'negative' | 'neutral'; score: number } | null {
  let weightSum = 0;
  let weighted = 0;
  for (const e of entities) {
    if (typeof e.sentiment_score !== 'number') continue;
    const w = typeof e.match_score === 'number' ? Math.max(e.match_score, 0.001) : 1;
    weighted += e.sentiment_score * w;
    weightSum += w;
  }
  if (weightSum === 0) return null;
  const score = weighted / weightSum;
  const label = score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral';
  return { label, score };
}
