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

// Shared ticking clock for the whole app. Updates every 30s — enough for
// relative timestamps and countdowns without per-component intervals.
// Also exposes a reduced-motion flag for motion-sensitive components.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { formatRelative } from '@/lib/format';

interface TimeContextValue {
  now: number;
  formatRelative: (ts: number) => string;
}

const TimeContext = createContext<TimeContextValue | null>(null);

const ReducedMotionContext = createContext<boolean>(false);

export function TimeProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const checkMotion = () => {
      const isForced =
        document.documentElement.dataset.reduceMotion === 'force';
      setReducedMotion(mq.matches || isForced);
    };
    checkMotion();
    mq.addEventListener('change', checkMotion);
    const obs = new MutationObserver(checkMotion);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-reduce-motion'],
    });
    return () => {
      mq.removeEventListener('change', checkMotion);
      obs.disconnect();
    };
  }, []);

  const formatRelativeTs = useCallback((ts: number) => formatRelative(ts, now), [now]);

  return (
    <ReducedMotionContext.Provider value={reducedMotion}>
      <TimeContext.Provider value={{ now, formatRelative: formatRelativeTs }}>
        {children}
      </TimeContext.Provider>
    </ReducedMotionContext.Provider>
  );
}

export function useNow() {
  const ctx = useContext(TimeContext);
  if (!ctx) throw new Error('useNow must be used within TimeProvider');
  return ctx.now;
}

export function useTime() {
  const ctx = useContext(TimeContext);
  if (!ctx) throw new Error('useTime must be used within TimeProvider');
  return ctx;
}

export function useReducedMotion() {
  return useContext(ReducedMotionContext);
}
