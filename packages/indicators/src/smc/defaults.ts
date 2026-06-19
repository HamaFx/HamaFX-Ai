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

// Timeframe-aware defaults for SMC parameters.
import type { Timeframe } from '@hamafx/shared';

/**
 * Adaptive swing lookback: smaller k for fast timeframes (less noise),
 * larger k for slow timeframes (more significant swings).
 */
export function defaultSwingLookback(tf: Timeframe): number {
  switch (tf) {
    case '1m':
    case '5m':
      return 2;
    case '15m':
    case '30m':
    case '1h':
      return 3;
    case '4h':
    case '1d':
    case '1w':
      return 5;
  }
}
