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

export function useLightweightCharts() {
  const [lc, setLc] = useState<typeof LightweightCharts | null>(null);

  useEffect(() => {
    if (!lcPromise) {
      lcPromise = import('lightweight-charts');
    }
    let active = true;
    lcPromise.then((module) => {
      if (active) setLc(module);
    });
    return () => {
      active = false;
    };
  }, []);

  return lc;
}
