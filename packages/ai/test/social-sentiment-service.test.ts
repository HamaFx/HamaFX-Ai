import { afterEach, describe, expect, it, vi } from 'vitest';

import { SocialSentimentService } from '../src/sentiment/social-sentiment-service';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SocialSentimentService', () => {
  it('returns unavailable sentiment when the integration is not configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new SocialSentimentService();

    const result = await service.getAggregatedSentiment('XAUUSD');

    expect(result.overall).toBe('neutral');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.available).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the abort signal to the external request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        sentiment: 'bullish',
        score: 0.7,
        retailLongPct: 42,
        sampleSize: 100,
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new SocialSentimentService('test-key', 'https://sentiment.test');
    const controller = new AbortController();

    await service.getAggregatedSentiment('XAUUSD', controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://sentiment.test/sentiment?symbol=XAUUSD',
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('does not swallow cancellation as an unavailable-data result', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new SocialSentimentService('test-key', 'https://sentiment.test');
    const controller = new AbortController();
    controller.abort(new Error('turn cancelled'));

    await expect(service.getSentiment('XAUUSD', controller.signal)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
