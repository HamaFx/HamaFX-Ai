// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import type * as LightweightCharts from 'lightweight-charts';

let lcPromise: Promise<typeof LightweightCharts> | null = null;
// STAB-09: Track the last import error so components can show a
// retry UI instead of being stuck in a permanent loading state.
let _lastLcError: unknown = null;

export function useLightweightCharts() {
  const [lc, setLc] = useState<typeof LightweightCharts | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!lcPromise) {
      lcPromise = import('lightweight-charts').catch((err) => {
        lcPromise = null;
        _lastLcError = err;
        throw err;
      });
    }
    let active = true;
    lcPromise.then((module) => {
      if (active) {
        setLc(module);
        setError(null);
      }
    }).catch((err) => {
      // STAB-09: Surface the error so components can show a retry button
      // instead of being stuck in a permanent loading state.
      if (active) setError(err);
    });
    return () => {
      active = false;
    };
  }, []);

  // STAB-09: Expose error state so components can show an error
  // message instead of being stuck in a permanent loading state.
  // The module re-imports on next mount (navigation), so no explicit
  // retry function is needed — the component remount handles it.
  return { lc, error };
}
