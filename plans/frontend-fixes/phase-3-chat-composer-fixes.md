# Phase 3 — Chat & Composer System Fixes

**Priority:** P2 — Fix after security and chart issues
**Estimated files touched:** 18
**Findings covered:** 51 (7 bugs + 25 improvements + 12 polish + 7 upgrades)

---

## Overview

The chat system is the primary user interaction surface. This phase fixes memory leaks from uncleared timeouts, eliminates massive re-render storms during streaming, adds message virtualization for long threads, and addresses accessibility gaps.

---

## Task 3.1 — Create `useCopied` Hook to Fix Uncleared `setTimeout` (🔴 P1)

**Files:** `message.tsx` (~line 55), `text.tsx` (~line 130)

### Fix

Create shared hook:
```ts
// hooks/use-copied.ts
export function useCopied(timeout = 1500) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const trigger = useCallback(() => {
    setCopied(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), timeout);
  }, [timeout]);
  useEffect(() => () => clearTimeout(timeoutRef.current), []);
  return [copied, trigger] as const;
}
```

Replace `setTimeout` in both files with `useCopied`.

### Verification

1. During streaming, click copy on unmounting message — no React warnings

---

## Task 3.2 — Fix Scroll-to-Bottom FAB Always Visible (🔴 P1)

**File:** `chat-screen.tsx` (~line 155)

### Fix

Track scroll position and conditionally render:
```ts
const [showScrollFab, setShowScrollFab] = useState(false);
useEffect(() => {
  const el = scrollContainerRef.current;
  if (!el) return;
  const handleScroll = () => {
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollFab(dist > 240);
  };
  el.addEventListener('scroll', handleScroll, { passive: true });
  return () => el.removeEventListener('scroll', handleScroll);
}, []);
```

### Verification

1. Scroll up — FAB appears. Scroll to bottom — FAB disappears.

---

## Task 3.3 — Fix `modelOverrideRef` Cleared Before Request (🔴 P1)

**File:** `chat-screen.tsx` (~line 65)

### Fix

Clear in `onFinish`, not in `prepareSendMessagesRequest`.

### Verification

1. Select "Regenerate with Gemini" — if request fails, Retry still uses Gemini

---

## Task 3.4 — Fix `imageError` State Reused for Text Errors (🔴 P1)

**File:** `composer.tsx` (~line 100)

### Fix

Create unified `error` state. Replace all `setImageError` with `setError`.

---

## Task 3.5 — Fix `activeModelId` Always `null` in RegenModelPicker (🔴 P1)

**File:** `message.tsx` (~line 175)

### Fix

Pass actual model: `activeModelId={message.metadata?.model ?? null}`

---

## Task 3.6 — Fix `onText` Stale Closure in Voice Input (🔴 P1)

**File:** `use-voice-input.ts` (~line 85)

### Fix

Use ref pattern:
```ts
const onTextRef = useRef(onText);
onTextRef.current = onText;
// In start(): rec.onresult = (e) => { onTextRef.current?.(transcript); };
```

Remove `onText` from `useCallback` deps.

---

## Task 3.7 — Wrap `Message` in `React.memo` (🟡 P2)

**File:** `message.tsx`, `message-list.tsx`

### Fix

```ts
export const Message = memo(MessageImpl, (prev, next) => {
  if (prev.isStreaming !== next.isStreaming) return false;
  if (prev.message.id !== next.message.id) return false;
  if (prev.message.parts !== next.message.parts) return false;
  if (prev.message.content !== next.message.content) return false;
  return true;
});
```

Also memoize callbacks (`onRegenerate`, `onEdit`, `onCopy`) with `useCallback`.

### Verification

1. During streaming — only last message re-renders on each token

---

## Task 3.8 — Add Message Virtualization (🟡 P2)

**File:** `message-list.tsx`

### Fix

Install `@tanstack/react-virtual` and implement virtualizer with `estimateSize: () => 200`, `overscan: 5`.

### Verification

1. 200+ messages — smooth scroll, ~15-20 DOM nodes

---

## Task 3.9 — Fix Sequential Image Uploads (🟡 P2)

**File:** `composer.tsx` (~line 110)

### Fix

Use `Promise.allSettled` for parallel uploads.

### Verification

1. Select 4 images — all upload in parallel

---

## Task 3.10 — Fix Paste Handler Cursor Jump (🟡 P2)

