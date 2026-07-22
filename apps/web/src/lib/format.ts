// SPDX-License-Identifier: Apache-2.0

export function formatRelative(timestamp: number | string | Date, now: number = Date.now()): string {
  const t = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = now - t;
  if (diffMs < 0) return 'just now';
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  if (diffMs < 7 * 86_400_000) return `${Math.floor(diffMs / 86_400_000)}d ago`;
  if (diffMs < 30 * 86_400_000) return `${Math.floor(diffMs / (7 * 86_400_000))}w ago`;
  return new Date(t).toLocaleDateString();
}
