'use client';

// Re-renders the relative timestamp every 30s so "Latest: 2m ago" stays
// accurate without forcing a page refresh.

import { useEffect, useState } from 'react';

interface LiveTimestampProps {
  ms: number;
  /** Optional prefix label like "Latest:". */
  prefix?: string;
  className?: string;
}

export function LiveTimestamp({ ms, prefix, className }: LiveTimestampProps) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((v) => v + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className={className}>
      {prefix ? `${prefix} ` : null}
      {formatRelative(ms)}
    </span>
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
