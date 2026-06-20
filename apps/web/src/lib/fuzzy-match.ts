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
 * Tiny case-insensitive fuzzy matcher for the cmd-K command palette.
 *
 * Phase B — UX_UPGRADE_PLAN.md item 11.
 *
 * Design:
 *   - No new deps (cmdk / fuse.js would add bundle weight for what is
 *     fundamentally a substring matcher over ~30 commands).
 *   - Deterministic, pure, and tested. The palette ranks results by
 *     a simple scoring scheme:
 *
 *     score = 0
 *     if target starts with query                → +1000
 *     if target contains query at a word start   → +500
 *     if target contains query (anywhere)        → +100
 *     bonus for every consecutive match          → +50 each
 *
 *   - When query is empty, every non-empty target scores 1 (so the
 *     caller can sort by `score` desc and still preserve the
 *     declared order).
 *   - Returns null when the query has no characters in common with
 *     the target. The caller filters nulls out before sorting.
 *
 *   - Diacritics and case are stripped from both sides via the same
 *     lowercased + NFD-folded form, so "Resume" matches "resume".
 */

export interface FuzzyMatch {
  /** Higher score = better match. 0 means "no characters in common". */
  score: number;
  /**
   * Indices into `target` for the matched query characters.
   * Useful for highlighting matches in the UI.
   */
  indices: number[];
}

/**
 * Lowercase + fold diacritics. "Café" → "cafe".
 */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (query.length === 0) {
    // Empty query matches everything with a baseline score. We use 1
    // so the caller can sort by score and keep the original order
    // (stable sort is assumed).
    return target.length > 0 ? { score: 1, indices: [] } : null;
  }

  const q = normalize(query);
  const t = normalize(target);

  // Greedy walk over the target. We record an index every time a
  // query character matches a target character. Score bonuses fire
  // when a match happens at a word boundary or right after the
  // previous match (consecutive).
  const indices: number[] = [];
  let score = 0;
  let qIdx = 0;
  let prevMatched = false;
  let lastWasBoundary = false;
  let consecutive = 0;

  for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx += 1) {
    if (t[tIdx] !== q[qIdx]) {
      prevMatched = false;
      lastWasBoundary = false;
      continue;
    }
    indices.push(tIdx);
    qIdx += 1;
    const atWordStart = tIdx === 0 || /[\s/_\-:]/.test(t[tIdx - 1] ?? '');
    if (atWordStart) score += 500;
    if (lastWasBoundary) score += 50;
    if (prevMatched) consecutive += 1;
    score += prevMatched ? 50 : 100;
    prevMatched = true;
    lastWasBoundary = atWordStart;
  }

  // Prefix bonus (only if the query fully matched).
  if (qIdx === q.length) {
    if (t.startsWith(q)) score += 1000;
    // Tie-breaker: shorter targets win. Negative so shorter = larger.
    score -= target.length;
  } else {
    // Query not fully consumed → no match.
    return null;
  }

  void consecutive; // reserved for future tighter scoring
  return { score, indices };
}

/**
 * Rank a list of items by query. Returns the input order filtered
 * to matches only, sorted by descending score. Stable sort.
 *
 * The matcher returns indices into `item.label`. Items whose label
 * is the empty string are skipped (defensive).
 */
export function rankByQuery<T extends { label: string }>(
  query: string,
  items: readonly T[],
): Array<{ item: T; match: FuzzyMatch }> {
  const out: Array<{ item: T; match: FuzzyMatch }> = [];
  for (const item of items) {
    if (item.label.length === 0) continue;
    const m = fuzzyMatch(query, item.label);
    if (m) out.push({ item, match: m });
  }
  out.sort((a, b) => b.match.score - a.match.score);
  return out;
}
