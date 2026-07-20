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

// PF-02 — Tool Plugin Registry.
//
// Replaces the flat `tools` object in `tools/index.ts`. Each tool
// registers itself by name through the singleton, and consumers
// resolve tools by calling `resolve(names?)`. The registry is the
// single source of truth for which tools are available, their
// descriptions (for the catalogue), and per-tenant gating (PF-16).
//
// OCP benefit: adding a tool means registering it — no existing
// code changes. SRP benefit: agent.ts no longer wires tools.
// Extensibility benefit: resolve(names) enables per-tenant gating.

import type { Tool } from 'ai';
import { withTelemetry } from './with-telemetry';

/**
 * ToolPlugin — metadata about a registered tool.
 * Stored alongside the tool for use by the catalogue, telemetry,
 * and per-tenant gating.
 */
export interface ToolPlugin {
  /** Unique tool name (snake_case, e.g. 'get_price'). */
  name: string;
  /** The AI SDK Tool instance (already wrapped with telemetry). */
  tool: Tool;
  /** Human-readable description (mirrors the tool's .description). */
  description: string;
  /**
   * PF-16 — optional list of plan tiers this tool is available to.
   * `undefined` = available to all plans (default).
   * `['free', 'pro']` = restricted to listed plans.
   * Empty array = admin-only internal tool.
   */
  allowedPlans?: string[] | undefined;
}

/**
 * Plugin-based tool registry.
 *
 * Usage:
 * ```ts
 * import { toolRegistry } from './registry';
 *
 * // In a tool file (self-registration):
 * toolRegistry.register('get_price', getPriceTool);
 *
 * // In agent.ts (resolution):
 * const tools = toolRegistry.resolve(plan.allowedTools);
 * ```
 */
export class ToolRegistry {
  private tools = new Map<string, ToolPlugin>();

  /**
   * Register a tool by name. Automatically wraps it with
   * telemetry instrumentation. Idempotent — registering the
   * same name twice overwrites.
   */
  register(name: string, tool: Tool, options?: { allowedPlans?: string[] }): void {
    this.tools.set(name, {
      name,
      tool: withTelemetry(name, tool),
      description: (tool as { description?: string }).description ?? '(no description)',
      ...(options?.allowedPlans ? { allowedPlans: options.allowedPlans } : {}),
    });
  }

  /**
   * Resolve tools by name(s).
   *
   * - `undefined` or no args: returns ALL registered tools.
   * - string array: returns only the named tools that exist
   *   (unknown names are silently dropped).
   *
   * Returns a plain `Record<string, Tool>` suitable for passing
   * directly to `streamText({ tools })`.
   */
  resolve(names?: string[]): Record<string, Tool> {
    if (!names) {
      return Object.fromEntries(
        [...this.tools.entries()].map(([name, plugin]) => [name, plugin.tool]),
      );
    }
    return Object.fromEntries(
      names
        .filter((n) => this.tools.has(n))
        .map((n) => [n, this.tools.get(n)!.tool]),
    );
  }

  /**
   * PF-16 — Resolve tools gated by plan tier.
   * free-tier users see free tools only; pro-tier users see everything.
   * Falls back to resolve(names) when plan is undefined.
   */
  resolveForPlan(names: string[] | undefined, plan?: string): Record<string, Tool> {
    if (!plan) return this.resolve(names);

    const source = names ? this.resolve(names) : this.resolve();
    if (plan !== 'free') return source;

    // Free tier: filter to tools with no plan restriction or with 'free' in allowedPlans.
    const filtered: Record<string, Tool> = {};
    for (const [name, tool] of Object.entries(source)) {
      const plugin = this.tools.get(name);
      if (!plugin?.allowedPlans || plugin.allowedPlans.includes('free')) {
        filtered[name] = tool;
      }
    }
    return filtered;
  }

  /**
   * Get metadata for a specific tool. Returns undefined if not registered.
   */
  getPlugin(name: string): ToolPlugin | undefined {
    return this.tools.get(name);
  }

  /**
   * Return all registered tool names.
   */
  listNames(): string[] {
    return [...this.tools.keys()];
  }

  /**
   * Return all registered plugins.
   */
  listPlugins(): ToolPlugin[] {
    return [...this.tools.values()];
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}

/** Global singleton — import this in tool files to register. */
export const toolRegistry = new ToolRegistry();
