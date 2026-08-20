import { randomUUID } from 'node:crypto';

import { getCandlesWithMeta, getPriceWithMeta } from '@kestrel/data';
import { computeIndicator } from '@kestrel/indicators';
import {
  ALL_SYMBOLS,
  CandleSchema,
  IndicatorRequestSchema,
  IndicatorResultSchema,
  SymbolSchema,
  TickSchema,
  TimeframeSchema,
  type IndicatorRequest,
  type Symbol,
  type Timeframe,
} from '@kestrel/shared';
import { z } from 'zod';

const RESEARCH_TIMEFRAMES: readonly { timeframe: Timeframe; count: number }[] = [
  { timeframe: '1d', count: 120 },
  { timeframe: '4h', count: 120 },
  { timeframe: '1h', count: 160 },
  { timeframe: '15m', count: 160 },
];

const RESEARCH_INDICATORS: readonly IndicatorRequest[] = [
  { kind: 'ema', params: { period: 20 } },
  { kind: 'ema', params: { period: 50 } },
  { kind: 'rsi', params: { period: 14 } },
  { kind: 'macd', params: { fast: 12, slow: 26, signal: 9 } },
  { kind: 'atr', params: { period: 14 } },
];

const EvidenceSchema = z.object({
  evidenceId: z.string().min(1),
  symbol: SymbolSchema,
  timeframe: TimeframeSchema,
  source: z.string().min(1),
  fetchedAt: z.string().datetime(),
  dataAsOf: z.string().datetime(),
  freshness: z.enum(['fresh', 'stale', 'unknown']),
  quality: z.enum(['complete', 'partial', 'degraded']),
  warnings: z.array(z.string()),
  candles: z.array(CandleSchema),
  indicators: z.array(IndicatorResultSchema),
});

