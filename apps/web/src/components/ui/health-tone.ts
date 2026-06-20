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
 * Pure tone-decider for the per-provider status pill on
 * /settings/api-keys. Extracted from the card component so the
 * rules are unit-testable without rendering React.
 *
 * Phase D — api-keys page overhaul. The StatusPill component
 * uses this internally; the api-keys-card re-uses it for the
 * usage badge classification too.
 */

export type HealthTone = 'grey' | 'green' | 'yellow' | 'red';

/**
 * Returns the colour/tone a provider card should use, based on
 * the latest health snapshot. Rules:
 *
 *   - No snapshot (undefined)            -> 'grey'  (untested)
 *   - snapshot.ok === false              -> 'red'   (sticky: any
 *                                              failure is red
 *                                              regardless of age,
 *                                              so the user notices)
 *   - snapshot.ok === true  + <24h old    -> 'green'
 *   - snapshot.ok === true  + 24h..7d    -> 'yellow' (stale, may
 *                                              have rotated)
 *   - snapshot.ok === true  + >7d         -> 'grey'  (treat as
 *                                              unknown; old)
 *
 * The 'now' parameter is for tests; production calls leave it
 * undefined to default to Date.now().
 */
export function getHealthTone(
  health: { ok: boolean; error: string | null; testedAt: string } | undefined,
  now: number = Date.now(),
): HealthTone {
  if (!health) return 'grey';
  if (!health.ok) return 'red';
  const t = new Date(health.testedAt).getTime();
  if (!Number.isFinite(t)) return 'grey';
  const ageMs = now - t;
  if (ageMs < 0) return 'green'; // clock skew — be permissive
  const HOUR = 60 * 60 * 1000;
  if (ageMs < 24 * HOUR) return 'green';
  if (ageMs < 7 * 24 * HOUR) return 'yellow';
  return 'grey';
}

/**
 * Format a health snapshot's testedAt as a short "5m ago" / "2h ago"
 * label. Returns an empty string for unparseable timestamps so the
 * caller can decide whether to render anything.
 */
export function formatHealthAge(
  iso: string,
  now: number = Date.now(),
): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = now - t;
  if (diffMs < 60_000) return 'just now';
  const m = Math.floor(diffMs / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
