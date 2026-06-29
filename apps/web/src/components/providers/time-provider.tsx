'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const TimeContext = createContext<Date>(new Date());

const ReducedMotionContext = createContext<boolean>(false);

export function TimeProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(new Date());
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
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

  return (
    <ReducedMotionContext.Provider value={reducedMotion}>
      <TimeContext.Provider value={now}>{children}</TimeContext.Provider>
    </ReducedMotionContext.Provider>
  );
}

export function useNow() {
  return useContext(TimeContext);
}

export function useReducedMotion() {
  return useContext(ReducedMotionContext);
}
