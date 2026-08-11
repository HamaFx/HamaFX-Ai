'use client';

/**
 * Copyright 2026 Kestrel
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

import type { Symbol, Timeframe } from '@kestrel/shared';

import { TradingViewWidget } from './tradingview-widget';

export function ProChartView({
  symbol,
  tf,
}: {
  symbol: Symbol;
  tf: Timeframe;
}) {
  return (
    <div className="animate-in fade-in duration-300">
      <TradingViewWidget symbol={symbol} tf={tf} theme="dark" />
    </div>
  );
}
