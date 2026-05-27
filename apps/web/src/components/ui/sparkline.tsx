// Minimal SVG sparkline. No chart library needed — just a path through
// normalized values. Used inside StatCard for the journal stats.
//
// Renders nothing when fewer than 2 points are available (a flat line is
// not useful information).

import { cn } from '@/lib/cn';

interface SparklineProps {
  values: readonly number[];
  className?: string;
  /** Optional override stroke; defaults to currentColor so it inherits tone. */
  stroke?: string;
}

export function Sparkline({ values, className, stroke }: SparklineProps) {
  if (values.length < 2) {
    return (
      <div
        className={cn('h-4 w-full', className)}
        aria-hidden="true"
      />
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Build path. preserveAspectRatio="none" stretches to the container.
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn('h-4 w-full', className)}
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke={stroke ?? 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
