'use client';

// Animated number — smooth spring tween between values. Used for live
// price updates so the eye catches the move without a hard re-render.
//
// Performance: the previous implementation kept a spring evaluating every
// frame indefinitely (continuous useTransform subscription on a 1.5 s
// poller = perpetual 60fps work). This version drives a single state via
// `motionValue.on('change', ...)` so React only re-renders while the
// spring is actually moving, then settles to a static string.

import { useMotionValue, useSpring } from 'motion/react';
import { useEffect, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  className?: string;
}

export function AnimatedNumber({ value, decimals = 2, className }: AnimatedNumberProps) {
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, { stiffness: 100, damping: 30 });
  const [display, setDisplay] = useState(value.toFixed(decimals));

  useEffect(() => {
    motionValue.set(value);
  }, [motionValue, value]);

  useEffect(() => {
    // Subscribe only while mounted; the callback fires until the spring
    // settles. After settle, no further work is scheduled.
    const unsubscribe = spring.on('change', (latest) => {
      setDisplay(latest.toFixed(decimals));
    });
    return unsubscribe;
  }, [spring, decimals]);

  return <span className={className}>{display}</span>;
}
