import {
  fetchNews,
  fetchUpcomingEvents,
} from '@kestrel/data';
import { fetchObservations, fetchResonanceInputs } from '@kestrel/data/providers/fred';
import { EconomicEventSchema, NewsArticleSchema } from '@kestrel/shared';

import { createEvidenceId, qualityFromWarnings } from './evidence';
import { XAUUSD, XauusdMacroEvidenceSchema, type XauusdMacroEvidence } from './types';

const MACRO_WINDOW_DAYS = 30;
const CALENDAR_WINDOW_DAYS = 7;

export interface XauusdMacroFetchResult {
  news: PromiseSettledResult<Awaited<ReturnType<typeof fetchNews>>>;
  events: PromiseSettledResult<Awaited<ReturnType<typeof fetchUpcomingEvents>>>;
  dollarIndex: PromiseSettledResult<Awaited<ReturnType<typeof fetchObservations>>>;
  resonance: PromiseSettledResult<Awaited<ReturnType<typeof fetchResonanceInputs>>>;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function providerError(message: string): Error {
  const error = new Error(message);
  error.name = 'MacroProviderUnavailable';
  return error;
}

/** Collect optional macro inputs in parallel; missing providers remain typed gaps. */
export async function fetchXauusdMacroData(signal?: AbortSignal): Promise<XauusdMacroFetchResult> {
  const now = Date.now();
  const fredKey = process.env.FRED_API_KEY ?? '';
  const start = isoDate(now - MACRO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const end = isoDate(now);

  const [news, events, dollarIndex, resonance] = await Promise.allSettled([
    fetchNews({
      symbol: XAUUSD,
      limit: 8,
      publishedAfter: `${start}T00:00:00.000Z`,
      ...(signal ? { signal } : {}),
    }),
    fetchUpcomingEvents({
      fromMs: now,
      toMs: now + CALENDAR_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      ...(signal ? { signal } : {}),
    }),
    fredKey
      ? fetchObservations({ apiKey: fredKey, seriesId: 'DTWEXBGS', start, end, ...(signal ? { signal } : {}) })
      : Promise.reject(providerError('FRED_API_KEY is not configured')),
    fredKey
      ? fetchResonanceInputs({ apiKey: fredKey, start, end, ...(signal ? { signal } : {}) })
      : Promise.reject(providerError('FRED_API_KEY is not configured')),
  ]);

  return { news, events, dollarIndex, resonance };
}

function latestTimestamp(
  generatedAt: string,
  news: readonly { publishedAt: number }[],
  observations: readonly { date: string }[],
): number {
  const timestamps = [
    ...news.map((item) => item.publishedAt),
    ...observations.map((item) => Date.parse(item.date)),
  ].filter((value) => Number.isFinite(value));
  const generatedMs = Date.parse(generatedAt);
  return timestamps.length > 0
    ? Math.max(...timestamps)
    : Number.isFinite(generatedMs)
      ? generatedMs
      : Date.now();
}

/** Turn optional provider results into one provenance-bearing macro evidence item. */
export function assembleXauusdMacroEvidence(
  packetId: string,
  generatedAt: string,
  fetched: XauusdMacroFetchResult,
): { evidence: XauusdMacroEvidence | null; missingData: string[]; warnings: string[] } {
  const missingData: string[] = [];
  const warnings: string[] = [];
  const news = fetched.news.status === 'fulfilled' ? fetched.news.value : [];
  const events = fetched.events.status === 'fulfilled' ? fetched.events.value : [];
  const dollarIndex = fetched.dollarIndex.status === 'fulfilled' ? fetched.dollarIndex.value : [];
  const resonance = fetched.resonance.status === 'fulfilled'
    ? fetched.resonance.value
    : { realYields: [], breakevenInflation: [] };

  if (fetched.news.status === 'rejected') missingData.push('Gold-relevant news is unavailable.');
  if (fetched.events.status === 'rejected') missingData.push('The economic calendar is unavailable.');
  if (fetched.dollarIndex.status === 'rejected') missingData.push('Dollar-strength data is unavailable.');
  if (fetched.resonance.status === 'rejected') missingData.push('US real-yield and inflation-expectation data is unavailable.');

  const parsedNews = news.map((item) => NewsArticleSchema.parse(item));
  const parsedEvents = events.map((item) => EconomicEventSchema.parse(item));
  const allObservations = [...dollarIndex, ...resonance.realYields, ...resonance.breakevenInflation];
  const hasAnyData = parsedNews.length > 0 || parsedEvents.length > 0 || allObservations.length > 0;
  if (!hasAnyData) {
    missingData.push('No macro evidence was returned by the configured providers.');
    return { evidence: null, missingData, warnings };
  }

  if (missingData.length > 0) warnings.push('Macro context is partial because one or more providers were unavailable.');

  const observations = allObservations.map((item) => item.date);
  const dataAsOf = new Date(latestTimestamp(generatedAt, parsedNews, observations.map((date) => ({ date })))).toISOString();
  const evidence = XauusdMacroEvidenceSchema.parse({
    evidenceId: createEvidenceId('macro', XAUUSD),
    kind: 'macro',
    symbol: XAUUSD,
    source: 'finnhub/marketaux/fred',
    fetchedAt: generatedAt,
    dataAsOf,
    freshness: 'fresh',
    quality: qualityFromWarnings(warnings),
    warnings,
    data: {
      news: parsedNews,
      events: parsedEvents,
      dollarIndex,
      realYields: resonance.realYields,
      breakevenInflation: resonance.breakevenInflation,
    },
  });
  return { evidence, missingData, warnings };
}
