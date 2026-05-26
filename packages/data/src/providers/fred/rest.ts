// FRED REST client. Single endpoint we need: `/fred/releases/dates`, which
// returns the schedule for ALL releases in a date window. We filter
// downstream to the curated set in `./map.ts`.
//
// Reference: https://fred.stlouisfed.org/docs/api/fred/releases_dates.html
//
// FRED has no formal request quota for occasional readers. We still
// self-throttle modestly so a cron loop can't accidentally spin.

import { z } from 'zod';

import { tryReserve, type ThrottleConfig } from '../../cache/throttle';
import { ProviderError } from '../../errors';

const PROVIDER = 'fred';
const BASE_URL = 'https://api.stlouisfed.org';
const DEFAULT_TIMEOUT_MS = 10_000;
const THROTTLE: ThrottleConfig = { limit: 30, windowMs: 60_000 };

const ReleaseDateSchema = z.object({
  release_id: z.number(),
  release_name: z.string(),
  date: z.string(), // YYYY-MM-DD
});

const ResponseSchema = z.object({
  release_dates: z.array(ReleaseDateSchema),
});

export type FredReleaseDate = z.infer<typeof ReleaseDateSchema>;

export interface FetchReleasesParams {
  apiKey: string;
  /** ISO date YYYY-MM-DD. Default = today. */
  from?: string;
  /** ISO date YYYY-MM-DD. Default = today + 30 days. */
  to?: string;
  signal?: AbortSignal;
  skipThrottle?: boolean;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchReleaseDates(params: FetchReleasesParams): Promise<FredReleaseDate[]> {
  if (!params.skipThrottle && !tryReserve(PROVIDER, THROTTLE)) {
    throw new ProviderError(
      'PROVIDER_QUOTA_EXCEEDED',
      PROVIDER,
      `Self-throttle: capped at ${THROTTLE.limit} req / ${THROTTLE.windowMs}ms`,
    );
  }

  const now = new Date();
  const fromDefault = isoDate(now);
  const toDefault = isoDate(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));

  const url = new URL('/fred/releases/dates', BASE_URL);
  url.searchParams.set('api_key', params.apiKey);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('realtime_start', params.from ?? fromDefault);
  url.searchParams.set('realtime_end', params.to ?? toDefault);
  url.searchParams.set('include_release_dates_with_no_data', 'true');
  url.searchParams.set('limit', '1000');
  url.searchParams.set('order_by', 'release_date');
  url.searchParams.set('sort_order', 'asc');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), DEFAULT_TIMEOUT_MS);
  if (params.signal) {
    if (params.signal.aborted) ctrl.abort(params.signal.reason);
    else params.signal.addEventListener('abort', () => ctrl.abort(params.signal!.reason));
  }

  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } catch (cause) {
    clearTimeout(timer);
    const isAbort = (cause as Error)?.name === 'AbortError';
    throw new ProviderError(
      isAbort ? 'PROVIDER_TIMEOUT' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      isAbort ? 'request timed out' : 'fetch failed',
      { cause },
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw new ProviderError(
      res.status === 429 ? 'PROVIDER_QUOTA_EXCEEDED' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `HTTP ${res.status} ${res.statusText}`,
      { status: res.status },
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (cause) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'invalid JSON', { cause });
  }

  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'unexpected shape', {
      cause: parsed.error,
    });
  }
  return parsed.data.release_dates;
}


// ---------------------------------------------------------------------------
// /fred/series/observations — used by the actuals backfill cron.
// ---------------------------------------------------------------------------

const ObservationSchema = z.object({
  date: z.string(),  // YYYY-MM-DD
  value: z.string(), // FRED returns "." for missing observations
});

const ObservationsResponseSchema = z.object({
  observations: z.array(ObservationSchema),
});

export interface FetchObservationParams {
  apiKey: string;
  seriesId: string;
  /** Lower bound on observation_start (inclusive). YYYY-MM-DD. */
  start: string;
  /** Upper bound on observation_end (inclusive). YYYY-MM-DD. */
  end: string;
  signal?: AbortSignal;
  skipThrottle?: boolean;
}

export interface FredObservation {
  date: string;
  value: number;
}

/**
 * Fetch observations for a single FRED series in `[start, end]`. Returns
 * one entry per release date that actually has a numeric value (FRED's
 * `"."` placeholder is dropped). Empty array when the series has nothing
 * in the window.
 */
export async function fetchObservations(
  params: FetchObservationParams,
): Promise<FredObservation[]> {
  if (!params.skipThrottle && !tryReserve(PROVIDER, THROTTLE)) {
    throw new ProviderError(
      'PROVIDER_QUOTA_EXCEEDED',
      PROVIDER,
      `Self-throttle: capped at ${THROTTLE.limit} req / ${THROTTLE.windowMs}ms`,
    );
  }

  const url = new URL('/fred/series/observations', BASE_URL);
  url.searchParams.set('api_key', params.apiKey);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('series_id', params.seriesId);
  url.searchParams.set('observation_start', params.start);
  url.searchParams.set('observation_end', params.end);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), DEFAULT_TIMEOUT_MS);
  if (params.signal) {
    if (params.signal.aborted) ctrl.abort(params.signal.reason);
    else params.signal.addEventListener('abort', () => ctrl.abort(params.signal!.reason));
  }

  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } catch (cause) {
    clearTimeout(timer);
    const isAbort = (cause as Error)?.name === 'AbortError';
    throw new ProviderError(
      isAbort ? 'PROVIDER_TIMEOUT' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      isAbort ? 'request timed out' : 'fetch failed',
      { cause },
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw new ProviderError(
      res.status === 429 ? 'PROVIDER_QUOTA_EXCEEDED' : 'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `HTTP ${res.status} ${res.statusText}`,
      { status: res.status },
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (cause) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'invalid JSON', { cause });
  }
  const parsed = ObservationsResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'unexpected shape', {
      cause: parsed.error,
    });
  }

  const out: FredObservation[] = [];
  for (const o of parsed.data.observations) {
    if (o.value === '.' || o.value.trim().length === 0) continue;
    const v = Number(o.value);
    if (!Number.isFinite(v)) continue;
    out.push({ date: o.date, value: v });
  }
  return out;
}
