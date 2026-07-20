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

// PF-02 — Tool plugin registry barrel.
// PF-13 — Tools are now registered via category sub-files (market, analysis, journal, system).
// All 32 tools register themselves via the singleton `toolRegistry`.
//
// Adding a new tool: implement it in a sibling file, add a register()
// call to the appropriate category file, and add its import + entry there.
// No other file needs to change.
//
// Keep names in sync with `@hamafx/shared` TOOL_NAMES.
//
// Phase 3 hardening §2 — every tool flows through `withTelemetry()`
// (applied automatically by the registry), so each invocation produces
// exactly one `chat_tool_telemetry` row and the per-turn AbortSignal is
// piped through to the tool's `execute`.

// Category imports trigger self-registration via the singleton toolRegistry.
// Import order doesn't matter — registration is order-independent.
import './market';
import './analysis';
import './journal';
import './system';

// Re-export the registry singleton so consumers (agent.ts, catalogue.ts)
// can resolve tools by name without importing individual tool files.
export { toolRegistry } from './registry';

// Re-export the ToolRegistry class type for consumers that need to
// reference the type (e.g., by-domain.ts).
export type { ToolRegistry } from './registry';
