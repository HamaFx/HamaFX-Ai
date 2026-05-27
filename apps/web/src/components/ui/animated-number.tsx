'use client';

// Animated number — smooth spring tween between values. Used for live
// price updates so the eye catches the move without a hard re-render.

import { m, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  className?: string;
}

export function AnimatedNumber({ value, decimals = 2, className }: AnimatedNumberProps) {
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, { stiffness: 100, damping: 30 });
  const display = useTransform(spring, (v) => v.toFixed(decimals));

  useEffect(() => {
    motionValue.set(value);
  }, [motionValue, value]);

  return <m.span className={className}>{display}</m.span>;
}
