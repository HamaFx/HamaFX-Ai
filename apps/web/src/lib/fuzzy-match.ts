// SPDX-License-Identifier: Apache-2.0

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
    if (target.length === 0) {
      return { score: -1, indices: [] };
    }
    return { score: 0, indices: [] };
  }

  if (target.length === 0) {
    return { score: -1, indices: [] };
  }

  const q = normalize(query);
  const t = normalize(target);

  // Greedy walk to find indices and check if it matches
  const indices: number[] = [];
  let qIdx = 0;
  let prevMatched = false;
  let walkScore = 0;

  for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx += 1) {
    if (t[tIdx] !== q[qIdx]) {
      prevMatched = false;
      continue;
    }
    indices.push(tIdx);
    qIdx += 1;
    if (prevMatched) {
      walkScore += 50;
    }
    walkScore += 10;
    prevMatched = true;
  }

  if (qIdx !== q.length) {
    return null;
  }

  // Determine final score based on match type
  let score = 0;
  if (q === t) {
    score = 1000;
  } else if (t.startsWith(q)) {
    score = 500;
  } else if (t.includes(q)) {
    const startIdx = t.indexOf(q);
    const atWordStart = startIdx === 0 || /[\s/_\-:]/.test(t[startIdx - 1] ?? '');
    score = 250 + (atWordStart ? 50 : 0);
  } else {
    score = walkScore;
  }

  // Tie-breaker: shorter targets win
  score -= target.length;

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