**File:** `composer.tsx` (~line 145)

### Fix

Preserve cursor position with `requestAnimationFrame` + `setSelectionRange`.

---

## Task 3.11 — Fix Missing `aria-label` on Composer Textarea (🟡 P2)

**File:** `composer.tsx` (~line 200)

### Fix

Add `aria-label="Chat message input"` to textarea.

---

## Task 3.12 — Fix Action Row Invisible on Touch Devices (🟡 P2)

**File:** `message.tsx` (~line 110)

### Fix

```tsx
'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100'
```

---

## Task 3.13 — Fix Edit Textarea Missing `maxLength` (🟡 P2)

**File:** `message.tsx` (~line 70)

### Fix

Add `maxLength={MAX_TEXT_CHARS}` to edit textarea.

---

## Task 3.14 — Fix `extractText` Called on Every Render (🟡 P2)

**File:** `message.tsx` (~line 40)

### Fix

`const plainText = useMemo(() => extractText(message), [message.parts]);`

---

## Task 3.15 — Fix Error Banner Missing Dismiss Button (🟡 P2)

**File:** `chat-screen.tsx` (~line 135)

### Fix

Add X button to dismiss error, plus Retry button.

---

## Task 3.16 — Fix Title Re-fetch Effect Over-firing (🟡 P2)

**File:** `chat-screen.tsx` (~line 82)

### Fix

Add `titleFetchedRef` guard to prevent re-fetching for same thread.

---

## Task 3.17 — Fix Overflow Menu Missing Focus Management (🟡 P2)

**File:** `chat-top-bar.tsx` (~line 95)

### Fix

Implement: focus first item on open, arrow key nav, Escape to close + restore focus, focus trap, outside click to close.

---

## Task 3.18 — Fix Regen Model Picker Missing Keyboard Navigation (🟡 P2)

**File:** `regen-model-picker.tsx` (~line 130)

### Fix

Add Arrow Up/Down, Home/End, Escape, Enter/Space handlers with `activeIndex` state.

---

## Task 3.19 — Fix Typing Indicator Shows During Active Streaming (🔵 Polish)

**File:** `message-list.tsx` (~line 35)

### Fix

Only show when `status === 'submitted'`. Use `animate-bounce` not `animate-pulse`.

---

## Task 3.20 — Fix XAUUSD Pinned Prompts Showing EURUSD Content (🔵 Polish)

**File:** `quick-prompts.tsx` (~line 60)

### Fix

Create gold-specific pinned prompts (XAUUSD key levels, gold news, DXY correlation, etc.)

---

## Task 3.21 — Fix `formatRelative` Stale Times (🟡 P2)

**File:** `chat-top-bar.tsx` (~line 330)

### Fix

Add 60s interval refresh while drawer is open.

---

## Task 3.22 — Fix `threads` Prop Stale After New Chat (🟡 P2)

**File:** `chat-top-bar.tsx` (~line 80)

### Fix

Call `router.refresh()` after creating new thread, or manage threads in client state.

---

## Task 3.23 — Fix Markdown Parser Missing Features (🟡 P2)

**File:** `text.tsx`

### Fix

