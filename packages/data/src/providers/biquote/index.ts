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

// Public surface of the BiQuote provider. Adapters import from here.
//
// Steering rule §7: no WebSocket clients live inside this directory. The
// SignalR consumer that holds the persistent BiQuote hub connection lives
// in `apps/worker/src/signalr/` (Phase 8 PR-6).

export { fetchTick, fetchLatest, fetchOhlc, type FetchOhlcArgs } from './rest';
export {
  toBiquoteSymbol,
  toBiquoteTimeframe,
  parseBiquoteDate,
} from './map';
export { assertSupportedSymbol } from './filter';