export const SymbolResearchPacketSchema = z.object({
  packetId: z.string().min(1),
  kind: z.literal('symbol_research_packet'),
  symbol: SymbolSchema,
  generatedAt: z.string().datetime(),
  status: z.enum(['ready', 'blocked']),
  dataQuality: z.enum(['complete', 'partial', 'degraded']),
  price: z
    .object({
      evidenceId: z.string().min(1),
      symbol: SymbolSchema,
      source: z.string().min(1),
      fetchedAt: z.string().datetime(),
      dataAsOf: z.string().datetime(),
      freshness: z.enum(['fresh', 'stale', 'unknown']),
      quality: z.enum(['complete', 'partial', 'degraded']),
      warnings: z.array(z.string()),
      tick: TickSchema,
    })
    .nullable(),
  timeframes: z.array(EvidenceSchema),
  optionalContext: z.object({
    available: z.boolean(),
    reason: z.string().min(1),
  }),
  missingData: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type SymbolResearchPacket = z.infer<typeof SymbolResearchPacketSchema>;
export type SymbolResearchEvidence = z.infer<typeof EvidenceSchema>;

export const SYMBOL_RESEARCH_TIMEFRAMES = RESEARCH_TIMEFRAMES;
export const SYMBOL_RESEARCH_INDICATORS = RESEARCH_INDICATORS;

function abortError(): Error {
  const error = new Error('Symbol research was cancelled');
  error.name = 'AbortError';
  return error;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Collect one bounded technical packet for any canonical Kestrel symbol.
 * Fundamental evidence is deliberately represented as an explicit optional
 * gap here; XAUUSD's richer macro packet remains on its verified report path.
 */
export async function collectSymbolResearchPacket(
  symbolInput: Symbol,
  signal?: AbortSignal,
): Promise<SymbolResearchPacket> {
  const symbol = SymbolSchema.parse(symbolInput);
  if (signal?.aborted) throw signal.reason ?? abortError();

  const generatedAt = new Date().toISOString();
  const [priceResult, ...candleResults] = await Promise.allSettled([
    getPriceWithMeta(symbol, signal ? { signal } : {}),
    ...RESEARCH_TIMEFRAMES.map(({ timeframe, count }) =>
      getCandlesWithMeta(symbol, timeframe, {
        count,
        ...(signal ? { signal } : {}),
      }),
    ),
  ]);

  if (signal?.aborted) throw signal.reason ?? abortError();

  const missingData: string[] = [];
  const warnings: string[] = [];
  let price: SymbolResearchPacket['price'] = null;

  if (priceResult?.status === 'fulfilled') {
    const result = priceResult.value;
    const priceWarnings = [
      ...(result.stale ? ['Price was served from stale-while-error cache'] : []),
      ...(result.ageMs !== null && result.ageMs > 10_000
        ? ['Price is older than the fresh-data threshold']
        : []),
    ];
    price = {
      evidenceId: `price-${symbol}-${randomUUID()}`,
      symbol,
      source: result.tick.source,
      fetchedAt: iso(result.producedAt),
      dataAsOf: iso(result.tick.ts),
      freshness: result.stale
        ? 'stale'
        : result.ageMs !== null && result.ageMs > 10_000
          ? 'stale'
          : 'fresh',
      quality: priceWarnings.length === 0 ? 'complete' : 'degraded',
      warnings: priceWarnings,
      tick: result.tick,
    };
    warnings.push(...priceWarnings);
  } else {
    missingData.push(`Current ${symbol} price is unavailable.`);
    warnings.push(`Current ${symbol} price could not be collected.`);
  }

  const timeframes: SymbolResearchEvidence[] = [];
  for (let index = 0; index < RESEARCH_TIMEFRAMES.length; index += 1) {
    const requested = RESEARCH_TIMEFRAMES[index]!;
    const result = candleResults[index];
    if (!result || result.status === 'rejected') {
      missingData.push(`${symbol} ${requested.timeframe} candles are unavailable.`);
      warnings.push(`${symbol} ${requested.timeframe} candle collection failed.`);
      continue;
    }

    const candles = result.value.candles;
    const latest = candles.at(-1);
    const timeframeWarnings = [
      ...(result.value.stale ? ['Candles were served from stale-while-error cache'] : []),
      ...(candles.length < requested.count
        ? [`Only ${candles.length} candles were available; ${requested.count} were requested`]
        : []),
      ...(!latest ? ['No candles were returned'] : []),
    ];
    const indicators = latest
      ? RESEARCH_INDICATORS.map((request) => {
          const computed = computeIndicator({
            symbol,
            tf: requested.timeframe,
            kind: request.kind,
            params: request.params,
            candles,
          });
          return { ...computed, values: computed.values.slice(-8) };
        })
      : [];
    const evidence = EvidenceSchema.parse({
      evidenceId: `research-${symbol}-${requested.timeframe}-${randomUUID()}`,
      symbol,
      timeframe: requested.timeframe,
      source: latest?.source ?? 'unknown',
      fetchedAt: iso(result.value.producedAt),
      dataAsOf: latest ? iso(latest.t) : iso(result.value.producedAt),
      freshness: latest ? (result.value.stale ? 'stale' : 'fresh') : 'unknown',
      quality: timeframeWarnings.length === 0 ? 'complete' : 'degraded',
      warnings: timeframeWarnings,
      candles: candles.slice(-80),
      indicators,
    });
    timeframes.push(evidence);
    warnings.push(...timeframeWarnings);
    if (candles.length === 0)
      missingData.push(`${symbol} ${requested.timeframe} returned no candles.`);
  }

  const requiredTimeframesReady = RESEARCH_TIMEFRAMES.every((window) =>
    timeframes.some(
      (evidence) => evidence.timeframe === window.timeframe && evidence.candles.length > 0,
    ),
  );
  const status = price !== null && requiredTimeframesReady ? 'ready' : 'blocked';
  const dataQuality =
    status === 'blocked'
      ? 'degraded'
      : missingData.length > 0
        ? 'partial'
        : warnings.length > 0
          ? 'degraded'
          : 'complete';

  return SymbolResearchPacketSchema.parse({
    packetId: `symbol-research-${symbol}-${randomUUID()}`,
    kind: 'symbol_research_packet',
    symbol,
    generatedAt,
    status,
    dataQuality,
    price,
    timeframes,
    optionalContext: {
      available: false,
      reason: `Fundamental context is not part of the generalized ${symbol} packet; use the XAUUSD fundamental workflow where applicable.`,
    },
    missingData: unique(missingData),
    warnings: unique(warnings),
  });
}

export function serializeSymbolResearchPacket(packet: SymbolResearchPacket): string {
  return JSON.stringify({
    ...packet,
    timeframes: packet.timeframes.map((evidence) => ({
      ...evidence,
      candles: evidence.candles.slice(-12),
      indicators: evidence.indicators.map((indicator) => ({
        ...indicator,
        values: indicator.values.slice(-3),
      })),
    })),
  });
}

export const SymbolResearchInputSchema = z.object({ symbol: SymbolSchema });
export const SymbolResearchIndicatorRequestSchema = IndicatorRequestSchema;

const MUTATION_TERMS =
  /\b(?:buy|sell|enter|exit|execute|place|open|close|trade|position|portfolio|journal|alert|notify|schedule|automate)\b/i;
const SYMBOL_PATTERN = new RegExp(`\b(?:${ALL_SYMBOLS.join('|')})\b`, 'gi');

/** Extract one canonical symbol from a prompt, using the fallback only when no symbol is named. */
export function extractSymbolFromPrompt(prompt: string, fallback?: string): string | null {
  if (prompt.toLowerCase().includes('gold')) return 'XAUUSD';
  const explicitSymbols = ALL_SYMBOLS.filter((symbol) => prompt.toUpperCase().includes(symbol));
  if (explicitSymbols.length > 1) return null;
  if (explicitSymbols.length === 1) return explicitSymbols[0]!;
  if (/\bgold\b/i.test(prompt)) return 'XAUUSD';
  const matches = [...prompt.matchAll(SYMBOL_PATTERN)].map((match) => match[0]!.toUpperCase());
  const unique = [...new Set(matches)];
  if (unique.length > 1) return null;
  if (unique.length === 1) return SymbolSchema.parse(unique[0]);
  if (fallback === undefined) return null;
  const parsed = SymbolSchema.safeParse(fallback);
  return parsed.success ? parsed.data : null;
}

/** Conservative server-side guard for the read-only generalized mode path. */
export function isSafeSymbolResearchPrompt(prompt: string): boolean {
  return (
    !MUTATION_TERMS.test(prompt) &&
    !/ignore\\s+(?:all\\s+)?(?:previous|prior|above)\\s+instructions|system\\s*:|developer\\s*:|DAN\\s+mode/i.test(
      prompt,
    )
  );
}
