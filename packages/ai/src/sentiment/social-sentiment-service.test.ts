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

// F3 — Social Sentiment Service Tests
//
// Tests the sentiment service with and without API key configured,
// and the shared helper functions (scoreToLabel, detectContrarianSignal).

import { afterEach, describe, expect, it } from 'vitest';

import { SocialSentimentService, resetSentimentService } from './social-sentiment-service';
import { scoreToLabel, detectContrarianSignal } from '@hamafx/shared';

afterEach(() => {
  resetSentimentService();
});

describe('scoreToLabel', () => {
  it('maps high positive scores to very_bullish', () => {
    expect(scoreToLabel(0.6)).toBe('very_bullish');
    expect(scoreToLabel(0.5)).toBe('very_bullish');
  });

  it('maps moderate positive scores to bullish', () => {
    expect(scoreToLabel(0.2)).toBe('bullish');
    expect(scoreToLabel(0.15)).toBe('bullish');
  });

  it('maps near-zero scores to neutral', () => {
    expect(scoreToLabel(0)).toBe('neutral');
    expect(scoreToLabel(0.1)).toBe('neutral');
    expect(scoreToLabel(-0.1)).toBe('neutral');
  });

  it('maps moderate negative scores to bearish', () => {
    expect(scoreToLabel(-0.2)).toBe('bearish');
    expect(scoreToLabel(-0.15)).toBe('bearish');
  });

  it('maps high negative scores to very_bearish', () => {
    expect(scoreToLabel(-0.6)).toBe('very_bearish');
    expect(scoreToLabel(-0.5)).toBe('very_bearish');
  });
});

describe('detectContrarianSignal', () => {
  it('detects bearish contrarian signal when retail is extremely long', () => {
    const result = detectContrarianSignal(80);
    expect(result.signal).toBe(true);
    expect(result.note).toContain('contrarian bearish');
  });

  it('detects bullish contrarian signal when retail is extremely short', () => {
    const result = detectContrarianSignal(20);
    expect(result.signal).toBe(true);
    expect(result.note).toContain('contrarian bullish');
  });

  it('returns no signal for moderate positioning', () => {
    const result = detectContrarianSignal(50);
    expect(result.signal).toBe(false);
    expect(result.note).toBeNull();
  });

  it('returns no signal when retailLongPct is null', () => {
    const result = detectContrarianSignal(null);
    expect(result.signal).toBe(false);
    expect(result.note).toBeNull();
  });

  it('handles boundary values correctly', () => {
    expect(detectContrarianSignal(75).signal).toBe(true);
    expect(detectContrarianSignal(25).signal).toBe(true);
    expect(detectContrarianSignal(74).signal).toBe(false);
    expect(detectContrarianSignal(26).signal).toBe(false);
  });
});

describe('SocialSentimentService', () => {
  it('returns unavailable when no API key is configured', async () => {
    const service = new SocialSentimentService(undefined, undefined);
    expect(service.isAvailable).toBe(false);

    const result = await service.getSentiment('XAUUSD');
    expect(result.available).toBe(false);
    expect(result.sentiment).toBe('neutral');
    expect(result.score).toBe(0);
  });

  it('returns unavailable aggregated sentiment when no API key', async () => {
    const service = new SocialSentimentService(undefined, undefined);
    const result = await service.getAggregatedSentiment('XAUUSD');

    expect(result.overall).toBe('neutral');
    expect(result.overallScore).toBe(0);
    expect(result.contrarianSignal).toBe(false);
    expect(result.sources.every((s) => !s.available)).toBe(true);
  });

  it('is available when API key and URL are configured', () => {
    const service = new SocialSentimentService('test-key', 'https://api.example.com');
    expect(service.isAvailable).toBe(true);
  });
});