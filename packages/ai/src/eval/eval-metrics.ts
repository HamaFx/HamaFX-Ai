/**
 * Copyright 2026 Kestrel
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

// Eval result metrics — turn a nightly eval run into Grafana-queryable SLI
// series. A case counts as "ok" only when transport succeeded AND every
// assertion passed, matching the runner's exit-code contract (non-zero on
// any transport failure or assertion failure). The `result` tag makes the
// pass rate computable as a ratio SLO: `eval_case_total{result="ok"}` ÷ total.

import { metrics } from '@kestrel/shared';

import type { PromptResult } from './runner';

/** A case passes when it transported successfully and had no assertion failures. */
export function isEvalCaseOk(result: PromptResult): boolean {
  return result.ok && (result.assertions?.length ?? 0) === 0;
}

/**
 * Emit one `eval_case_total{result=…}` counter per case into the process-wide
 * registry. Callers flush the registry to Grafana via `flushMetrics()`.
 */
export function emitEvalMetrics(results: readonly PromptResult[]): void {
  for (const result of results) {
    metrics.increment('eval_case_total', { tags: { result: isEvalCaseOk(result) ? 'ok' : 'fail' } });
  }
}
