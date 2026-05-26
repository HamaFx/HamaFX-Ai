# 11 — Conventions

> The point of these conventions is **not** to be opinionated for its own sake. It's to make the codebase trivially navigable for AI coding agents. If a rule doesn't help an agent (or a human) act faster and more safely, it's removed.

## TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- No `any`. Use `unknown` + zod parse at boundaries.
- No `enum`. Use string literal unions or `as const` objects.
- All public exports of a package must have explicit return types.
- Re-exports through a `src/index.ts` barrel only. No deep imports across packages.

```ts
// good
export const SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD"] as const;
export type Symbol = (typeof SYMBOLS)[number];

// bad
export enum Symbol { XAUUSD, EURUSD, GBPUSD }
```

## File & folder naming

| Kind                | Example                       |
| ------------------- | ----------------------------- |
| TS / TSX file       | `kebab-case.ts(x)`            |
| React component     | `PriceTile` exported from `price-tile.tsx` |
| Hook                | `use-prices.ts` → `usePrices()` |
| Schema              | `CandleSchema` + `Candle` (inferred) |
| Constant            | `DEFAULT_TIMEFRAME`           |
| Folder              | singular kebab-case           |

One default export per file is forbidden — use named exports for grep-friendliness, except for Next.js page/layout/route files where the framework requires defaults.

## Imports

- Always use path aliases (`@/`, `@shared/`, `@ai/`, …) — never `../../`.
- Import order, enforced by Prettier + `@ianvs/prettier-plugin-sort-imports`:
  1. Node built-ins (`node:`)
  2. Third-party
  3. Workspace packages (`@shared`, `@ai`, …)
  4. App-local aliases (`@/`)
  5. Relative (only inside the same folder, ideally just `./`)
  6. Side-effect imports last

## Components

- Function components with named exports.
- Props typed as `type FooProps = {...}` directly above the component, never `interface`.
- Avoid `React.FC`.
- One component per file (helper components live as private const inside the same file).

```tsx
type PriceTileProps = {
  symbol: Symbol;
  className?: string;
};

export function PriceTile({ symbol, className }: PriceTileProps) {
  // ...
}
```

## Tailwind

- Use `tailwind-variants` for components with multiple variants. Avoid 50-class `cn()` blobs.
- Group classes using the official ordering plugin: layout → flex/grid → spacing → sizing → typography → background → border → effects → animation.
- Never use raw color values; always semantic tokens (e.g., `bg-bg-elev-1`, `text-fg-muted`).

## Zod schemas

- Always export both the schema and the inferred type:

```ts
export const AlertRuleSchema = z.object({ /* ... */ });
export type AlertRule = z.infer<typeof AlertRuleSchema>;
```

- Validate at every boundary (UI form, API in, DB write, AI tool) using the **same** schema.

## Server code

- Route handlers: keep logic thin. Validate → call adapter → return.
- Errors throw typed `AppError`s (`packages/shared/src/errors.ts`); a single error mapper in middleware turns them into the `error` envelope.
- Never log secrets. The logger has a redaction list.

## Tests

- File naming: `<thing>.test.ts(x)` colocated, `<thing>.e2e.ts` under `apps/web/e2e/`.
- Vitest for unit + integration; Playwright for e2e.
- MSW mocks for all provider HTTP in unit tests.
- AI tools have a "tool-shape" test: input zod parses, output zod parses, given fixture inputs.
- Snapshot tests are allowed only for stable layout / structured outputs, never for free-form LLM text.

## Git workflow

- Default branch: `main`, protected.
- Feature branches: `feat/<short-slug>`, fix branches: `fix/<short-slug>`, chore: `chore/<short-slug>`, docs: `docs/<short-slug>`.
- One PR ↔ one logical change. PR title in Conventional Commits style.
- Squash-merge to `main`; never force-push to `main`.

## Conventional Commits

```
<type>(<scope>): <subject>
```

`type` ∈ `feat | fix | chore | docs | refactor | test | perf | style | ci | build`
`scope` is the affected package or area: `web`, `worker`, `ai`, `data`, `db`, `ui`, `shared`, `infra`, `docs`.

Examples:

- `feat(ai): add analyze_fundamental tool`
- `fix(data): twelve-data WS reconnect on 1006`
- `docs(architecture): update worker rationale`

## PR checklist (auto-applied template)

- [ ] Linked to an issue or roadmap item
- [ ] Schema changes in `packages/shared` reflected in tools + UI
- [ ] Migrations included if DB schema changed
- [ ] Tests added/updated
- [ ] AI eval pass rate not regressed (CI shows delta)
- [ ] Lighthouse mobile not regressed for touched routes
- [ ] No new env vars without `.env.example` entry

## Logging

- Use `pino` everywhere.
- Always include `traceId`. Use `getTrace()` helper that pulls from current async context.
- Levels: `trace`, `debug`, `info`, `warn`, `error`. Default in prod: `info`.
- Never log full LLM prompts in production by default — use `debug` and a `LOG_PROMPTS=1` env opt-in for short windows.

## Error handling

- Throw `AppError` with a stable `code`. Never throw raw strings.
- Tools that fail return a tool-result with `error: { code, message }` — they don't throw, so the model can reason about them.
- The chat UI renders errored tool parts with a quiet warning state.

## Commenting

- Prefer self-explanatory code. Comment **why**, not **what**.
- Doc comments (`/** */`) only on exported public API of packages.
- Use `// TODO(<name>):` and `// FIXME(<name>):` so we can grep ownership.

## AI-agent-specific conventions

These exist to make autonomous coding agents (Cursor / Kiro / Claude Code) work safely on this repo:

1. **Single-purpose files**. If a file owns more than one concept, split it.
2. **Stable filenames**. Don't rename without updating every doc that references the path.
3. **Predictable index barrels**. Each package exports exactly the symbols listed in its `src/index.ts` — no reaching into deep paths.
4. **Schemas before code**. Define zod schemas in `packages/shared` first, then write the code that uses them.
5. **No "magic" globals**. State is local; no `window.__APP__`, no global singletons except for the typed env object.
6. **Side-effect-free pure modules** in `packages/indicators` and `packages/data/adapters` — easy to test and easy for an agent to refactor.
7. **`docs/` is a hard contract**. If behaviour changes, update the doc in the same PR. CI fails if `docs/**` is more than 30 days older than significant code changes (advisory check).
8. **Consistent agent-readable scripts**. Every package exposes the same script names: `dev`, `build`, `lint`, `typecheck`, `test`. No package-specific verbs.
9. **`steering/` files** in `.kiro/steering/` describe per-area rules (e.g., "when adding a new tool, also add a UI part"); these are read by AI agents at task time.
10. **TODO-as-issue**. Anything more than one line of TODO becomes a GitHub issue with a `roadmap` label, linked in the comment.
