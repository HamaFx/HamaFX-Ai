'use client';

// Stagger-animate child elements as they enter the page. Used by news /
// calendar / alerts / journal lists to give the page life on first paint.
//
// The stagger is applied to direct children via motion's `initial` /
// `animate` variants. Children must be ReactElements (not strings).

import { m } from 'motion/react';
import type { ReactNode } from 'react';

interface StaggerListProps {
  children: ReactNode;
  className?: string;
  /** Delay between children in seconds. Default 0.04. */
  stagger?: number;
}

const container = {
  hidden: { opacity: 0 },
  show: (stagger: number) => ({
    opacity: 1,
    transition: {
      staggerChildren: stagger,
      delayChildren: 0.05,
    },
  }),
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 360, damping: 28 },
  },
};

export function StaggerList({ children, className, stagger = 0.04 }: StaggerListProps) {
  return (
    <m.ul
      className={className}
      variants={container}
      initial="hidden"
      animate="show"
      custom={stagger}
    >
      {Array.isArray(children)
        ? children.map((child, idx) => (
            <m.li key={idx} variants={item}>
              {child}
            </m.li>
          ))
        : (
          <m.li variants={item}>{children}</m.li>
        )}
    </m.ul>
  );
}

export const STAGGER_ITEM_VARIANTS = item;
export const STAGGER_CONTAINER_VARIANTS = container;
