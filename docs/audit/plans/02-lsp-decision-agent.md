# Plan 02 — Lift `DecisionAgent` out of the `BaseAgent` Hierarchy

**Covers finding:** LSP-1 (see `docs/audit/solid-findings.md`).
**Package:** `packages/ai` (`src/multi-agent`).
**Est. blast radius:** multi-agent types + orchestrator + one contract test. No
runtime behavior change if done correctly.

---

## 1. The problem (with citations)

`DecisionAgent extends BaseAgent` (`packages/ai/src/multi-agent/agents/decision-agent.ts:30`)
but does **not** honor the base contract:

- `tools()` returns `{}` (`decision-agent.ts:69`) and `parseOutput()` is a
  degenerate keyword-sniffer (`decision-agent.ts:72`) — both are stubs, not real
  implementations of the specialist contract.
- Its real entrypoint is `fuse(opinions, ctx, execCtx, onTextChunk)`
  (`decision-agent.ts:80`), a method **not on `BaseAgent`**. The inherited
  `run(ctx)` produces meaningless output for a synthesizer (no opinions block).

Yet it is registered as a substitutable `BaseAgent`:
- `packages/ai/src/multi-agent/orchestrator.ts:44-49` —
  `AGENT_FACTORIES: Record<AgentName, () => BaseAgent>` includes
  `decision: () => new DecisionAgent()`.
- The orchestrator only works because it **manually special-cases** decision:
  specialists are created from the map and `.run()` in a loop
  (`orchestrator.ts:128,142`), while decision is constructed separately
  (`orchestrator.ts:174`) and `.fuse()`-d (`orchestrator.ts:177`).
- The contract test already documents the leak: `test/base-agent-contract.test.ts`
  header excludes DecisionAgent from the `tools()` non-empty check ("DecisionAgent
  excluded — synthesis agent with no tools").

**The `Record<AgentName, () => BaseAgent>` type lies** — a future contributor who
iterates the factory map and calls `.run()` generically will get silently-wrong
deliberation output.

---

## 2. Target design (minimal)

Separate the two roles at the **type** level without duplicating the shared
model-resolution/telemetry code:

1. Keep `BaseAgent` as the **specialist** contract (`run(ctx): AgentOpinion`).
2. Introduce a narrow `SpecialistAgentName` type = `AgentName` minus `'decision'`.
3. Type the factory map as `Record<SpecialistAgentName, () => BaseAgent>` so
   `decision` **cannot** be placed in it.
4. `DecisionAgent` **no longer extends `BaseAgent`.** It keeps `fuse()` and reuses
   the shared bits (model resolution, `safeParseJson`) by extracting them into a
   small shared helper module rather than via inheritance.

This is the smallest change that makes the type honest. No new framework, no
per-agent interface explosion.

---

## 3. Implementation sequence

1. **Extract shared helpers.** Move `resolveModel(ctx)`
   (`base-agent.ts:54-72`), `tierToDomain` (`base-agent.ts:32-38`), and
   `safeParseJson` (`base-agent.ts:118-127`) into a new
   `packages/ai/src/multi-agent/agents/agent-model.ts` as free functions
   (`resolveAgentModel(ctx, tier)`, `safeParseJson(text)`). Keep `BaseAgent`
   using them (delegate its methods to the helpers) so specialists are unchanged.
2. **Add the specialist name type.** In
   `packages/ai/src/multi-agent/types.ts`, add:
   ```ts
   export type SpecialistAgentName = Exclude<AgentName, 'decision'>;
   ```
   (Leave `AgentName` as-is; `AgentOpinion.agentName` still uses it.)
3. **De-inherit `DecisionAgent`.** In `decision-agent.ts`:
   - Change `export class DecisionAgent extends BaseAgent` →
     `export class DecisionAgent` (no `extends`).
   - Keep `name`, `modelTier`, `systemPrompt()`, and `fuse(...)`.
   - Delete the stub `tools()` and `parseOutput()` (they only existed to satisfy
     the base contract).
   - Replace the inherited `this.resolveModel(ctx)` call inside `fuse` with
     `resolveAgentModel(ctx, this.modelTier)` from the new helper.
4. **Tighten the factory map.** In `orchestrator.ts:44-49`, retype:
   ```ts
   const AGENT_FACTORIES: Record<SpecialistAgentName, () => BaseAgent> = {
     technical: () => new TechnicalAgent(),
     fundamental: () => new FundamentalAgent(),
     risk: () => new RiskAgent(),
     sentiment: () => new SentimentAgent(),
   };
   ```
   Remove the `decision:` entry. The separate `new DecisionAgent()` at
   `orchestrator.ts:174` stays exactly as-is.
5. **Fix `specialistNames` typing** if the orchestrator derives it from
   `AGENT_FACTORIES` keys — it will now correctly exclude `decision` at the type
   level (it already excludes it at runtime).

---

## 4. What NOT to change (scope boundary)

- **Do not** change the four specialist agents' behavior, prompts, or outputs.
- **Do not** change `fuse()`'s signature, streaming logic, or the
  `buildOpinionsBlock` formatting (`decision-agent.ts:145-153`).
- **Do not** alter `AgentOpinion` or `AgentName` (keep `'decision'` in
  `AgentName` — it's still used for opinion labels and timeouts
  `AGENT_TIMEOUTS`).
- **Do not** introduce a shared `Agent` interface both classes implement — that's
  more abstraction than the problem needs. A type-level exclusion is enough.
- **Do not** touch the single-agent `runChat` path in `agent.ts`.

---

## 5. Verification

- **Typecheck:** `pnpm --filter @hamafx/ai typecheck`. The retyped
  `AGENT_FACTORIES` must reject a `decision` entry (compile error if re-added) —
  this is the LSP guardrail. Confirm the whole package still compiles.
- **Contract test:** update `packages/ai/test/base-agent-contract.test.ts` to
  remove `DecisionAgent` from `ALL_AGENTS` (it is no longer a `BaseAgent`); add a
  small separate assertion that `DecisionAgent` exposes `fuse` and a non-empty
  `systemPrompt()`. Run `pnpm --filter @hamafx/ai test test/base-agent-contract.test.ts`.
- **Multi-agent tests:** `pnpm --filter @hamafx/ai test test/multi-agent` — must
  all pass unchanged, especially `multi-agent/fusion.test.ts` (exercises `fuse`)
  and `multi-agent/agents/agents.test.ts`.
- **Manual check:** run a `full`-mode multi-agent turn; confirm specialists emit
  opinions and the decision agent synthesizes the final streamed response exactly
  as before (no behavioral diff — this is a structural refactor).
- **Grep gate:** `grep -n "decision:.*DecisionAgent" packages/ai/src/multi-agent/orchestrator.ts`
  returns nothing (decision no longer in the specialist factory map).
