# Plan 4 — Chat AI Output System Improvement & Polish

**Priority:** P2 — Major UX overhaul
**Estimated files touched:** 47
**Goal:** Dramatically improve AI response rendering, streaming experience, tool call visualization, and markdown quality.

---

## Current Architecture

### Message Pipeline
```
UIMessage.parts[] → message.tsx → registry.tsx → part-specific renderer
```

- `message.tsx` (13.5KB) — renders message bubble, action buttons, edit mode
- `registry.tsx` (12KB) — maps part types to bespoke renderers, falls back to `tool-card.tsx`
- `text.tsx` (9.2KB) — **custom markdown parser** (not a library) — handles bold, italic, code, links, lists
- `tool-card.tsx` (4.8KB) — generic JSON dump fallback for unmapped tools
- 30 bespoke tool renderers in `parts/` directory

### Tool Renderer Quality (rated 1-5)
- **4/5:** `get-indicators`, `analyze-technical`, `compute-risk`, `compute-position-health`
- **3/5:** Most renderers (adequate but could be better)
- **2/5:** `get-correlation` (broken table), `tool-card` generic (JSON dump), `get-cot` (minimal bars)

---

## 🔴 Bugs (12)

### Bug 1: Unclosed code fence swallows streaming text
**File:** `text.tsx` ~line 100
The markdown parser consumes ALL remaining lines if the model emits ` ``` ` without a closing fence during streaming.

**Fix:** Track fence state and auto-close at end of input.

### Bug 2: No `React.memo` on Message — re-render storm
**File:** `message.tsx`, `message-list.tsx`
Every stream token changes the `messages` array reference, re-rendering ALL messages (~50ms per token).

**Fix:** Wrap `Message` in `React.memo` with custom comparison on `message.parts` reference.

### Bug 3: Uncleared `setTimeout` in 3 copy buttons
**Files:** `message.tsx`, `text.tsx`, `share-snapshot.tsx`
During streaming, components unmount frequently → React warnings about state on unmounted components.

**Fix:** Create `useCopied` hook with cleanup: `useEffect(() => () => clearTimeout(ref.current), [])`.

### Bug 4: `safeStringify` has no truncation
**File:** `tool-card.tsx` ~line 80
`JSON.stringify(v, null, 2)` on 500 candles produces a massive string. Browser freezes.

**Fix:** Truncate at 5000 chars: `str.slice(0, 5000) + '\n… (truncated)'`

### Bug 5: Italic parser false-positives on underscores in data
**File:** `text.tsx` ~line 90
The `_` italic parser matches `entry_price`, `stop_loss`, `take_profit` in tool outputs.

**Fix:** Only match `_` when surrounded by spaces or at word boundaries.

### Bug 6: Broken links in convene-committee.tsx
**File:** `parts/convene-committee.tsx`
Source URLs rendered as raw text or broken `<a>` tags.

**Fix:** Validate URLs before rendering.

### Bug 7: Broken table rendering in get-correlation.tsx
**File:** `parts/get-correlation.tsx`
Mismatched `<td>`/`<tr>` tags.

**Fix:** Rewrite table with proper structure.

### Bug 8: `pipSize` missing default — returns undefined → NaN pips
**File:** Multiple tool renderers
If Symbol union expands without pipSize mapping, calculations produce NaN.

**Fix:** Add default: `const pipSize = PIP_SIZES[symbol] ?? 0.0001;`

### Bug 9: Nested links produce invalid HTML
**File:** `text.tsx` ~line 110
`renderInline(label)` inside `<a>` can produce `<a><a></a></a>`.

**Fix:** Don't call `renderInline` inside link labels.

### Bug 10: `PRETTY_NAME` map only covers 5 of 28+ tools
**File:** `tool-card.tsx` ~line 20
Most tools show raw `tool-compute_risk` instead of "risk".

**Fix:** Auto-format: `toolName.replace(/^tool-/, '').replace(/_/g, ' ')`.

### Bug 11: `extractText` called on every render
**File:** `message.tsx` ~line 40
`const plainText = extractText(message);` iterates all parts on every render.

**Fix:** `const plainText = useMemo(() => extractText(message), [message.parts]);`

### Bug 12: `activeModelId` always null in RegenModelPicker
**File:** `message.tsx` ~line 175
Current model never highlighted in regen picker.

**Fix:** Pass `message.metadata?.model ?? null`.

---

## 🟡 Improvements (31)

### Markdown & Text Rendering
1. **Replace custom parser with `react-markdown` + `remark-gfm`** — missing tables, headings, blockquotes, nested lists, images, strikethrough
2. **Add syntax highlighting** — code blocks are plain `<pre>`, add `shiki` or `prism`
3. **Add streaming cursor** — no visual feedback during token streaming
4. **Handle escaped characters** — `\*not italic\*` renders with backslashes visible
5. **Add heading support** — `#`, `##`, `###` render as plain text currently
6. **Add blockquote support** — `>` prefix not handled
7. **Add table support** — `| col | col |` not handled
8. **Add horizontal rule support** — `---` not handled
9. **Add nested list support** — indented lists render as flat
10. **Truncate long code blocks** — 10,000-line code block creates 10,000 DOM nodes. Add "Show more" after 100 lines

