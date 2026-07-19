'use client';

import { useEffect, useRef, useState } from 'react';
import type { Symbol, Tick } from '@hamafx/shared';

interface PriceStreamState {
  ticks: Tick[];
  connected: boolean;
  error: string | null;
}

export function usePriceStream(symbols: readonly Symbol[]) {
  const [state, setState] = useState<PriceStreamState>({
    ticks: [],
    connected: false,
    error: null,
  });
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attemptRef = useRef(0);
  const reconnectingRef = useRef(false); // STAB-04: guard against concurrent reconnect loops
  const MAX_RECONNECT = 8;

  useEffect(() => {
    if (symbols.length === 0) return;

    const key = [...symbols].sort().join(',');
    let closed = false;

    function connect() {
      if (closed) return;
      reconnectingRef.current = false; // Reset guard on successful connect attempt
      const es = new EventSource(`/api/market/stream?symbol=${key}`);
      esRef.current = es;

      es.onopen = () => {
        if (!closed) {
          attemptRef.current = 0; // Reset reconnect counter on success
          setState((prev) => ({ ...prev, connected: true, error: null }));
        }
      };

      es.onmessage = (event) => {
        if (closed) return;
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            setState((prev) => ({ ...prev, error: data.error }));
            return;
          }
          setState((prev) => ({
            ...prev,
            ticks: data.ticks as Tick[],
            connected: true,
            error: null,
          }));
        } catch {
          // ignore malformed messages
        }
      };

      es.onerror = () => {
        es.close();
        if (!closed) {
          attemptRef.current += 1;
          if (attemptRef.current > MAX_RECONNECT) {
            setState((prev) => ({ ...prev, connected: false, error: 'Connection lost after max retries' }));
            reconnectingRef.current = false;
            return;
          }
          // STAB-04: Prevent concurrent reconnect loops.
          // If rapid onerror events fire before the first reconnect timer,
          // skip scheduling additional timers to avoid exponential blow-up.
          if (reconnectingRef.current) return;
          reconnectingRef.current = true;
          setState((prev) => ({ ...prev, connected: false, error: 'Connection lost' }));
          // Exponential backoff: 3s, 6s, 12s, 24s... capped at 30s
          const delay = Math.min(3_000 * Math.pow(2, attemptRef.current - 1), 30_000);
          // STAB-04: Clear any existing reconnect timer before setting a new one.
          if (reconnectRef.current !== undefined) clearTimeout(reconnectRef.current);
          reconnectRef.current = setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectRef.current);
      esRef.current?.close();
    };
  }, [symbols]);

  return state;
}
