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

// PF-08 — Specification pattern for alert rule evaluation.
//
// Replaces inline condition logic (decideMatch / decideCross) with
// composable specification objects. Adding a new alert condition type
// means adding a new spec class — the evaluator code stays unchanged.
//
// Usage:
//   const spec = AlertSpec.fromRule(rule);
//   const fired = spec.isSatisfiedBy({ value: 1.08, source: 'live' });
//
// Composite specs:
//   const combined = new AndSpec([spec1, spec2]);

import type { AlertRule } from '@hamafx/shared';

// ── Core types ─────────────────────────────────────────────────────────────

/** A reading that can be tested against a specification. */
export interface RuleReading {
  value: number;
  source: string;
}

/** A previous reading for crossing detection (indicatorCross). */
export interface CrossContext {
  previousValue: number | null | undefined;
}

/**
 * PF-08 — Contract for alert rule specifications.
 *
 * Each spec encapsulates a single condition. Composable via
 * `AndSpec` / `OrSpec` for compound rules.
 *
 * @example
 * ```ts
 * const spec = new PriceCrossSpec('above', 1.10);
 * if (spec.isSatisfiedBy({ value: 1.105, source: 'live' })) {
 *   // trigger delivery
 * }
 * ```
 */
export interface AlertSpec {
  /** Human-readable label for telemetry / logs. */
  readonly name: string;

  /**
   * Returns true when the reading satisfies this specification.
   * For crossing specs (`indicatorCross`), pass the previous value
   * via `cross` context so the spec can detect transitions.
   */
  isSatisfiedBy(reading: RuleReading, cross?: CrossContext): boolean;
}

// ── Concrete specs ─────────────────────────────────────────────────────────

/** Fires when `value >= level` (above) or `value <= level` (below). */
export class LevelSpec implements AlertSpec {
  readonly name = 'level';

  constructor(
    private readonly direction: 'above' | 'below',
    private readonly level: number,
  ) {}

  isSatisfiedBy(reading: RuleReading): boolean {
    return this.direction === 'above'
      ? reading.value >= this.level
      : reading.value <= this.level;
  }
}

/**
 * Fires when the value *transitions* through a level.
 * On the first tick (no `previousValue`) always returns false —
 * the caller is expected to seed `previousValue` and re-check
 * on the next tick.
 */
export class CrossingSpec implements AlertSpec {
  readonly name = 'crossing';

  constructor(
    private readonly direction: 'above' | 'below',
    private readonly level: number,
  ) {}

  isSatisfiedBy(reading: RuleReading, cross?: CrossContext): boolean {
    const prev = cross?.previousValue;
    if (prev === null || prev === undefined) return false;
    return this.direction === 'above'
      ? prev < this.level && reading.value >= this.level
      : prev > this.level && reading.value <= this.level;
  }
}

// ── Composite specs ────────────────────────────────────────────────────────

/** All child specs must be satisfied (logical AND). */
export class AndSpec implements AlertSpec {
  name: string;

  constructor(private readonly specs: AlertSpec[]) {
    this.name = `and(${this.specs.map((s) => s.name).join(',')})`;
  }

  isSatisfiedBy(reading: RuleReading, cross?: CrossContext): boolean {
    for (const spec of this.specs) {
      if (!spec.isSatisfiedBy(reading, cross)) return false;
    }
    return true;
  }
}

/** Any child spec must be satisfied (logical OR). */
export class OrSpec implements AlertSpec {
  name: string;

  constructor(private readonly specs: AlertSpec[]) {
    this.name = `or(${this.specs.map((s) => s.name).join(',')})`;
  }

  isSatisfiedBy(reading: RuleReading, cross?: CrossContext): boolean {
    for (const spec of this.specs) {
      if (spec.isSatisfiedBy(reading, cross)) return true;
    }
    return false;
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Create an AlertSpec from an `AlertRule` object.
 *
 * This is the primary entry point for converting persisted rules into
 * evaluable specifications. The factory encapsulates the mapping from
 * rule type → spec class, keeping the evaluator free of conditionals.
 *
 * @example
 * ```ts
 * const spec = AlertSpec.fromRule(alert.rule);
 * if (spec.isSatisfiedBy(reading, { previousValue: rule.previousValue })) {
 *   await deliverAlert(...);
 * }
 * ```
 */
// ── Backward-compatible re-exports ──────────────────────────────────────────

/**
 * PF-08 — Legacy function. Use `new LevelSpec(direction, level)` instead.
 * Kept for backward compatibility with tests and external consumers.
 */
export function decideMatch(
  direction: 'above' | 'below',
  value: number,
  level: number,
): boolean {
  return new LevelSpec(direction, level).isSatisfiedBy({ value, source: 'compat' });
}

/**
 * PF-08 — Legacy function. Use `new CrossingSpec(direction, level)` instead.
 * Kept for backward compatibility with tests and external consumers.
 */
export function decideCross(
  direction: 'above' | 'below',
  prev: number | null | undefined,
  curr: number,
  level: number,
): boolean {
  if (prev === null || prev === undefined) return false;
  return new CrossingSpec(direction, level).isSatisfiedBy(
    { value: curr, source: 'compat' },
    { previousValue: prev },
  );
}

export function specFromRule(rule: AlertRule): AlertSpec {
  switch (rule.type) {
    case 'priceCross':
    case 'candleClose':
      return new LevelSpec(rule.direction, rule.level);
    case 'indicatorCross':
      return new CrossingSpec(rule.direction, rule.level);
  }
}
