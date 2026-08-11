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

/**
 * Injectable stdin/stdout pair.
 *
 * Every module in the setup wizard accepts an `io` object instead of
 * touching `process` directly. This is what makes the wizard testable:
 * tests can pass a fake stdin (an EventEmitter that also exposes
 * `setRawMode`/`resume`/`pause`) and a capture buffer for stdout.
 */

import { stdin as defaultStdin, stdout as defaultStdout } from 'node:process';

export function createIO({ stdin = defaultStdin, stdout = defaultStdout } = {}) {
  const write = (text) => stdout.write(text);
  const line = (text = '') => stdout.write(`${text}\n`);
  return {
    stdin,
    stdout,
    write,
    line,
    isTTY: Boolean(stdin.isTTY && stdout.isTTY),
  };
}
