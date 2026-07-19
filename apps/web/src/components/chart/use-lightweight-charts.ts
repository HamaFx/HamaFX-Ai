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