### Tool Call Visualization
11. **Add labeled loading states** — show "Fetching XAUUSD candles…" instead of anonymous skeleton
12. **Add retry button on tool errors** — error cards are terse, no retry option
13. **Add collapsible tool inputs** — show what parameters were passed to the tool
14. **Add mini chart in get-candles tool card** — `lightweight-charts` already bundled but not used
15. **Add sparkline to get-price tool card** — show recent price trend
16. **Improve get-news formatting** — should look like article cards, not a list
17. **Improve get-calendar formatting** — should look like the calendar page cards
18. **Improve get-indicators formatting** — show indicator values as badges
19. **Improve compute-risk formatting** — add a risk gauge visualization
20. **Improve convene-committee formatting** — show voting/consensus visually
21. **Add consistent design language across all tool renderers** — some use semantic tokens, some use raw colors
22. **Fix `run-system-action.tsx` using raw Tailwind colors** — breaks design system

### Streaming & Message UX
23. **Add message timestamps** — no timestamp shown on messages
24. **Add model badge** — no indication which model generated each response
25. **Add feedback mechanism** — no thumbs up/down or "report issue" button
26. **Add copy button for entire response** — exists but uncleared timeout (Bug 3)
27. **Add "Regenerate with…" model picker** — exists but activeModelId always null (Bug 12)
28. **Improve typing indicator** — shows during active streaming, should only show before first token. Use `animate-bounce` not `animate-pulse`
29. **Add message virtualization** — 200 messages × complex rendering = DOM jank. Use `@tanstack/react-virtual`
30. **Add error banner dismiss button** — error stays until next successful message
31. **Add streaming token count** — show "Generating… 450 tokens" during streaming

---

## 🔵 Polish (24)

1. Add entrance animation for new messages (fade/slide)
2. Add smooth expand/collapse for tool cards
3. Add transition on tool state changes (loading → success → error)
4. Add skeleton shimmer for tool loading
5. Add hover state for tool cards (subtle elevation)
6. Add focus-visible ring on all interactive elements in messages
7. Add `aria-live` for streaming text (screen readers)
8. Add `aria-label` to all icon-only buttons (copy, regenerate, edit)
9. Add keyboard navigation to regen model picker (arrow keys, Home/End, Escape)
10. Add focus trap to overflow menu in chat-top-bar
11. Improve code block header (language name + copy button in styled bar)
12. Add diff highlighting for code changes (red/green)
13. Add "Copy as markdown" option
14. Add pin/bookmark for messages
15. Add message search within a thread
16. Add "Jump to tool" navigation in long responses
17. Add citation tooltips (hover to see source)
18. Add chart annotation preview in chat
19. Add progress bar for multi-step plans (step 1/5, 2/5, etc.)
20. Add consensus visualization for committee (vote distribution bars)
21. Add color-coded sentiment for news (bullish=green, bearish=red)
22. Add severity badges for alerts (high/medium/low)
23. Add tabular data export (CSV from tool results)
24. Add "Share this response" button (shareable link)

---

## 🟢 Upgrades (22)

### Architecture
1. **Replace custom markdown parser with `react-markdown` + `remark-gfm`**
2. **Add `shiki` for syntax highlighting** — 100+ languages
3. **Add `@tanstack/react-virtual` for message virtualization**
4. **Add streaming cursor component** — blinking cursor at end of streaming text
5. **Create `useCopied` hook** — centralized copy logic with proper cleanup

### Tool Renderer Upgrades
6. **Add mini candlestick chart to get-candles tool card**
7. **Add sparkline to get-price tool card** — 24h price trend
8. **Add sortable table to get-correlation** — fix broken table
9. **Add interactive gauge to compute-risk** — visual risk meter
10. **Add consensus chart to convene-committee** — bar chart showing votes
11. **Add calendar grid to get-calendar** — mini calendar view
12. **Add sentiment badges to get-news** — color-coded bullish/bearish/neutral
13. **Add indicator value cards to get-indicators** — RSI: 65.3 (overbought)
14. **Add structure diagram to get-market-structure** — visual SMC pattern
15. **Add position health meter to compute-position-health** — visual gauge

