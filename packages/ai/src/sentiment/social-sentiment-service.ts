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

// F3 — Social Sentiment Service
//
// Fetches social media / retail positioning sentiment for forex/XAU symbols.
// Uses the existing withRetry helper for exponential backoff.
//
// When no API key is configured, the service gracefully returns `available: false`
// so the Sentiment Agent and other consumers can degrade gracefully.
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F3 for the full design.

import type {
  SocialSentiment,
  AggregatedSentiment,
  SentimentSource,
  SentimentLabel,
} from '@hamafx/shared';
import { scoreToLabel, detectContrarianSignal } from '@hamafx/shared';

import { withRetry } from '../retry';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SentimentEnv {
  SOCIAL_SENTIMENT_API_KEY?: string;
  SOCIAL_SENTIMENT_API_URL?: string;
}

function getEnv(): SentimentEnv {
  return {
    SOCIAL_SENTIMENT_API_KEY: process.env.SOCIAL_SENTIMENT_API_KEY,
    SOCIAL_SENTIMENT_API_URL: process.env.SOCIAL_SENTIMENT_API_URL,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SocialSentimentService {
  constructor(
    private apiKey?: string,
    private apiUrl?: string,
  ) {}

  get isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiUrl);
  }

  /**
   * Fetch sentiment for a single symbol from the external API.
   * Returns null if the service is unavailable or the fetch fails.
   */
  async getSentiment(symbol: string): Promise<SocialSentiment | null> {
    if (!this.isAvailable) {
      return this.unavailable(symbol, 'retail_positioning');
    }

    try {
      return await withRetry(
        async () => {
          const url = `${this.apiUrl!}/sentiment?symbol=${encodeURIComponent(symbol)}`;
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${this.apiKey!}`,
              'Content-Type': 'application/json',
            },
            signal: null,
          });

          if (!res.ok) {
            throw new Error(`Sentiment API returned ${res.status}`);
          }

          const data = (await res.json()) as {
            sentiment?: string;
            score?: number;
            retailLongPct?: number;
            sampleSize?: number;
          };

          return {
            symbol,
            source: 'retail_positioning' as SentimentSource,
            sentiment: (data.sentiment ?? 'neutral') as SentimentLabel,
            score: data.score ?? 0,
            retailLongPct: data.retailLongPct ?? null,
            sampleSize: data.sampleSize ?? 0,
            fetchedAt: Date.now(),
            available: true,
          } satisfies SocialSentiment;
        },
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          maxDelayMs: 5000,
        },
      );
    } catch {
      // All retries exhausted — return unavailable
      return this.unavailable(symbol, 'retail_positioning');
    }
  }

  /**
   * Aggregate sentiment from multiple sources into a single view.
   * Currently only fetches retail positioning, but the architecture
   * supports adding Reddit, Twitter, etc. as additional sources.
   */
  async getAggregatedSentiment(symbol: string): Promise<AggregatedSentiment> {
    const sources: SocialSentiment[] = [];

    // Retail positioning (primary source)
    const retail = await this.getSentiment(symbol);
    if (retail) sources.push(retail);

    // News sentiment — uses the existing news infrastructure
    // (placeholder: the Sentiment Agent already reads news via tools)
    // This could be extended to compute a sentiment score from news articles

    // Compute overall score
    const availableSources = sources.filter((s) => s.available);
    const overallScore =
      availableSources.length > 0
        ? availableSources.reduce((sum, s) => sum + s.score, 0) / availableSources.length
        : 0;

    const overall = scoreToLabel(overallScore);

    // Contrarian signal detection from retail positioning
    const retailSource = sources.find((s) => s.source === 'retail_positioning' && s.available);
    const contrarian = detectContrarianSignal(retailSource?.retailLongPct ?? null);

    return {
      symbol,
      overall,
      overallScore,
      sources,
      contrarianSignal: contrarian.signal,
      contrarianNote: contrarian.note,
      fetchedAt: Date.now(),
    };
  }

  private unavailable(symbol: string, source: SentimentSource): SocialSentiment {
    return {
      symbol,
      source,
      sentiment: 'neutral',
      score: 0,
      retailLongPct: null,
      sampleSize: 0,
      fetchedAt: Date.now(),
      available: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton instance — created from env vars
// ---------------------------------------------------------------------------

let _instance: SocialSentimentService | null = null;

export function getSentimentService(): SocialSentimentService {
  if (_instance) return _instance;
  const env = getEnv();
  _instance = new SocialSentimentService(env.SOCIAL_SENTIMENT_API_KEY, env.SOCIAL_SENTIMENT_API_URL);
  return _instance;
}

/**
 * Reset the singleton — useful for tests.
 */
export function resetSentimentService(): void {
  _instance = null;
}