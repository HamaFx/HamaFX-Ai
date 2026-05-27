'use client';

// Single stagger-animated list item. Wrap a list item to give it a small
// fade-up entrance; pass `index` so each item delays by 30ms × index.
// Cap delay at 12 to avoid 1s+ wait on long lists.

import { m } from 'motion/react';
import type { ReactNode } from 'react';

interface StaggerItemProps {
  index?: number;
  className?: string;
  children: ReactNode;
}

export function StaggerItem({ index = 0, className, children }: StaggerItemProps) {
  const delay = Math.min(index, 12) * 0.03;
  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay,
        type: 'spring',
        stiffness: 380,
        damping: 28,
      }}
      className={className}
    >
      {children}
    </m.div>
  );
}
