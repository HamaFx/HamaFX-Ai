// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useState } from 'react';
import { IconClock, IconFlame } from '@tabler/icons-react';
import { cn } from '@/lib/cn';

interface MarketSession {
  id: string;
  name: string;
  shortName: string;
  startHourUtc: number;
  endHourUtc: number;
}

const SESSIONS: MarketSession[] = [
  { id: 'asia', name: 'Tokyo / Asia', shortName: 'ASIA', startHourUtc: 0, endHourUtc: 9 },
  { id: 'london', name: 'London', shortName: 'LON', startHourUtc: 7, endHourUtc: 16 },
  { id: 'ny', name: 'New York', shortName: 'NY', startHourUtc: 12, endHourUtc: 21 },
];

function isSessionActive(s: MarketSession, utcHour: number): boolean {
  if (s.startHourUtc <= s.endHourUtc) {
    return utcHour >= s.startHourUtc && utcHour < s.endHourUtc;
  }
  return utcHour >= s.startHourUtc || utcHour < s.endHourUtc;
}

export function MarketSessionBar() {
  const [mounted, setMounted] = useState(false);
  const [utcTime, setUtcTime] = useState({ hour: 0, minute: 0, second: 0, str: '--:--:-- UTC' });

  useEffect(() => {
    setMounted(true);
    function update() {
      const d = new Date();
      const h = d.getUTCHours();
      const m = d.getUTCMinutes();
      const s = d.getUTCSeconds();
      const pad = (n: number) => n.toString().padStart(2, '0');
      setUtcTime({
        hour: h,
        minute: m,
        second: s,
        str: `${pad(h)}:${pad(m)}:${pad(s)} UTC`,
      });
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const isLondonNyOverlap =
    mounted && utcTime.hour >= 12 && utcTime.hour < 16;
  const isNyOpenKillzone =
    mounted && utcTime.hour >= 12 && utcTime.hour < 15;
  const isLondonOpenKillzone =
    mounted && utcTime.hour >= 7 && utcTime.hour < 10;

  return (
    <div
      aria-label="Global market trading sessions"
      className="border-b border-border/50 bg-bg-elev-1/60 px-3 py-1 flex items-center justify-between text-caption font-mono"
    >
      <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-0.5">
        <div className="flex items-center gap-1.5 text-fg-subtle shrink-0">
          <IconClock className="size-3.5 text-fg-subtle" />
          <span className="tabular-nums font-medium text-fg-muted">{utcTime.str}</span>
        </div>

        <div className="h-3 w-px bg-border shrink-0" />

        <div className="flex items-center gap-1.5 shrink-0">
          {SESSIONS.map((s) => {
            const active = mounted && isSessionActive(s, utcTime.hour);
            return (
              <span
                key={s.id}
                className={cn(
                  'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold tracking-wider transition-colors',
                  active
                    ? 'bg-bull/15 text-bull border border-bull/30'
                    : 'bg-bg-elev-2 text-fg-subtle/70 border border-border/40',
                )}
                title={`${s.name} Session (${s.startHourUtc}:00 - ${s.endHourUtc}:00 UTC)`}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    active ? 'bg-bull animate-pulse' : 'bg-fg-subtle/40',
                  )}
                />
                {s.shortName}
              </span>
            );
          })}
        </div>

        {(isLondonNyOverlap || isNyOpenKillzone || isLondonOpenKillzone) && (
          <>
            <div className="h-3 w-px bg-border shrink-0" />
            <span
              className="inline-flex items-center gap-1 rounded-sm bg-brand/15 border border-brand/40 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-brand shrink-0"
              title="High volatility killzone window"
            >
              <IconFlame className="size-3 text-brand animate-pulse" />
              {isLondonNyOverlap
                ? 'OVERLAP KILLZONE'
                : isNyOpenKillzone
                  ? 'NY OPEN'
                  : 'LON OPEN'}
            </span>
          </>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-2 text-fg-subtle/80 text-[10px] shrink-0">
        <span>24H FX/GOLD</span>
      </div>
    </div>
  );
}
