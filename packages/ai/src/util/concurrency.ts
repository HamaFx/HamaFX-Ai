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

// PERF-5 — lightweight concurrency limiter (~15 lines, no dependency).
// Caps how many async operations run simultaneously.

export function limitConcurrency(concurrency: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    running--;
    const task = queue.shift();
    if (task) task();
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        running++;
        fn().then(
          (val) => {
            resolve(val);
            next();
          },
          (err) => {
            reject(err);
            next();
          },
        );
      };

      if (running < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}
