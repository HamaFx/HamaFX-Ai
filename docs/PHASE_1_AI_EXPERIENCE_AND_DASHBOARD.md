# Phase 1 — AI Experience & Dashboard

> **For:** AI agents vibecoding the implementation. This file is your complete spec.
> **Scope:** The chat/AI surface (the product's soul) + the dashboard (currently thin).
> **No chart-page changes in this phase.**
> **Design law:** Pure-black OKLCH glass terminal. Semantic tokens only (`bg-bg-elev-1`,
> `text-fg`, `text-bull/bear/warn`, `border-divider`, `text-brand`). Zero raw Tailwind palette
> colors. Motion is functional only. Tabular-nums on all numerics. No purple gradients, no
> AI-slop decorations.

---

## Features in this phase

| # | Feature | Size | Surfaces |
|---|---------|------|----------|
| 1.1 | Cinematic multi-agent committee theater | L | `chat/parts/` |
| 1.2 | Inline mini-visuals in tool cards | M | `chat/parts/` |
| 1.3 | Trust layer on assistant messages | M | `chat/message.tsx` |
| 1.4 | Reasoning / "thinking" panel | M | `chat/` |
| 1.5 | Thread summary header | S | `chat/` |
| 1.6 | Modular customizable dashboard canvas | L | `dashboard/` |
| 1.7 | AI morning/market briefing card | M | `dashboard/` |
| 1.8 | P&L calendar heatmap | M | `dashboard/` + `journal/` |
| 1.9 | "Today at a glance" hero | S | `dashboard/` |

---

## 1.1 — Cinematic Multi-Agent Committee Theater

### Goal
Replace the flat `AgentDeliberation` pills with a **deliberation theater**: agent avatars that
activate and pulse as each completes, animated connector lines into a central "fusion" node, then a
dramatic verdict reveal with a confidence meter and dissent indicators. This is the product's #1
differentiator — make it feel like a war room.

### Current state
**File:** `apps/web/src/components/chat/parts/agent-deliberation.tsx`
- Renders flat status pills (`pending` / `running` / `done` / `error`) with raw Tailwind colors
  (`text-emerald-500`, `text-blue-500`, `text-red-500`, `text-amber-500`, `text-purple-500`,
  `bg-gray-50 dark:bg-gray-900`, `border-gray-200 dark:border-gray-800`).
- Agent opinions are in a plain `<details>` element.
- No animations, no progress visualization, no fusion/verdict reveal.

**File:** `apps/web/src/components/chat/chat-screen.tsx`
- `agentProgress` state: `{ agents: Array<{ agentName, status, opinion?, error? }>, mode: string }`
- Set via SSE events during multi-agent streaming.
- `AgentDeliberation` is rendered inside the message list when `agentProgress` is non-null.

**File:** `apps/web/src/components/chat/parts/convene-committee.tsx`
- The `convene_committee` tool part renders the final verdict: grade (A/B/C/D), goNoGo
  (go/caution/no-go), persona readings (economist, technician, risk_manager), and a summary.
- Uses semantic tokens correctly (`bg-bg-elev-1`, `text-bull`, `text-bear`, `text-warn`).

### Implementation steps

#### Step 1: Rewrite `agent-deliberation.tsx` completely

**Delete** the entire current file content and replace with a new component.

**New file:** `apps/web/src/components/chat/parts/agent-deliberation.tsx`

```
'use client';
```

This must be a client component now (needs motion + state for the theater).

**Props interface** (keep the same shape so `chat-screen.tsx` doesn't change):
```typescript
interface AgentOpinion {
  agentName: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  reasoning: string;
}
interface AgentProgress {
  agentName: string;
  status: 'pending' | 'running' | 'done' | 'error';
  opinion?: AgentOpinion;
  error?: string;
}
interface AgentDeliberationProps {
  agents: AgentProgress[];
  mode: string;
}
```

**Agent metadata** — replace raw colors with semantic tokens:
```typescript
const AGENT_META: Record<string, { icon: ReactNode; label: string; tokenClass: string; glowClass: string }> = {
  technical:   { icon: <TrendingUp className="size-4" />, label: 'Technical',   tokenClass: 'text-bull',  glowClass: 'shadow-glow-brand' },
  fundamental: { icon: <Newspaper className="size-4" />,  label: 'Fundamental', tokenClass: 'text-info',  glowClass: 'shadow-glow-accent' },
  risk:        { icon: <Shield className="size-4" />,     label: 'Risk',        tokenClass: 'text-bear',  glowClass: '' },
  sentiment:   { icon: <Bot className="size-4" />,        label: 'Sentiment',   tokenClass: 'text-warn',  glowClass: '' },
  decision:    { icon: <Brain className="size-4" />,      label: 'Decision',    tokenClass: 'text-brand', glowClass: 'shadow-glow-brand' },
};
```

**Layout — the theater (3 zones):**

**Zone 1: Agent ring** — a horizontal row of agent avatar cards.
- Each agent is a circular node (48×48px) with the agent icon centered.
- Container: `bg-bg-elev-1 border border-divider rounded-lg p-4`
- Agents are laid out in a flex row with `gap-3`, centered.
- Each node:
  - `pending`: `bg-bg-elev-2 text-fg-subtle` — dim, no animation
  - `running`: `bg-bg-elev-3 text-fg` with a pulsing ring animation. Use `m.div` with
    `animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.5, repeat: Infinity }}`.
    Add a conic-gradient border ring that rotates (CSS `@keyframes spin`) to show active processing.
    The agent's `tokenClass` color applies to the icon.
  - `done`: `bg-bg-elev-2` with the agent's `tokenClass` on the icon. A `CheckCircle2` badge
    (size-4) appears at the bottom-right corner, colored with the agent's token.
    Add a one-shot `m.div` entrance: `initial={{ scale: 0.8, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }}`
    with `transition={{ type: 'spring', stiffness: 400, damping: 25 }}`.
  - `error`: `bg-bear/10 text-bear border-bear/30` with an `AlertCircle` badge.

- Below each node, a tiny label: `text-caption text-fg-subtle font-medium` showing the agent label.

**Zone 2: Connector lines + fusion node** — only visible when ≥1 agent is `done`.
- Between the agent row and the verdict, render a set of thin SVG lines (or CSS pseudo-elements)
  from each `done` agent's position converging into a central fusion node below.
- The fusion node is a small pulsing dot (`size-2 rounded-full bg-brand`) with
  `shadow-glow-brand` that intensifies as more agents complete.
- Use `m.div` with `AnimatePresence` to animate lines appearing as each agent completes.
- If all agents are still `running` or `pending`, show a "Deliberating…" label:
  `text-caption text-fg-subtle uppercase tracking-wider` with a subtle `animate-pulse`.

**Zone 3: Verdict reveal** — when ALL agents are `done` (or `error`).
- A dramatic reveal: the fusion node expands into a verdict card.
- Use `AnimatePresence` + `m.div` with:
  ```
  initial={{ opacity: 0, scale: 0.9, y: 8 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  transition={{ type: 'spring', stiffness: 300, damping: 24 }}
  ```
- The verdict card shows:
  - **Confidence meter**: a horizontal bar (0–100%) colored by average confidence.
    <50% → `bg-bear`, 50–75% → `bg-warn`, >75% → `bg-bull`.
    Label: "Committee confidence: XX%" in `text-sm font-semibold text-fg`.
  - **Bias distribution**: three mini bars (bullish/bearish/neutral) showing how many agents
    voted each way. Use `bg-bull`, `bg-bear`, `bg-fg-muted` respectively.
  - **Dissent indicator**: if agents disagree (mix of bullish/bearish), show a small
    `AlertTriangle` icon with `text-warn` and "Mixed signals" text.
  - **Expandable opinions**: a `<details>` with `summary` styled as a button:
    `text-body-sm text-fg-muted hover:text-fg cursor-pointer`.
    Inside, each opinion is a card:
    ```
    <div className="border-l-2 border-divider pl-3 py-1.5">
      <span className="text-fg text-body-sm font-semibold">{label}</span>
      <span className={cn('ml-2 text-caption font-bold uppercase', biasToken)}>{bias}</span>
      <span className="ml-1 text-fg-subtle text-caption">{Math.round(confidence * 100)}%</span>
      <p className="text-fg-muted text-xs mt-1 leading-relaxed">{reasoning}</p>
    </div>
    ```
    `biasToken`: bullish → `text-bull`, bearish → `text-bear`, neutral → `text-fg-muted`.

**Error handling**: if any agent has `status: 'error'`, show its error in the verdict zone:
```
<div className="text-bear text-xs flex items-center gap-1.5">
  <AlertCircle className="size-3.5" />
  {label} agent failed: {error}
</div>
```

**Container wrapper**:
```tsx
<div className="border border-divider bg-bg-elev-1 rounded-lg p-4 flex flex-col gap-4">
  {/* header */}
  <div className="flex items-center gap-2 text-caption text-fg-subtle uppercase tracking-wider font-semibold">
    <Brain className="size-3.5" />
    <span>Multi-Agent {mode} mode</span>
  </div>
  {/* theater zones */}
</div>
```

#### Step 2: Add the conic-gradient ring animation to `globals.css`

Add to `apps/web/src/app/globals.css` after the existing `@keyframes` section:

```css
@keyframes spin-ring {
  to { transform: rotate(360deg); }
}

.agent-ring-active {
  background: conic-gradient(from 0deg, var(--color-brand), transparent, var(--color-brand));
  animation: spin-ring 2s linear infinite;
}
```

#### Step 3: Verify `chat-screen.tsx` integration

The `AgentDeliberation` is already rendered in `chat-screen.tsx` when `agentProgress` is non-null.
No changes needed there — the props interface is unchanged. Just verify the component still
receives `agents` and `mode` correctly.

### Accessibility
- The container has `role="status"` and `aria-live="polite"` so screen readers announce updates.
- Each agent node has `aria-label="{label} agent: {status}"`.
- The verdict reveal has `aria-label="Committee verdict: {bias}, {confidence}% confidence"`.
- Respect `prefers-reduced-motion`: the `MotionConfig` with `reducedMotion="user"` in
  `MotionRoot` already handles this — animations skip to final state.

### Files to create/modify
- [ ] `apps/web/src/components/chat/parts/agent-deliberation.tsx` — full rewrite
- [ ] `apps/web/src/app/globals.css` — add `spin-ring` keyframe + `.agent-ring-active`

---

## 1.2 — Inline Mini-Visuals in Tool Cards

### Goal
Add tiny embedded SVG visualizations to tool cards so chat answers feel like a trading terminal,
not a text bot. Each visual is a small (40–80px tall) inline SVG — no chart library, no canvas.

### Current state
Tool parts are in `apps/web/src/components/chat/parts/`. Each is a server component that renders
a compact card. The existing `Sparkline` component (`apps/web/src/components/ui/sparkline.tsx`)
is a minimal SVG path renderer — reuse and extend this pattern.

### Tool cards to upgrade

#### 1.2a: `get_candles` → candle sparkline
**File:** `apps/web/src/components/chat/parts/get-candles.tsx`

Add a mini candle sparkline (60px tall, full width) between the OHLC summary and the tail list.

**Implementation:**
- Create a new component `CandleSparkline` in the same file (or in `ui/sparkline.tsx`).
- Input: `output.candles` (array of `{ t, o, h, l, c, symbol }`).
- Take the last 20 bars. Normalize prices to a 0–100 vertical range.
- Render each candle as a thin vertical line (high→low) with a small rectangle (open→close).
  Bull candles: `stroke="var(--color-bull)"` / `fill="var(--color-bull)"`.
  Bear candles: `stroke="var(--color-bear)"` / `fill="var(--color-bear)"`.
  Use `SERIES_BULL_HEX` / `SERIES_BEAR_HEX` from `chart-colors.ts` for stroke/fill (canvas-safe hex).
- SVG `viewBox="0 0 100 40"` with `preserveAspectRatio="none"`, `className="h-15 w-full"`.
- `role="img"` with `aria-label="Candle sparkline: last 20 bars, closing at {last.c}"`.

Insert it after the OHLC `<dl>` and before the change/pips line:
```tsx
<CandleSparkline candles={output.candles.slice(-20)} symbol={symbol} />
```

#### 1.2b: `get_indicators` → RSI gauge arc
**File:** `apps/web/src/components/chat/parts/get-indicators.tsx`

For the RSI indicator result, add a small gauge arc (48×48px) next to the RSI value.

**Implementation:**
- Create `RsiGauge` component (inline in the file).
- Input: `value: number` (0–100).
- Render an SVG semicircle arc (180°). Background arc: `stroke="var(--color-bg-elev-3)"`.
  Value arc: colored by zone — <30 → `var(--color-bull)` (oversold), 30–70 →
  `var(--color-fg-muted)`, >70 → `var(--color-bear)` (overbought).
- Center text: the RSI value in `text-caption font-bold tabular-nums`.
- `role="img"` `aria-label="RSI gauge: {value}"`.

Find the RSI row in the indicator rendering switch and wrap it:
```tsx
<div className="flex items-center gap-3">
  <RsiGauge value={latestRsi} />
  <span className="...existing row content...">...</span>
</div>
```

#### 1.2c: `get_cot` → positioning bars (already exists, enhance)
**File:** `apps/web/src/components/chat/parts/get-cot.tsx`

The current `Bar` component is good but tiny. Enhance:
- Make bars 3px tall (from 1.5px) for better visibility.
- Add a center zero-line: a thin `border-t border-divider` at the 50% mark.
- Animate bar width on mount: `m.div` with `initial={{ width: 0 }} animate={{ width: \`${pct}%\` }}`.
- Color: positive → `bg-bull`, negative → `bg-bear` (already correct).

#### 1.2d: `get_correlation` → heat-strip
**File:** `apps/web/src/components/chat/parts/get-correlation.tsx`

The correlation matrix table already uses colored text. Add a mini heat-strip below the table:
- A single row of cells (one per matrix cell, left-to-right) colored by correlation strength.
- `r >= 0.7` → `bg-bull/80`, `0.4 ≤ r < 0.7` → `bg-bull/40`, `-0.4 < r < 0.4` → `bg-bg-elev-3`,
  `r <= -0.7` → `bg-bear/80`, `-0.7 < r <= -0.4` → `bg-bear/40`.
- Each cell is `h-2 flex-1 rounded-sm`.
- `role="img"` `aria-label="Correlation heat strip: {strongest pair} at {r}"`.

#### 1.2e: `compute_risk` → risk gauge
**File:** `apps/web/src/components/chat/parts/compute-risk.tsx`

Add a small R:R gauge next to the RR value in the header.
- A horizontal bar split into two segments: risk (left, `bg-bear/30`) and reward
  (right, `bg-bull/30`), proportional to the R:R ratio.
- If `rrRatio` is null, skip the gauge.
- `h-1.5 w-20 rounded-full` container, two `m.div` segments.

### Files to create/modify
- [ ] `apps/web/src/components/chat/parts/get-candles.tsx` — add `CandleSparkline`
- [ ] `apps/web/src/components/chat/parts/get-indicators.tsx` — add `RsiGauge`
- [ ] `apps/web/src/components/chat/parts/get-cot.tsx` — enhance bars
- [ ] `apps/web/src/components/chat/parts/get-correlation.tsx` — add heat-strip
- [ ] `apps/web/src/components/chat/parts/compute-risk.tsx` — add R:R gauge

---

## 1.3 — Trust Layer on Assistant Messages

### Goal
Add a model badge, timestamp, token/cost footer (collapsible), and per-claim citation chips to
every assistant message. Builds the trust that premium fintech AI lives or dies on.

### Current state
**File:** `apps/web/src/components/chat/message.tsx`
- `MessageImpl` receives `message: UIMessage`.
- `message.metadata` is already accessed for the model in the regen picker.
- No timestamps, no model badge, no token/cost display, no citations shown.
- Action row (copy, regenerate) appears on hover at bottom-right.

**File:** `apps/web/src/components/chat/parts/citation-warning.tsx`
- Already exists — shows a warning when citations are missing. Good foundation.

### Implementation steps

#### Step 1: Add a message footer to `message.tsx`

After the message content parts and before the action row, add a footer for assistant messages:

```tsx
{!isUser && !isSystem && <MessageFooter message={message} />}
```

**New component** `MessageFooter` (inline in `message.tsx` or separate file
`chat/_components/message-footer.tsx`):

```typescript
interface MessageFooterProps {
  message: UIMessage;
}
```

**Layout:**
```
┌────────────────────────────────────────────┐
│ 🤖 Gemini 2.5 Flash · 2:34 PM    ▸ details │
└────────────────────────────────────────────┘
```

- Container: `flex items-center gap-2 text-caption text-fg-subtle mt-1.5`
- **Model badge**: extract from `message.metadata?.model`. Display a short label:
  - Parse the model string (e.g. `google-vertex/gemini-2.5-flash` → "Gemini 2.5 Flash").
  - Create a `formatModelLabel(model: string): string` helper.
  - Render as: `<span className="inline-flex items-center gap-1"><Bot className="size-3" />{label}</span>`
  - If no model metadata, show "AI" generically.
- **Timestamp**: `message.createdAt` (a Date on UIMessage). Format as
  `new Date(message.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })`.
  Render as `<span>· {time}</span>`.
- **Details toggle**: a small `<button>` with `aria-expanded` that toggles a collapsible section.
  - Label: `text-fg-subtle hover:text-fg` with a `ChevronRight`/`ChevronDown` icon.
  - Collapsed by default.

**Expanded details section** (when toggled):
```tsx
<div className="border-t border-divider mt-2 pt-2 flex flex-col gap-1.5 text-caption">
  {/* Token usage */}
  {usage && (
    <div className="flex justify-between">
      <span className="text-fg-subtle">Tokens</span>
      <span className="text-fg-muted tabular-nums">
        {usage.promptTokens} in · {usage.completionTokens} out
      </span>
    </div>
  )}
  {/* Cost */}
  {usage?.cost !== undefined && (
    <div className="flex justify-between">
      <span className="text-fg-subtle">Est. cost</span>
      <span className="text-fg-muted tabular-nums">${usage.cost.toFixed(4)}</span>
    </div>
  )}
  {/* Citations */}
  {citations.length > 0 && (
    <div className="flex flex-col gap-1">
      <span className="text-fg-subtle">Sources</span>
      {citations.map((c, i) => (
        <a key={i} href={c.url} className="text-brand hover:underline flex items-center gap-1">
          <LinkIcon className="size-3" />
          <span className="truncate">{c.title || c.url}</span>
        </a>
      ))}
    </div>
  )}
</div>
```

**Data extraction:**
- `usage`: `message.metadata?.usage` — shape `{ promptTokens: number, completionTokens: number, cost?: number }`.
- `citations`: extract from message parts. Look for parts with `type: 'tool-cite_sources'` or
  similar, or parse citation metadata from the message. If no citations exist, skip the section.
- Guard everything with optional chaining — metadata may be undefined.

#### Step 2: Add `aria-live` for streaming completion

In `message.tsx`, wrap the assistant message content in an `aria-live="polite"` region:
```tsx
<div aria-live={isUser ? undefined : 'polite'}>
  {/* message parts */}
</div>
```
This makes screen readers announce the final message when streaming completes.

### Files to create/modify
- [ ] `apps/web/src/components/chat/message.tsx` — add `MessageFooter`, `aria-live`
- [ ] `apps/web/src/components/chat/_components/message-footer.tsx` — new (optional separate file)

---

## 1.4 — Reasoning / "Thinking" Panel

### Goal
Show a collapsible streamed reasoning preview (Claude-style) that transitions into the final
answer. Surface the existing `PlanPart` prominently during streaming.

### Current state
**File:** `apps/web/src/components/chat/parts/plan.tsx`
- `PlanPart` renders a `data-plan` UiPart as a collapsible card with a chevron + steps list.
- Default collapsed. Shows domain label, rationale, steps, and expected tools.
- Already uses semantic tokens correctly.

**File:** `apps/web/src/components/chat/message.tsx`
- `PlanPart` is rendered when a `data-plan` part is found in the message.
- During streaming, the plan part appears but is collapsed and easy to miss.

### Implementation steps

#### Step 1: Make `PlanPart` auto-expand during streaming

Add a `streaming?: boolean` prop to `PlanPart`:
```typescript
interface PlanPartProps {
  plan: UserPlanPart;
  streaming?: boolean;
}
```

When `streaming` is true:
- Default to **expanded** (override the `useState(false)` initial state).
- Add a pulsing "Thinking…" indicator: a small `Loader2` with `animate-spin` + `text-brand`.
- Show a subtle animated bar at the bottom: `bg-brand/30 h-0.5 animate-pulse`.

When `streaming` is false (streaming complete):
- Auto-collapse after a 2-second delay (use `useEffect` with `setTimeout`).
- Transition the header from "Thinking…" to "Plan" with a fade.

#### Step 2: Pass streaming state from `message.tsx`

In `message.tsx`, determine if the message is still streaming:
```typescript
const isStreaming = /* from parent — pass down a `streaming` prop or derive from message state */;
```

Pass to `PlanPart`:
```tsx
<PlanPart plan={plan} streaming={isStreaming} />
```

The `Message` component already receives the message — check if it's the last message and the
chat status is `streaming` (pass this via a prop from `message-list.tsx` or `chat-screen.tsx`).

#### Step 3: Add a transition animation

When streaming completes and the plan collapses, animate the collapse:
```tsx
<AnimatePresence initial={false}>
  {open && (
    <m.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      {/* steps content */}
    </m.div>
  )}
</AnimatePresence>
```

### Files to create/modify
- [ ] `apps/web/src/components/chat/parts/plan.tsx` — add `streaming` prop, auto-expand/collapse
- [ ] `apps/web/src/components/chat/message.tsx` — pass streaming state to PlanPart

---

## 1.5 — Thread Summary Header

### Goal
After ~20 messages, show a collapsible summary card pinned at the top of the thread so users get
context without scrolling. Reuses the `summarize_thread` tool output.

### Current state
**File:** `apps/web/src/components/chat/parts/summarize-thread.tsx`
- `SummarizeThreadPart` renders a synopsis + key insights. Currently rendered inline as a tool
  card within the message stream.

**File:** `apps/web/src/components/chat/message-list.tsx`
- Virtualized list of messages. No header above the list.

**File:** `apps/web/src/components/chat/chat-screen.tsx`
- Renders `MessageList` inside a scroll container.

### Implementation steps

#### Step 1: Create `ThreadSummaryHeader` component

**New file:** `apps/web/src/components/chat/_components/thread-summary-header.tsx`

```typescript
'use client';
interface ThreadSummaryHeaderProps {
  synopsis: string;
  insights: Array<{ text: string; symbol?: string }>;
  onDismiss?: () => void;
}
```

**Layout:**
- A collapsible card pinned at the top of the message list (not virtualized — outside the
  virtualizer).
- Container: `border border-divider bg-bg-elev-1 rounded-lg p-3 mb-3`
- Header row: `flex items-center justify-between`
  - Left: `Sparkles` icon + "Thread summary" label in `text-body-sm font-semibold text-fg`.
  - Right: a collapse toggle button (`ChevronDown`/`ChevronUp`) + a dismiss button (`X`).
- Collapsed: shows only the synopsis in `text-fg-muted text-xs line-clamp-2`.
- Expanded: shows the full synopsis + insights list (reuse the layout from
  `SummarizeThreadPart`).
- Use `AnimatePresence` for expand/collapse animation.
- `role="status"` `aria-label="Thread summary"`.

#### Step 2: Fetch summary in `chat-screen.tsx`

In `chat-screen.tsx`, after the thread loads, check if `messages.length > 20`. If so, fetch the
thread summary:

```typescript
const [summary, setSummary] = useState<{ synopsis: string; insights: any[] } | null>(null);

useEffect(() => {
  if (messages.length > 20 && !summary) {
    fetch(`/api/chat/threads/${threadId}/summary`)
      .then(res => res.ok ? res.json() : null)
      .then(data => data && setSummary(data))
      .catch(() => {});
  }
}, [messages.length, threadId, summary]);
```

**Note:** Check if a summary endpoint exists. If not, create a simple one:
- **New API route:** `apps/web/src/app/api/chat/threads/[id]/summary/route.ts`
- GET: fetch the thread's messages, check if a `summarize_thread` tool output exists in any
  message's parts. If found, return `{ synopsis, insights }`. If not, return 404 (no summary yet).
- Use `withAuth` from `@/lib/api`.

#### Step 3: Render in `chat-screen.tsx`

Above the `MessageList`:
```tsx
{summary && (
  <ThreadSummaryHeader
    synopsis={summary.synopsis}
    insights={summary.insights}
    onDismiss={() => setSummary(null)}
  />
)}
```

### Files to create/modify
- [ ] `apps/web/src/components/chat/_components/thread-summary-header.tsx` — new
- [ ] `apps/web/src/components/chat/chat-screen.tsx` — fetch + render summary
- [ ] `apps/web/src/app/api/chat/threads/[id]/summary/route.ts` — new (if needed)

---

## 1.6 — Modular Customizable Dashboard Canvas

### Goal
Replace the current static dashboard with a Coinbase-Advanced-style widget grid: drag/resize
widgets (watchlist, open positions, daily P&L, economic calendar countdown, news pulse, AI
morning briefing, equity curve, alerts). `@dnd-kit` is already in the repo.

### Current state
**File:** `apps/web/src/app/(app)/dashboard/page.tsx`
- Server component. Fetches alerts, events, journal entries via `Promise.all`.
- Renders a static 2-column grid of `StatCard`s + `PerformanceChart` + alerts list.
- No customization, no drag, no resize.

**Available dependencies:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (in
`apps/web/package.json`).

### Implementation steps

#### Step 1: Define widget types

**New file:** `apps/web/src/app/(app)/dashboard/_components/widget-types.ts`

```typescript
export type WidgetType =
  | 'today-glance'    // 1.9 — hero
  | 'briefing'        // 1.7 — AI morning briefing
  | 'pnl-heatmap'     // 1.8 — P&L calendar
  | 'equity-curve'    // existing PerformanceChart
  | 'watchlist'       // live prices + sparklines
  | 'open-positions'  // from journal
  | 'alerts'          // active alerts
  | 'calendar'        // next events countdown
  | 'news-pulse'      // sentiment summary
  | 'stats'           // win rate, total R, etc.

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  /** Grid span on desktop (1 = half, 2 = full width). */
  span: 1 | 2;
  /** Sort order. */
  order: number;
}

export const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: 'w1', type: 'today-glance',   span: 2, order: 0 },
  { id: 'w2', type: 'briefing',       span: 2, order: 1 },
  { id: 'w3', type: 'pnl-heatmap',    span: 2, order: 2 },
  { id: 'w4', type: 'equity-curve',   span: 1, order: 3 },
  { id: 'w5', type: 'stats',          span: 1, order: 4 },
  { id: 'w6', type: 'watchlist',      span: 1, order: 5 },
  { id: 'w7', type: 'open-positions', span: 1, order: 6 },
  { id: 'w8', type: 'alerts',         span: 1, order: 7 },
  { id: 'w9', type: 'calendar',       span: 1, order: 8 },
  { id: 'w10', type: 'news-pulse',    span: 1, order: 9 },
];
```

#### Step 2: Create the dashboard client component

**New file:** `apps/web/src/app/(app)/dashboard/_components/dashboard-canvas.tsx`

```typescript
'use client';
```

This is the main interactive component.

**State:**
- `layout: WidgetConfig[]` — persisted to `localStorage` key `hamafx:dashboard-layout`.
- `editMode: boolean` — toggle to enter/exit customization mode.
- Load `DEFAULT_LAYOUT` on first visit, then user's saved layout.

**Layout:**
- CSS Grid: `grid-cols-1 md:grid-cols-2 gap-4`.
- Each widget wrapper: `col-span-1` or `md:col-span-2` based on `span`.
- In edit mode: each widget gets a drag handle (`GripVertical` icon), a resize toggle
  (1↔2 span), and a remove button (`X`).
- Use `@dnd-kit/sortable` with `SortableContext` for reordering.

**Widget wrapper:**
```tsx
<div className={cn(
  'border border-divider bg-bg-elev-1 rounded-lg overflow-hidden',
  widget.span === 2 && 'md:col-span-2',
  editMode && 'ring-1 ring-brand/30'
)}>
  {editMode && (
    <div className="flex items-center justify-between border-b border-divider px-3 py-1.5">
      <button className="cursor-grab text-fg-subtle hover:text-fg">
        <GripVertical className="size-4" />
      </button>
      <span className="text-caption text-fg-subtle uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => toggleSpan(widget.id)} className="text-fg-subtle hover:text-fg text-caption">
          {widget.span === 1 ? '⤢' : '⤡'}
        </button>
        <button onClick={() => removeWidget(widget.id)} className="text-fg-subtle hover:text-bear">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )}
  <div className="p-4">{renderWidget(widget.type, data)}</div>
</div>
```

**Edit toggle button** (in the page header):
```tsx
<Button variant="ghost" size="sm" onClick={() => setEditMode(!editMode)}>
  <SlidersHorizontal className="size-4" />
  {editMode ? 'Done' : 'Customize'}
</Button>
```

#### Step 3: Create individual widget components

Each widget is a small component in `apps/web/src/app/(app)/dashboard/_components/widgets/`:

- `today-glance-widget.tsx` — see feature 1.9
- `briefing-widget.tsx` — see feature 1.7
- `pnl-heatmap-widget.tsx` — see feature 1.8
- `equity-curve-widget.tsx` — wraps existing `PerformanceChart`
- `watchlist-widget.tsx` — uses `usePrices` hook, shows symbol + price + sparkline + % change
- `open-positions-widget.tsx` — filters journal entries for `outcome === 'open'`
- `alerts-widget.tsx` — lists active alerts (reuse from current dashboard)
- `calendar-widget.tsx` — next 3 high-impact events with countdown
- `news-pulse-widget.tsx` — sentiment summary bar (reuse `SentimentSummary`)
- `stats-widget.tsx` — grid of `StatCard`s (win rate, total R, etc.)

Each widget receives its data as props from the server component.

#### Step 4: Convert `dashboard/page.tsx` to a server component that fetches all data

```typescript
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [alerts, events, journalEntries, newsArticles, briefing] = await Promise.all([
    listAlerts(userId, { limit: 10 }),
    listUpcomingEvents({ limit: 10 }),
    listEntries(userId, { limit: 200 }),
    listRecentArticles(30),
    getLatestBriefing(userId), // new — see 1.7
  ]);

  return (
    <div className="flex flex-col gap-4">
      <DashboardHeader />
      <DashboardCanvas
        alerts={alerts}
        events={events}
        entries={journalEntries}
        news={newsArticles}
        briefing={briefing}
        stats={computeStatsFromEntries(journalEntries)}
      />
    </div>
  );
}
```

#### Step 5: Persist layout

In `dashboard-canvas.tsx`:
```typescript
useEffect(() => {
  localStorage.setItem('hamafx:dashboard-layout', JSON.stringify(layout));
}, [layout]);
```

Load on mount:
```typescript
const [layout, setLayout] = useState<WidgetConfig[]>(() => {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT;
  try {
    const saved = localStorage.getItem('hamafx:dashboard-layout');
    return saved ? JSON.parse(saved) : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
});
```

### Files to create/modify
- [ ] `apps/web/src/app/(app)/dashboard/_components/widget-types.ts` — new
- [ ] `apps/web/src/app/(app)/dashboard/_components/dashboard-canvas.tsx` — new
- [ ] `apps/web/src/app/(app)/dashboard/_components/widgets/*.tsx` — 10 new widget files
- [ ] `apps/web/src/app/(app)/dashboard/page.tsx` — rewrite to fetch all data + render canvas

---

## 1.7 — AI Morning/Market Briefing Card

### Goal
A daily generated briefing (overnight moves, today's high-impact events, watchlist bias, open-risk
summary) with "dig deeper in chat". The `briefings` package already exists on the backend.

### Current state
**Backend:** `packages/ai/src/briefings/generate.ts` — generates pre/post-event briefings.
**Cron:** `apps/web/src/app/api/cron/briefings/route.ts` — triggers briefings on schedule.
**Persistence:** `packages/ai/src/briefings/persistence.ts` — stores briefings in a
`Briefings_Thread` with `briefings_emitted` tracking.

The briefing is stored as an assistant message in a special briefings thread. We need to surface
it on the dashboard.

### Implementation steps

#### Step 1: Create a server function to fetch the latest briefing

**New file or add to:** `packages/ai/src/briefings/index.ts`

```typescript
export async function getLatestBriefing(userId: string): Promise<BriefingData | null> {
  // 1. Find the user's briefings thread
  // 2. Get the most recent assistant message with a `briefing` part
  // 3. Return structured data
}
```

**`BriefingData` shape:**
```typescript
interface BriefingData {
  id: string;
  createdAt: number;
  body: string;        // markdown text
  kind: 'pre-event' | 'post-event' | 'morning' | 'weekly';
  relatedEvent?: { title: string; date: number; currency: string };
}
```

Export from `@hamafx/ai` index.

#### Step 2: Create the briefing widget

**New file:** `apps/web/src/app/(app)/dashboard/_components/widgets/briefing-widget.tsx`

```typescript
interface BriefingWidgetProps {
  briefing: BriefingData | null;
}
```

**Layout:**
- Container: `flex flex-col gap-3`
- Header: `Sparkles` icon + "AI Briefing" in `text-body-sm font-semibold text-fg` + relative
  timestamp (`formatRelative(briefing.createdAt)`).
- Body: the briefing markdown rendered with `ReactMarkdown` + `remarkGfm` (same as
  `chat/parts/text.tsx`). Wrap in `md-prose text-sm leading-relaxed space-y-2`.
- If `briefing` is null: show `EmptyState` with `Sparkles` icon, "No briefing yet", "Check back
  after the next high-impact event."
- Footer: a link to `/chat` with the briefings thread:
  ```tsx
  <Link href="/chat" className="text-brand text-body-sm hover:underline flex items-center gap-1">
    Dig deeper in chat <ChevronRight className="size-3.5" />
  </Link>
  ```
- `role="status"` `aria-label="AI briefing"`.

### Files to create/modify
- [ ] `packages/ai/src/briefings/index.ts` — add `getLatestBriefing`
- [ ] `packages/ai/src/index.ts` — export `getLatestBriefing`
- [ ] `apps/web/src/app/(app)/dashboard/_components/widgets/briefing-widget.tsx` — new

---

## 1.8 — P&L Calendar Heatmap

### Goal
A green/red day grid (TradeZella-style) of daily realized R/P&L. Click a day to see its trades.

### Current state
Journal entries are fetched via `listEntries(userId)`. Each entry has `openedAt`, `closedAt`,
`rMultiple`, `outcome`. The dashboard already fetches entries.

### Implementation steps

#### Step 1: Create the heatmap component

**New file:** `apps/web/src/app/(app)/dashboard/_components/widgets/pnl-heatmap-widget.tsx`

```typescript
'use client';
interface PnLHeatmapProps {
  entries: JournalEntry[];
}
```

**Implementation:**
- Group closed entries by `closedAt` date (local day).
- For each day, sum `rMultiple` values.
- Render a calendar grid (current month + previous month, 7 columns × 6 rows max).
- Each day cell:
  - `size-8 rounded-sm` (minimum 32×32px for touch).
  - Background color intensity based on total R:
    - Positive: `bg-bull` with opacity proportional to R (clamp 0.1–0.8).
    - Negative: `bg-bear` with opacity proportional to |R| (clamp 0.1–0.8).
    - Zero/no trades: `bg-bg-elev-2`.
  - Text: the day number in `text-caption tabular-nums`.
  - `title` attribute: `{date}: {totalR > 0 ? '+' : ''}{totalR.toFixed(1)}R ({count} trades)`.
  - `role="img"` `aria-label` on the grid container.
- Day labels row: Mon–Sun in `text-caption text-fg-subtle uppercase`.
- Month label: `text-body-sm font-semibold text-fg`.
- Navigation: prev/next month buttons (`ChevronLeft`/`ChevronRight`).

**Click interaction:**
- Clicking a day opens a `Drawer` showing the trades for that day (reuse `EntryList` filtered
  to that date, or a simpler list).

**Color calculation:**
```typescript
function heatColor(totalR: number): string {
  if (totalR === 0) return 'bg-bg-elev-2';
  const intensity = Math.min(Math.abs(totalR) / 5, 0.8); // normalize: 5R = max intensity
  const opacity = Math.max(0.1, intensity).toFixed(2);
  return totalR > 0 ? `bg-bull/${opacity}` : `bg-bear/${opacity}`;
}
```
**Note:** Tailwind v4 supports dynamic opacity via `bg-bull/0.5` but not via template literals
at build time. Use inline `style` with `oklch` from the CSS variables instead:
```typescript
function heatStyle(totalR: number): React.CSSProperties {
  if (totalR === 0) return {};
  const intensity = Math.min(Math.abs(totalR) / 5, 0.8);
  const alpha = Math.max(0.1, intensity);
  // Read the oklch value from CSS var and apply alpha
  const color = totalR > 0 ? 'var(--color-bull)' : 'var(--color-bear)';
  return { backgroundColor: `oklch(from ${color} l c h / ${alpha})` };
}
```
Or simpler: use `style={{ opacity: alpha }}` on a `bg-bull`/`bg-bear` div.

### Files to create/modify
- [ ] `apps/web/src/app/(app)/dashboard/_components/widgets/pnl-heatmap-widget.tsx` — new

---

## 1.9 — "Today at a Glance" Hero

### Goal
Above the fold on the dashboard: next high-impact event countdown, current session + bias, open
positions risk, and one AI nudge.

### Implementation steps

#### Step 1: Create the hero widget

**New file:** `apps/web/src/app/(app)/dashboard/_components/widgets/today-glance-widget.tsx`

```typescript
interface TodayGlanceProps {
  events: EconomicEvent[];
  entries: JournalEntry[];
  briefing: BriefingData | null;
}
```

**Layout (desktop: 4-column grid, mobile: 2×2):**
```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ ⏰ Next event │ 📍 Session   │ 📊 Open risk │ 🤖 AI nudge  │
│ FOMC in 4h   │ London       │ 2.3R at risk │ "Watch GBP   │
│ 22m          │ Active       │ across 3     │ today"       │
│              │              │ positions    │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

- Container: `grid grid-cols-2 md:grid-cols-4 gap-3`
- Each cell: `border border-divider bg-bg-elev-1 rounded-lg p-3 flex flex-col gap-1.5`

**Cell 1 — Next event countdown:**
- Icon: `Clock` in `text-warn`.
- Label: `text-caption text-fg-subtle uppercase tracking-wider` — "Next event".
- Value: event title in `text-body-sm font-semibold text-fg`.
- Countdown: reuse the `useNowTick` pattern from `calendar-hero.tsx` (but use the shared
  `TimeProvider` from feature 7.2 if it exists, otherwise a local 60s interval).
  Format: "in 4h 22m" or "in 3d" or "Live now".
- If no upcoming events: "No high-impact events today" in `text-fg-muted text-xs`.

**Cell 2 — Current session:**
- Icon: `Compass` in `text-brand`.
- Label: "Session".
- Value: current trading session name (Asian/London/New York/Closed/Weekend).
- Determine session from current UTC hour:
  - Asian: 00:00–08:00 UTC
  - London: 08:00–16:00 UTC
  - New York: 13:00–21:00 UTC
  - Closed/Weekend: otherwise
- Show "Active" or "Closed" badge with `bg-bull/10 text-bull` or `bg-fg-muted/10 text-fg-muted`.

**Cell 3 — Open risk:**
- Icon: `ShieldAlert` in `text-bear`.
- Label: "Open risk".
- Value: count of open positions + total R at risk.
- Calculate: `entries.filter(e => e.outcome === 'open')`, sum their R risk (if stop is set,
  R = |entry - stop| / |entry - target| * 1; otherwise just count).
- Display: "{n} positions · {totalR}R at risk" in `text-body-sm font-semibold text-fg`.
- If no open positions: "No open positions" in `text-fg-muted text-xs`.

**Cell 4 — AI nudge:**
- Icon: `Sparkles` in `text-brand`.
- Label: "AI nudge".
- Value: a short one-liner extracted from the latest briefing (first sentence), or a default:
  "Ask AI about today's bias for {defaultSymbol}".
- Link: `text-brand hover:underline` linking to `/chat`.

### Files to create/modify
- [ ] `apps/web/src/app/(app)/dashboard/_components/widgets/today-glance-widget.tsx` — new

---

## Implementation order (recommended)

1. **1.1** Committee theater (highest visual impact, standalone)
2. **1.2** Mini-visuals (per-tool, can be done incrementally)
3. **1.3** Trust layer (quick win, high trust signal)
4. **1.4** Reasoning panel (small change to existing component)
5. **1.5** Thread summary header (standalone, needs API route)
6. **1.9** Today at a glance hero (simplest dashboard widget)
7. **1.7** AI briefing widget (needs backend function)
8. **1.8** P&L heatmap (standalone widget)
9. **1.6** Modular dashboard canvas (ties everything together, do last)

---

## Design checklist (apply to every component)

- [ ] Zero raw Tailwind palette colors — only semantic tokens
- [ ] `tabular-nums` on all numeric displays
- [ ] `border-divider` for all borders, `bg-bg-elev-1/2/3` for surfaces
- [ ] `text-fg` / `text-fg-muted` / `text-fg-subtle` for text hierarchy
- [ ] `text-bull` / `text-bear` / `text-warn` / `text-brand` for semantic colors
- [ ] `rounded-lg` for all cards (consistent radius)
- [ ] Motion only for state changes (entrance, exit, streaming) — no decorative animation
- [ ] `aria-label` / `role` on all non-text visual elements
- [ ] `min-h-[44px]` on all interactive elements (touch targets)
- [ ] `prefers-reduced-motion` respected (handled by `MotionRoot`)
- [ ] No `text-[9px]` — minimum `text-caption` (11px)
- [ ] Safe-area insets on mobile (`env(safe-area-inset-*)`)