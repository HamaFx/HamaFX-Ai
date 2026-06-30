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

  useEffect(() => {
    if (symbols.length === 0) return;

    const key = [...symbols].sort().join(',');
    let closed = false;

    function connect() {
      if (closed) return;
      const es = new EventSource(`/api/market/stream?symbol=${key}`);
      esRef.current = es;

      es.onopen = () => {
        if (!closed) setState((prev) => ({ ...prev, connected: true, error: null }));
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
          setState((prev) => ({ ...prev, connected: false, error: 'Connection lost' }));
          reconnectRef.current = setTimeout(connect, 3_000);
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