Add: headings (#/##/###), blockquotes (>), horizontal rules (---), escaped characters (\*), prevent nested links.

---

## Task 3.24 — Fix `PRETTY_NAME` Map Incomplete (🔵 Polish)

**File:** `tool-card.tsx` (~line 20)

### Fix

Expand to cover all 28+ tools, or auto-format: `toolName.replace(/^tool-/, '').replace(/_/g, ' ')`.

---

## Task 3.25 — Fix Voice Input Missing Error Feedback (🟡 P2)

**File:** `use-voice-input.ts` (~line 95)

### Fix

Add `onError` callback. Show toast for: mic permission denied, network error, no speech detected.

---

## Task 3.26 — Fix Unsafe `UIMessage[]` Cast (🟡 P2)

**File:** `chat/[threadId]/page.tsx` (~line 55)

### Fix

Validate with zod schema before casting. Skip invalid messages.

---

## Task 3.27 — Add Popover API Fallback (🟢 Upgrade)

**File:** `message.tsx` (~line 180)

### Fix

Feature-detect popover support. Fallback to state-based dropdown for Firefox <125, Safari <17.

---

## Task 3.28 — Fix `exportThread` Silent Failure on Pop-up Block (🔵 Polish)

**File:** `chat-top-bar.tsx` (~line 90)

### Fix

Check `window.open()` return. Show toast with fallback link if blocked.

---

## Task 3.29 — Fix `getSessionInfo` Called on Every Render (🟡 P2)

**File:** `quick-prompts.tsx` (~line 130)

### Fix

`const session = useMemo(() => getSessionInfo(now), [now]);`

Wrap `QuickPrompts` in `React.memo`.

---

## Task 3.30 — Fix `safeStringify` Can Produce Huge Strings (🟡 P2)

**File:** `tool-card.tsx` (~line 80)

### Fix

Truncate at 5000 chars: `str.slice(0, 5000) + '… (truncated)'`

---

## Task 3.31 — Fix Code Block Missing Truncation (🟡 P2)

**File:** `text.tsx` (~line 140)

### Fix

Truncate at 100 lines with "Show all N lines" button.

---

## Task 3.32 — Fix `plan.tsx` Focus Indicator (🟡 P2)

**File:** `plan.tsx` (~line 40)

### Fix

Add `focus-visible:ring-2 focus-visible:ring-brand rounded-md`.

---

## Task 3.33 — Fix `formatCharCount` Locale Mismatch Risk (🔵 Polish)

**File:** `composer-helpers.ts` (~line 50)

### Fix

`count.toLocaleString('en-US')`

---

## Task 3.34 — Fix `disabled` Prop Always `false` (🔵 Polish)

**File:** `chat-screen.tsx` (~line 145)

### Fix

Remove dead `disabled` prop or wire it up.

---

## Task 3.35 — Fix Regen Model Picker Re-fetches on Every Open (🟡 P2)

**File:** `regen-model-picker.tsx` (~line 40)

### Fix

Add module-level cache with 1-minute TTL (stale-while-revalidate).

---

## Completion Checklist

- [x] Task 3.1 — `useCopied` hook created and used
- [x] Task 3.2 — Scroll FAB conditionally rendered
- [x] Task 3.3 — `modelOverrideRef` cleared after request
- [x] Task 3.4 — Unified error state
- [x] Task 3.5 — `activeModelId` passes actual model
- [x] Task 3.6 — `onText` uses ref pattern
- [x] Task 3.7 — `Message` wrapped in `React.memo`
- [x] Task 3.8 — Message virtualization implemented
- [x] Task 3.9 — Parallel image uploads
- [x] Task 3.10 — Paste preserves cursor
- [x] Task 3.11 — `aria-label` on textarea
- [x] Task 3.12 — Action buttons visible on touch
- [x] Task 3.13 — Edit textarea has `maxLength`
- [x] Task 3.14 — `extractText` in `useMemo`
- [x] Task 3.15 — Error banner has dismiss
- [x] Task 3.16 — Title re-fetch guarded
- [x] Task 3.17 — Overflow menu has focus management
- [x] Task 3.18 — Regen picker has keyboard nav
- [x] Task 3.19 — Typing indicator fixed
- [x] Task 3.20 — XAUUSD prompts are gold-specific
- [x] Task 3.21 — `formatRelative` refreshes
- [x] Task 3.22 — Thread list updates after new chat
- [x] Task 3.23 — Markdown parser handles headings/quotes/escapes
- [x] Task 3.24 — `PRETTY_NAME` comprehensive
- [x] Task 3.25 — Voice input shows error toast
- [x] Task 3.26 — `UIMessage[]` cast validated
- [x] Task 3.27 — Popover API fallback
- [x] Task 3.28 — Export shows toast on pop-up block
- [x] Task 3.29 — `QuickPrompts` memoized
- [x] Task 3.30 — `safeStringify` truncates
- [x] Task 3.31 — Code blocks truncate at 100 lines
- [x] Task 3.32 — Plan toggle has focus-visible
- [x] Task 3.33 — `formatCharCount` uses explicit locale
- [x] Task 3.34 — `disabled` prop removed or wired
- [x] Task 3.35 — Regen picker caches responses

## Post-Phase Verification

1. `pnpm typecheck` — zero errors
2. `pnpm lint` — zero errors
3. Long thread (200+ messages) — smooth scrolling
4. Streaming — only last message re-renders
5. Mobile — action buttons visible
6. Keyboard — all menus navigable
7. Screen reader — all inputs labeled
8. No React warnings during streaming
