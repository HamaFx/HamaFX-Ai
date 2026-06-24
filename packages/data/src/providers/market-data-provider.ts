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

import type { Symbol, Timeframe, Tick, Candle } from '@hamafx/shared';

export interface MarketDataProvider {
  id: string;
  displayName: string;
  testConnection(apiKeys?: Record<string, string>): Promise<{ ok: boolean; error?: string }>;
  fetchTick(
    symbol: Symbol,
    options?: { signal?: AbortSignal; apiKeys?: Record<string, string> }
  ): Promise<Tick>;
  fetchCandles(
    symbol: Symbol,
    tf: Timeframe,
    count: number,
    options?: { signal?: AbortSignal; apiKeys?: Record<string, string> }
  ): Promise<Candle[]>;
}
