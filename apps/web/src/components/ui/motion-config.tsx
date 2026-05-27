'use client';

// Motion (formerly framer-motion) root provider.
//
// LazyMotion + domAnimation = ~25KB gz, vs the full bundle ~40KB. We use
// `m` instead of `motion` everywhere to take advantage of the lazy load.
//
// `reducedMotion="user"` automatically respects the user's OS-level
// prefers-reduced-motion setting and skips animations to their final state.

import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';

interface MotionRootProps {
  children: ReactNode;
}

export function MotionRoot({ children }: MotionRootProps) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        reducedMotion="user"
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
