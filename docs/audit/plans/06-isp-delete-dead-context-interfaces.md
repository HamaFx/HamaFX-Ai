# Plan 06 — Delete the Unused Segregated Agent-Context Interfaces

**Covers finding:** ISP-1 (see `docs/audit/solid-findings.md`).
**Package:** `packages/ai` (`src/multi-agent/types.ts`).
**Est. blast radius:** tiny — delete dead code + a misleading comment. No runtime
change.

> This is the **delete-only** direction. We are **not** retrofitting agents to
> compose context slices (that would be ceremony with no payoff — see the
> "What NOT to change" section and §7 of the findings).

---

## 1. The problem (with citations)

`packages/ai/src/multi-agent/types.ts:65-101` defines four "focused" context
interfaces — `AgentBaseContext`, `AgentDataContext`, `AgentConfigContext`,
`AgentIOContext` — with a comment claiming: *"Each agent declares which context
slices it needs via composition (e.g. `TechnicalAgentContext extends
AgentBaseContext, AgentDataContext, AgentIOContext`)."*

But a repo-wide search shows **zero** usages of those slice interfaces (or
`TechnicalAgentContext`) anywhere except their own definition. Every consumer
takes the full `SharedContext`:
- `base-agent.ts:54` (`resolveModel(ctx: SharedContext)`),
- `base-agent.ts:74` (`run(ctx: SharedContext)`),
- `decision-agent.ts:80` (`ctx: SharedContext`).

This is "ISP theater": abstraction created for its own sake, plus a comment that
misleads the next contributor into thinking a per-agent composition constraint
exists when it doesn't.

---

## 2. Target design (minimal)

Keep the one interface that is actually used — `SharedContext` — and define it
directly. Delete the four unused slice interfaces and the aspirational comment.

```ts
// packages/ai/src/multi-agent/types.ts
export interface SharedContext {
  // identity
  symbol: string;
  threadId: string;
  userId: string;
  // data
  snapshot: LiveSnapshot;
  prefetchedData?: string;
  // config
  userSettings: UserSettingsRow;
  customInstructions?: string;
  // io
  userMessage: UIMessage;
  history: UIMessage[];
  signal: AbortSignal | null;
  env: MultiAgentEnv;
}
```

(Field set is exactly the union of the current four slices — no fields added or
removed.)

---

## 3. Implementation sequence

1. **Confirm dead code** (guard against a late-added usage):
   `grep -rn "AgentBaseContext\|AgentDataContext\|AgentConfigContext\|AgentIOContext\|TechnicalAgentContext" packages apps --include=*.ts`
   — expect matches only in `types.ts`. If any real usage appears, **stop** and
   escalate (the finding's premise changed).
2. **Inline `SharedContext`** in `types.ts:65-101`: replace the four
   `export interface Agent*Context {…}` blocks + the `SharedContext extends …`
   composition with the single flat `SharedContext` above. Delete the misleading
   "P1-2 … ISP compliance / composition" comment.
3. **Keep exports stable:** `SharedContext`, `AgentName`, `AgentBias`,
   `AgentOpinion`, `MultiAgentEnv`, mode types — all unchanged.
4. **Compile.** No consumer imported the deleted interfaces, so no call-site edits
   are expected.

---

## 4. What NOT to change (scope boundary)

- **Do not** change `SharedContext`'s field set, names, or optionality — it must
  stay structurally identical so every existing consumer compiles untouched.
- **Do not** retrofit agents to accept narrow slices (`run(ctx: AgentBaseContext &
  AgentIOContext)` etc.) — that is the expensive, low-value direction we are
  explicitly rejecting.
- **Do not** touch `ToolContext` (`tool-context.ts:64`) — it is a deliberate
  pragmatic ambient context (see findings §7), out of scope.
- **Do not** modify any agent file, the orchestrator, or tests beyond what a
  type-only deletion forces (ideally nothing).

---

## 5. Verification

- **Typecheck:** `pnpm --filter @hamafx/ai typecheck` — must pass with no
  call-site changes (proves the interfaces were truly dead).
- **Tests:** `pnpm --filter @hamafx/ai test` — green, unchanged.
- **Grep gate:** the step-1 grep now returns matches only for `SharedContext`
  (the four slice names are gone).
- **Diff review:** `git diff packages/ai/src/multi-agent/types.ts` shows only the
  interface consolidation + comment removal; no other files changed.
