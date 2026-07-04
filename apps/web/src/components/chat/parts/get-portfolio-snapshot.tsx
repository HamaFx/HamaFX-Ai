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

import { type GetPortfolioSnapshotOutput } from '@hamafx/shared';
import {IconShield, IconTrendingUp, IconAlertTriangle} from '@tabler/icons-react';

interface GetPortfolioSnapshotPartProps {
  /** Tool output, or `null` while streaming / before completion. */
  output: GetPortfolioSnapshotOutput | null;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

export function GetPortfolioSnapshotPart({ output, state, errorMessage }: GetPortfolioSnapshotPartProps) {
  if (state === 'error') {
    return (
      <div role="alert" className="border-bear/30 bg-bg-elev-1 text-bear rounded-sm border p-3 text-sm">
        Portfolio snapshot unavailable{errorMessage ? ` · ${errorMessage}` : ''}
      </div>
    );
  }
  if (state === 'loading' || !output) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-sm border p-3" aria-busy="true">
        <div className="bg-bg-elev-2 mb-2 h-3 w-32 animate-pulse rounded-sm" />
        <div className="bg-bg-elev-2 h-20 w-full animate-pulse rounded-sm" />
      </div>
    );
  }

  if (output.empty) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-sm border p-3 text-fg-muted text-sm text-center">
        No open positions.
      </div>
    );
  }

  const { risk, positions } = output;

  return (
    <div className="border-border bg-bg-elev-1 rounded-sm border p-3 space-y-4">
      <div className="text-fg-muted text-xs">
        Portfolio Snapshot · {new Date(output.asOf).toLocaleTimeString()}
      </div>

      {risk && (
        <div className="grid grid-cols-2 gap-3 border-b border-border pb-3">
          <div>
            <div className="text-fg-muted text-caption flex items-center gap-1">
              <IconTrendingUp className="size-3" />
              <span>Exposure</span>
            </div>
            <div className="text-fg font-semibold mt-0.5 tabular-nums">
              ${risk.totalExposureUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-fg-muted text-xs font-normal ml-1">
                ({risk.totalExposurePct.toFixed(1)}%)
              </span>
            </div>
          </div>
          <div>
            <div className="text-fg-muted text-caption flex items-center gap-1">
              <IconShield className="size-3" />
              <span>Risk</span>
            </div>
            <div className="text-fg font-semibold mt-0.5 tabular-nums">
              ${risk.totalRiskUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-fg-muted text-xs font-normal ml-1">
                ({risk.totalRiskPct.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>
      )}

      {risk && risk.alerts.length > 0 && (
        <div className="space-y-1">
          {risk.alerts.map((alert, i) => (
            <div
              key={`alert-${i}`}
              className={`flex items-start gap-1.5 text-xs p-2 rounded-sm ${
                alert.level === 'danger'
                  ? 'bg-bear/10 text-bear border border-bear/20'
                  : 'bg-warn/10 text-warn border border-warn/20'
              }`}
            >
              <IconAlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      <ul className="space-y-2">
        {positions.map((pos, i) => {
          const isBull = pos.unrealizedPnlUsd !== null && pos.unrealizedPnlUsd >= 0;
          return (
            <li key={`position-${i}`} className="flex items-center justify-between gap-3 p-2 bg-bg-elev-1 rounded-sm">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-fg font-semibold">{pos.symbol}</span>
                  <span
                    className={`text-caption px-1.5 py-0.5 rounded-sm font-medium ${
                      pos.direction === 'long'
                        ? 'bg-bull/15 text-bull'
                        : 'bg-bear/15 text-bear'
                    }`}
                  >
                    {pos.direction.toUpperCase()}
                  </span>
                </div>
                <span className="text-fg-muted text-caption mt-0.5">
                  {pos.lotSize} lots @ {pos.entryPrice}
                </span>
              </div>
              <div className="text-right">
                {pos.unrealizedPnlUsd !== null && pos.unrealizedPnlPct !== null ? (
                  <div className={`font-semibold tabular-nums ${isBull ? 'text-bull' : 'text-bear'}`}>
                    {isBull ? '+' : ''}${pos.unrealizedPnlUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    <div className="text-caption font-normal">
                      {isBull ? '+' : ''}{pos.unrealizedPnlPct.toFixed(2)}%
                    </div>
                  </div>
                ) : (
                  <span className="text-fg-muted">-</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
