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

// P1-3 — Plugin-based alert rule type registry.
//
// Replaces the three switch(rule.type) statements in spec.ts,
// evaluator.ts, and set-alert.ts with a single registry.
// Adding a new alert rule type now means registering it here —
// no existing code changes (OCP).
//
// Pattern mirrors ToolRegistry (packages/ai/src/tools/registry.ts)
// and IndicatorRegistry (packages/indicators/src/indicator-registry.ts).

import type { AlertRule, Symbol, Timeframe } from '@hamafx/shared';
import { LevelSpec, CrossingSpec, type AlertSpec } from './spec';

// --- Plugin definition --------------------------------------------------

/** Factory that creates an AlertSpec from a rule for evaluation. */
export type SpecFactory = (rule: AlertRule) => AlertSpec;

/** Formatter that produces a human-readable label for a rule. */
export type RuleDescriber = (rule: AlertRule) => string;

/** Metadata about a registered alert rule type. */
export interface AlertRuleTypePlugin {
  /** The rule type discriminator (e.g. 'priceCross', 'candleClose', 'indicatorCross'). */
  type: AlertRule['type'];
  /** Factory: rule → evaluable AlertSpec. */
  specFactory: SpecFactory;
  /** Human-readable label for this rule (e.g. "XAUUSD price above 2650"). */
  describe: RuleDescriber;
  /** Short label for catalogues / documentation. */
  label: string;
}

// --- Registry ------------------------------------------------------------

/**
 * Plugin-based alert rule type registry.
 *
 * OCP benefit: adding a rule type means registering it here —
 * no switch statements to update in spec.ts, evaluator.ts, or set-alert.ts.
 */
export class AlertRuleRegistry {
  private plugins = new Map<AlertRule['type'], AlertRuleTypePlugin>();

  register(plugin: AlertRuleTypePlugin): void {
    this.plugins.set(plugin.type, plugin);
  }

  get(type: AlertRule['type']): AlertRuleTypePlugin {
    const plugin = this.plugins.get(type);
    if (!plugin) {
      throw new Error(
        `Unknown alert rule type: "${type}". Registered types: ${this.listTypes().join(', ')}. ` +
        `Add it via alertRuleRegistry.register().`,
      );
    }
    return plugin;
  }

  has(type: AlertRule['type']): boolean {
    return this.plugins.has(type);
  }

  listTypes(): AlertRule['type'][] {
    return [...this.plugins.keys()];
  }
}

/** Global singleton. */
export const alertRuleRegistry = new AlertRuleRegistry();

// --- Registration (self-contained) --------------------------------------
//
// All alert rule types register themselves here. Adding a new type
// means adding a registration entry — no switch statement changes.

// priceCross — fires when live mid crosses a price level.
alertRuleRegistry.register({
  type: 'priceCross',
  label: 'Price Cross',
  specFactory: (rule) => new LevelSpec(rule.direction, rule.level),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  describe: (rule: any) => `${rule.symbol} price ${rule.direction} ${rule.level}`,
});

// candleClose — fires when the most recent closed candle's close crosses a level.
alertRuleRegistry.register({
  type: 'candleClose',
  label: 'Candle Close',
  specFactory: (rule) => new LevelSpec(rule.direction, rule.level),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  describe: (rule: any) => `${rule.symbol} ${rule.tf} close ${rule.direction} ${rule.level}`,
});

// indicatorCross — fires when an indicator value transitions through a level
// (true crossing semantics, not level semantics).
alertRuleRegistry.register({
  type: 'indicatorCross',
  label: 'Indicator Cross',
  specFactory: (rule) => new CrossingSpec(rule.direction, rule.level),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  describe: (rule: any) => `${rule.symbol} ${rule.tf} ${rule.indicator} ${rule.direction} ${rule.level}`,
});
