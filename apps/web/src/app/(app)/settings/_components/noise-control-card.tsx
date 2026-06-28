'use client';

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

// F4 — Noise Control Settings Card
//
// Client component for configuring notification noise control:
// quiet hours, min severity, cooldown, dedup TTL, and daily digest mode.

import { Bell, Moon, Clock, Filter, Zap } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import type { NoiseConfig, Severity } from '@hamafx/shared';

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
  { value: 'critical', label: 'Critical' },
];

export function NoiseControlCard({ initialConfig }: { initialConfig?: NoiseConfig | null }) {
  const [config, setConfig] = useState<NoiseConfig>(
    initialConfig ?? {
      dedupTtlSeconds: 300,
      cooldownSeconds: 60,
      quietHours: null,
      timezone: 'UTC',
      minSeverity: 'info',
      minSeverityDuringQuietHours: 'critical',
      dailyDigestMode: false,
    },
  );
  const [saving, setSaving] = useState(false);

  const update = useCallback(
    (updates: Partial<NoiseConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...updates };
        setSaving(true);
        fetch('/api/notifications/noise-config', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(updates),
        })
          .then(() => setSaving(false))
          .catch(() => setSaving(false));
        return next;
      });
    },
    [],
  );

  return (
    <section
      className="border border-divider bg-bg-elev-1 rounded-lg flex flex-col gap-4 p-4"
      aria-labelledby="noise-control-heading"
    >
      <div className="flex items-center gap-3 pb-2">
        <h2
          id="noise-control-heading"
          className="text-fg text-base font-semibold tracking-tight"
        >
          Notification noise control
        </h2>
        {saving && <span className="text-xs text-fg-muted">Saving…</span>}
      </div>

      <p className="text-sm text-fg-subtle">
        Reduce notification fatigue with dedup, cooldown, quiet hours, and severity filtering.
      </p>

      {/* Quiet Hours */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Moon className="size-4 text-fg-muted" />
          <span className="text-sm font-medium text-fg">Quiet hours</span>
          <Switch
            checked={config.quietHours !== null}
            onCheckedChange={(enabled) =>
              update({
                quietHours: enabled
                  ? { start: '22:00', end: '07:00' }
                  : null,
              })
            }
            srLabel="Toggle quiet hours"
          />
        </div>
        {config.quietHours && (
          <div className="flex items-center gap-2 pl-6">
            <Clock className="size-3.5 text-fg-muted" />
            <input
              type="time"
              value={config.quietHours.start}
              onChange={(e) =>
                update({
                  quietHours: { ...config.quietHours!, start: e.target.value },
                })
              }
              className="rounded border border-border bg-surface px-2 py-1 text-sm text-fg"
            />
            <span className="text-fg-muted text-sm">to</span>
            <input
              type="time"
              value={config.quietHours.end}
              onChange={(e) =>
                update({
                  quietHours: { ...config.quietHours!, end: e.target.value },
                })
              }
              className="rounded border border-border bg-surface px-2 py-1 text-sm text-fg"
            />
          </div>
        )}
      </div>

      {/* Min Severity */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-fg-muted" />
          <span className="text-sm font-medium text-fg">Minimum severity</span>
        </div>
        <div className="flex gap-2 pl-6">
          {SEVERITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update({ minSeverity: opt.value })}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium transition-colors',
                config.minSeverity === opt.value
                  ? 'bg-brand text-white'
                  : 'bg-surface-elevated text-fg-muted hover:text-fg',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Min Severity During Quiet Hours */}
      {config.quietHours && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Moon className="size-4 text-fg-muted" />
            <span className="text-sm font-medium text-fg">Min severity during quiet hours</span>
          </div>
          <div className="flex gap-2 pl-6">
            {SEVERITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => update({ minSeverityDuringQuietHours: opt.value })}
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium transition-colors',
                  config.minSeverityDuringQuietHours === opt.value
                    ? 'bg-brand text-white'
                    : 'bg-surface-elevated text-fg-muted hover:text-fg',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cooldown */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-fg-muted" />
          <span className="text-sm font-medium text-fg">Cooldown (seconds)</span>
        </div>
        <input
          type="number"
          min={0}
          max={86400}
          value={config.cooldownSeconds}
          onChange={(e) => update({ cooldownSeconds: Number(e.target.value) })}
          className="ml-6 w-32 rounded border border-border bg-surface px-2 py-1 text-sm text-fg"
        />
      </div>

      {/* Dedup TTL */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-fg-muted" />
          <span className="text-sm font-medium text-fg">Dedup window (seconds)</span>
        </div>
        <input
          type="number"
          min={0}
          max={86400}
          value={config.dedupTtlSeconds}
          onChange={(e) => update({ dedupTtlSeconds: Number(e.target.value) })}
          className="ml-6 w-32 rounded border border-border bg-surface px-2 py-1 text-sm text-fg"
        />
      </div>

      {/* Daily Digest */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-fg">Daily digest mode</span>
        <Switch
          checked={config.dailyDigestMode}
          onCheckedChange={(v) => update({ dailyDigestMode: v })}
          srLabel="Toggle daily digest mode"
        />
        <span className="text-xs text-fg-muted">
          Batch non-critical notifications into a daily summary
        </span>
      </div>
    </section>
  );
}