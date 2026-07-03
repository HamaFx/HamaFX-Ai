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

import { Bell, Moon, Clock, Filter, Zap, Mail, Smartphone, Info, BarChart3 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import type { NoiseConfig, Severity } from '@hamafx/shared';

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
  { value: 'critical', label: 'Critical' },
];

interface DigestPreview {
  breakdown: {
    total: number;
    allowed: number;
    blocked: number;
    bySeverity: { severity: Severity; total: number; allowed: number; blocked: number }[];
    digestMode: boolean;
  };
  allowedPct: number;
  blockedPct: number;
  dailyEstimate: number;
}

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
  const savingRef = useRef(false);
  const [preview, setPreview] = useState<DigestPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Debounced save: fires 300ms after config stops changing
  useEffect(() => {
    if (savingRef.current) return;
    const timer = setTimeout(() => {
      setSaving(true);
      savingRef.current = true;
      fetch('/api/notifications/noise-config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(config),
      })
        .then(() => { setSaving(false); savingRef.current = false; })
        .catch(() => { setSaving(false); savingRef.current = false; });
    }, 300);
    return () => clearTimeout(timer);
  }, [config]);

  // Fetch preview when config changes
  useEffect(() => {
    setPreviewLoading(true);
    fetch('/api/alerts/preview-digest')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setPreview(data))
      .catch(() => setPreview(null))
      .finally(() => setPreviewLoading(false));
  }, [config]);

  const update = useCallback(
    (updates: Partial<NoiseConfig>) => {
      setConfig((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  return (
    <section
      className="border border-zinc-800 bg-zinc-950 rounded-sm flex flex-col gap-4 p-4"
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

      {/* Alert Preview */}
      {preview && (
        <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-fg" />
            <span className="text-sm font-semibold text-fg">Alert preview</span>
            {previewLoading && <span className="text-xs text-fg-muted">Refreshing…</span>}
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold tabular-nums text-fg">{preview.breakdown.total}</p>
              <p className="text-xs text-fg-subtle">Total</p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-emerald-500">{preview.breakdown.allowed}</p>
              <p className="text-xs text-fg-subtle">Allowed</p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-red-500">{preview.breakdown.blocked}</p>
              <p className="text-xs text-fg-subtle">Blocked</p>
            </div>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-sm bg-zinc-800">
            <div
              className="bg-fg transition-all duration-300"
              style={{ width: `${preview.allowedPct}%` }}
            />
            <div
              className="bg-fg-muted/30 transition-all duration-300"
              style={{ width: `${preview.blockedPct}%` }}
            />
          </div>
          <div className="grid grid-cols-4 gap-1 text-center text-caption tabular-nums">
            {SEVERITY_OPTIONS.map((sev) => {
              const b = preview.breakdown.bySeverity.find((s) => s.severity === sev.value);
              if (!b) return null;
              const actPct = b.total > 0 ? Math.round((b.allowed / b.total) * 100) : 0;
              return (
                <div key={sev.value} className="flex flex-col">
                  <span className="text-fg-subtle">{sev.label}</span>
                  <span className="font-medium text-fg">{actPct}%</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-fg-subtle">
            ~{preview.dailyEstimate} alerts/day with current filters.
          </p>
        </div>
      )}

      {/* Smart Alert Digest */}
      <div className="rounded-sm border border-brand/20 bg-zinc-950 p-3 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-sm bg-zinc-900 p-2 text-fg">
            <Mail className="size-4" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-fg">Smart alert digest</h3>
            <p className="text-xs text-fg-subtle mt-1">
              When daily digest is on, non-critical alerts are batched into a single summary
              instead of interrupting you one-by-one.
            </p>
          </div>
          <Switch
            checked={config.dailyDigestMode}
            onCheckedChange={(v) => update({ dailyDigestMode: v })}
            srLabel="Toggle daily digest mode"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-fg-subtle">
          <div className="flex items-center gap-1.5">
            <Info className="size-3.5" />
            <span>Info & warning batched</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Smartphone className="size-3.5" />
            <span>Critical still instant</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Bell className="size-3.5" />
            <span>Sent once per day</span>
          </div>
        </div>
      </div>

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
          aria-label="Quiet hours start time"
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
          aria-label="Quiet hours end time"
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
                  ? 'bg-fg text-white'
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
                    ? 'bg-fg text-white'
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
          aria-label="Cooldown in seconds"
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
          aria-label="Dedup window in seconds"
          className="ml-6 w-32 rounded border border-border bg-surface px-2 py-1 text-sm text-fg"
        />
      </div>

    </section>
  );
}