### Message Features
16. **Add message timestamps** — "2:34 PM" below each message
17. **Add model badge** — "GPT-4o" or "Gemini 2.5 Flash" on assistant messages
18. **Add feedback buttons** — thumbs up/down with optional comment
19. **Add message pinning** — pin important responses to top
20. **Add response sharing** — shareable link for individual responses
21. **Add streaming token count** — "Generating… 450 tokens"
22. **Add "Copy as markdown" option** — copy raw markdown source

---

## Tool Renderer Quality Ratings & Targets

| Tool Renderer | Current | Key Issue | Target |
|---------------|---------|-----------|--------|
| `get-indicators` | 4/5 | Could show value cards | 5/5 |
| `analyze-technical` | 4/5 | Good but could add chart preview | 5/5 |
| `compute-risk` | 4/5 | Could add risk gauge | 5/5 |
| `compute-position-health` | 4/5 | Could add health meter | 5/5 |
| `get-candles` | 3/5 | No mini chart | 5/5 |
| `get-price` | 3/5 | No sparkline | 4/5 |
| `get-news` | 3/5 | Plain list, no sentiment | 4/5 |
| `get-calendar` | 3/5 | Plain list, no grid | 4/5 |
| `get-market-structure` | 3/5 | No visual diagram | 4/5 |
| `convene-committee` | 3/5 | No consensus chart | 4/5 |
| `get-correlation` | 2/5 | Broken table | 4/5 |
| `tool-card` (generic) | 2/5 | JSON dump | 3/5 |
| All others | 3/5 | Various minor issues | 4/5 |

---

## Implementation Order

### Phase A: Critical Fixes (Bugs 1-12)
1. Fix unclosed code fence (Bug 1)
2. Add `React.memo` to Message (Bug 2)
3. Create `useCopied` hook (Bug 3)
4. Add truncation to `safeStringify` (Bug 4)
5. Fix italic parser (Bug 5)
6. Fix broken links and tables (Bugs 6-7)
7. Fix remaining bugs (8-12)

### Phase B: Markdown Overhaul
1. Replace custom parser with `react-markdown` + `remark-gfm`
2. Add `shiki` syntax highlighting
3. Add streaming cursor
4. Add code block truncation

### Phase C: Tool Renderer Upgrades
1. Fix `get-correlation` broken table
2. Add mini chart to `get-candles`
3. Add sparkline to `get-price`
4. Add sentiment badges to `get-news`
5. Add consensus chart to `convene-committee`
6. Fix `run-system-action` raw colors
7. Upgrade remaining renderers to target rating

### Phase D: Message UX
1. Add message virtualization
2. Add timestamps and model badge
3. Add feedback buttons
4. Fix typing indicator
5. Add error banner dismiss

### Phase E: Polish
1. Entrance animations
2. Tool card transitions
3. Accessibility improvements
4. Remaining polish items

---

## Completion Checklist

- [ ] Bug 1 — Unclosed code fence auto-closes
- [ ] Bug 2 — `Message` wrapped in `React.memo`
- [ ] Bug 3 — `useCopied` hook created, used in 3 files
- [ ] Bug 4 — `safeStringify` truncates at 5000 chars
- [ ] Bug 5 — Italic parser doesn't match underscores in data
- [ ] Bug 6-7 — Broken links and tables fixed
- [ ] Bug 8-12 — All remaining bugs fixed
- [ ] Upgrade 1 — `react-markdown` + `remark-gfm` integrated
- [ ] Upgrade 2 — `shiki` syntax highlighting added
- [ ] Upgrade 3 — Message virtualization
- [ ] Upgrade 4 — Streaming cursor component
- [ ] Upgrade 5 — `useCopied` hook
- [ ] Upgrades 6-15 — Tool renderer visual upgrades
- [ ] Upgrades 16-22 — Message features (timestamps, model badge, feedback)
- [ ] All tool renderers rated ≥4/5
- [ ] No raw JSON dumps in any tool card
- [ ] No raw Tailwind colors in any renderer
- [ ] All interactive elements have `aria-label`
- [ ] Streaming is smooth — no re-render storms
- [ ] Long threads (200+ messages) scroll smoothly
