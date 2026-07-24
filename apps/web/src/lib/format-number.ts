// SPDX-License-Identifier: Apache-2.0

// Formatting helpers for admin dashboard.
//
// Tabular-nums is applied at the parent level via the `tabular-nums`
// Tailwind class; these helpers just produce readable strings.

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Format a duration in ms as a human-readable string. ≥1000ms → "1.2s". */
export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

/** Format a number with thousands separators. */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Format an ISO timestamp as a relative "5m ago" / "2h ago" / "3d ago"
 * label. Falls back to a short absolute date for timestamps older than
 * 30 days.
 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = now - t;
  if (diffMs < 0) return 'just now';
  if (diffMs < MINUTE) return `${Math.floor(diffMs / SECOND)}s ago`;
  const m = Math.floor(diffMs / MINUTE);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Full absolute time for tooltips. */
export function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * CSV export helper: converts an array of objects to a downloadable CSV blob
 * and triggers a browser download.
 */
export function downloadCSV(rows: Record<string, unknown>[], filename: string): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);
  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const v = row[h];
          if (v === null || v === undefined) return '';
          const s = String(v);
          // Quote fields containing commas, quotes, or newlines.
          return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
