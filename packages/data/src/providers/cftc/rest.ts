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

// CFTC Socrata client — Disaggregated Futures-Only dataset.
//
// Endpoint: https://publicreporting.cftc.gov/resource/gpe5-46if.json
// Reference: https://publicreporting.cftc.gov/Commitments-of-Traders/Disaggregated-Reports-Futures-Only/gpe5-46if
//
// We do not need an app token for the volumes we use (1 weekly call per
// symbol). The endpoint accepts a `where` clause + `$order` + `$limit` so
// we can ask for "the latest row whose market_and_exchange_names = X" in
// one round trip.

import { z } from 'zod';

import { tryReserve, type ThrottleConfig } from '../../cache/throttle';
import { ProviderError } from '../../errors';

const PROVIDER = 'cftc';
const BASE_URL = 'https://publicreporting.cftc.gov/resource/gpe5-46if.json';
const DEFAULT_TIMEOUT_MS = 8_000;
const THROTTLE: ThrottleConfig = { limit: 30, windowMs: 60_000 };

/**
 * Subset of the CFTC row we map into `cot_reports`. The full row has 100+
 * fields; we keep the schema permissive and pluck out the ones we need.
 */
const CftcRowSchema = z
  .object({
    report_date_as_yyyy_mm_dd: z.string(),
    market_and_exchange_names: z.string(),
    dealer_positions_long_all: z.string().optional(),
    dealer_positions_short_all: z.string().optional(),
    asset_mgr_positions_long_all: z.string().optional(),
    asset_mgr_positions_short_all: z.string().optional(),
    lev_money_positions_long_all: z.string().optional(),
    lev_money_positions_short_all: z.string().optional(),
    other_rept_positions_long_all: z.string().optional(),
    other_rept_positions_short_all: z.string().optional(),
  })
  .passthrough();

export type CftcRow = z.infer<typeof CftcRowSchema>;

export interface FetchLatestArgs {
  /** CFTC `market_and_exchange_names` literal — see `./map.ts`. */
  commodityName: string;
  signal?: AbortSignal;
  /** Number of weekly rows to fetch. Default 8. */
  weeks?: number;
  skipThrottle?: boolean;
}

export async function fetchLatestRows(args: FetchLatestArgs): Promise<CftcRow[]> {
  if (!args.skipThrottle && !(await tryReserve(PROVIDER, THROTTLE))) {
    throw new ProviderError(
      'PROVIDER_QUOTA_EXCEEDED',
      PROVIDER,
      `Self-throttle: capped at ${THROTTLE.limit} req / ${THROTTLE.windowMs}ms`,
    );
  }

  const url = new URL(BASE_URL);
  url.searchParams.set('$where', `market_and_exchange_names="${args.commodityName}"`);
  url.searchParams.set('$order', 'report_date_as_yyyy_mm_dd DESC');
  url.searchParams.set('$limit', String(args.weeks ?? 8));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), DEFAULT_TIMEOUT_MS);
  if (args.signal) {
    if (args.signal.aborted) ctrl.abort(args.signal.reason);
    else args.signal.addEventListener('abort', () => ctrl.abort(args.signal!.reason));
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
  if (!Array.isArray(json)) {
    throw new ProviderError('PROVIDER_PARSE_ERROR', PROVIDER, 'expected JSON array');
  }

  const out: CftcRow[] = [];
  for (const row of json) {
    const parsed = CftcRowSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * Parse a CFTC string-typed integer column into `number | null`. Empty
 * strings and the literal `"."` (Socrata's missing-data placeholder) map
 * to null.
 */
export function parseCftcInt(s: string | undefined): number | null {
  if (s === undefined || s.trim().length === 0 || s === '.') return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
