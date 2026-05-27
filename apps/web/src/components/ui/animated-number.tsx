'use client';

// Animated number — smooth tween between values for live price updates.
//
// Implementation note: `useSpring`'s subscriber fires every animation
// frame for the duration of the transition. We bail out of state updates
// once the spring is within 1/(10^decimals) of the target so React
// doesn't re-render every frame for the rest of eternity.

import { useMotionValue, useSpring } from 'motion/react';
import { useEffect, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  className?: string;
}

export function AnimatedNumber({ value, decimals = 2, className }: AnimatedNumberProps) {
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.5 / 10 ** decimals,
  });
  const [display, setDisplay] = useState(value.toFixed(decimals));

  useEffect(() => {
    motionValue.set(value);
  }, [motionValue, value]);

  useEffect(() => {
    const unsubscribe = spring.on('change', (latest) => {
      const next = latest.toFixed(decimals);
      setDisplay((prev) => (prev === next ? prev : next));
    });
    return unsubscribe;
  }, [spring, decimals]);

  return <span className={className}>{display}</span>;
}
