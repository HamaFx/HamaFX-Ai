'use client';

/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Animated number — smooth tween between values for live price updates.
//
// Implementation note: `useSpring`'s subscriber fires every animation
// frame for the duration of the transition. We bail out of state updates
// once the spring is within 1/(10^decimals) of the target so React
// doesn't re-render every frame for the rest of eternity.

import { useMotionValue, useSpring } from 'motion/react';
import { useEffect, useState } from 'react';

import { useReducedMotion } from '@/components/providers/time-provider';

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
  const reducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(value.toFixed(decimals));

  useEffect(() => {
    motionValue.set(value);
  }, [motionValue, value]);

  useEffect(() => {
    if (reducedMotion) {
      setDisplay(value.toFixed(decimals));
    }
  }, [value, decimals, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const unsubscribe = spring.on('change', (latest) => {
      const next = latest.toFixed(decimals);
      setDisplay((prev) => (prev === next ? prev : next));
    });
    return unsubscribe;
  }, [spring, decimals, reducedMotion]);

  return <span className={className}>{display}</span>;
}
