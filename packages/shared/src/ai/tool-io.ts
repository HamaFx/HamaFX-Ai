// Per-tool input/output type shells. Concrete schemas are wired in
// `packages/ai/src/tools/<name>.ts` once tools are implemented.

import type { ToolName } from './tool-names.js';

/**
 * Map tool name -> { input, output } types. Each tool augments this interface
 * via TS module augmentation when it lands in `packages/ai`.
 *
 * Example (from packages/ai/src/tools/get-price.ts):
 *
 *   declare module "@hamafx/shared/ai/tool-io" {
 *     interface ToolIOMap {
 *       get_price: { input: { symbols: Symbol[] }; output: Tick[] };
 *     }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ToolIOMap {}

export type ToolInput<T extends ToolName> = T extends keyof ToolIOMap
  ? ToolIOMap[T] extends { input: infer I }
    ? I
    : never
  : never;

export type ToolOutput<T extends ToolName> = T extends keyof ToolIOMap
  ? ToolIOMap[T] extends { output: infer O }
    ? O
    : never
  : never;
