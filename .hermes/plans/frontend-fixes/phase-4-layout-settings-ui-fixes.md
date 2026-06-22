# Phase 4 — Layout, Settings & UI Library Fixes

**Priority:** P2 — Fix after chat system
**Estimated files touched:** 25
**Findings covered:** 39 (9 bugs + 14 improvements + 10 polish + 6 upgrades)

---

## Overview

This phase addresses the layout shell, settings pages, and UI primitive library. It fixes accessibility gaps in navigation, missing dark mode declarations, inconsistent confirmation dialogs, division-by-zero errors, and dead code.

---

## Task 4.1 — Fix Missing `color-scheme: dark` (🔴 P1)

**File:** `globals.css`

### Fix

```css
:root { color-scheme: dark; }
html { color-scheme: dark; }
```

### Verification

1. Scrollbars, date pickers, select dropdowns — all dark themed

---

## Task 4.2 — Fix `startsWith('/chat')` Matching Future Routes (🔴 P1)

**File:** `top-bar.tsx`

### Fix

```ts
const isChat = pathname === '/chat' || pathname.startsWith('/chat/');
```

---

## Task 4.3 — Fix `segmented.tsx` Missing `aria-label` (🔴 P1)

**File:** `segmented.tsx`

### Fix

```ts
const ariaLabel = label || (srLabel ? `${name} selector` : undefined);
```

---

## Task 4.4 — Fix `confirm-drawer.tsx` Recreating Drawer Node (🔴 P1)

**File:** `confirm-drawer.tsx`

### Fix

Stabilize drawer with single instance + state control instead of recreating node.

---

## Task 4.5 — Fix Server Actions Throwing Instead of Returning Errors (🔴 P1)

**Files:** `profile/page.tsx`, `symbols/page.tsx`

### Fix

Convert all throwing actions to return `{ ok: false, error }`. Use `useActionState` + toast in calling components.

---

## Task 4.6 — Fix `usage-glance.tsx` Division by Zero (🟡 P2)

**File:** `usage-glance.tsx`

### Fix

```ts
const percent = MAX_DAILY_USD > 0 ? Math.min(100, (spentUSD / MAX_DAILY_USD) * 100) : 0;
```

---

## Task 4.7 — Fix `logout-button.tsx` Redirect on Fetch Failure (🟡 P2)

Also covered in Phase 1 Task 1.11. Ensure consistent fix.

---

## Task 4.8 — Fix `segmented.tsx` Missing Roving Tabindex (🟡 P2)

### Fix

Add Arrow Left/Right/Up/Down, Home/End keyboard nav with `focusedIndex` state and roving `tabIndex`.

---

## Task 4.9 — Fix `symbol-chip.tsx` Clear Button Touch Target (🟡 P2)

### Fix

Increase to 32px button with 16px icon, or add invisible 44px touch target.

---

## Task 4.10 — Fix Command Palette Missing Arrow-Key Navigation (🟡 P2)

**File:** `command-palette.tsx`

### Fix

Add `activeIndex` state, Arrow Up/Down, Enter to execute, scroll into view.

---

## Task 4.11 — Fix Settings Nav Missing `aria-current="page"` (🟡 P2)

**File:** `settings/layout.tsx`

### Fix

```tsx
aria-current={pathname === item.href ? 'page' : undefined}
```

---

## Task 4.12 — Fix `model-picker.tsx` Missing Loading State (🟡 P2)

### Fix

Show Skeleton cards while loading.

---

## Task 4.13 — Fix `data-card.tsx` Indentation Error (🔵 Polish)

---

## Task 4.14 — Remove Dead Code (🔵 Polish)

- `nav-drawer.tsx`: Remove dead `Menu` import
- `api-key-card.tsx`: Remove `void Info;`
- `skeleton.tsx`: Fix `w-full` conflict with inline `style.width`
- `toaster.tsx`: Enable `richColors={true}`
- `notifications-card.tsx`: Change `text-[9px]` to `text-[10px]`
- `button.tsx`: Change `transition-[background]` to `transition-colors`
- `tooltip.tsx`: Verify `delay-300` is valid Tailwind class

---

## Task 4.15 — Fix `install-nudge.tsx` iPad iOS 13+ Detection (🔵 Polish)

### Fix

```ts
const isMac = /Macintosh/.test(ua);
const isTouch = 'ontouchend' in document || navigator.maxTouchPoints > 0;
return /iPad/.test(ua) || (isMac && isTouch);
```

---

## Task 4.16 — Fix `offline-banner.tsx` Missing Loading Feedback (🔵 Polish)

### Fix

Add spinner to Retry button with `retrying` state.

---

## Task 4.17 — Fix `command-palette.tsx` Missing Keys (🔵 Polish)

### Fix

Add `key={i}` to HighlightedLabel children.

---

## Task 4.18 — Fix `manifest.ts` Description Lists Specific Symbols (🔵 Polish)

### Fix

Change to `'AI trading copilot for forex & commodities'`

---

## Task 4.19 — Fix `symbols/page.tsx` Non-Design-Token Color (🔵 Polish)

### Fix

`hover:text-red-500` → `hover:text-bear`

---

## Task 4.20 — Fix `settings/page.tsx` Whitespace (🔵 Polish)

### Fix

Run `pnpm prettier --write` on the file.

---

## Task 4.21 — Fix `layout.tsx` Only One Apple Splash Image (🔵 Polish)

### Fix

Add multiple `apple-touch-startup-image` sizes for different devices.

---

## Task 4.22 — Create Shared `useLocalStorage` Hook (🟢 Upgrade)

### Fix

Create hook with: load on mount, save on change, cross-tab sync via `storage` event, `hydrated` flag.

Migrate: `chart-view.tsx`, `use-bookmarks.tsx`, settings pages.

---

## Task 4.23 — Add `aria-live` Region for Toast Announcements (🟢 Upgrade)

**File:** `toaster.tsx`

### Fix

Add `aria-live="polite"` region mirroring toast content for screen readers.

---

## Task 4.24 — Fix Inconsistent Server Action Error Handling (🟢 Upgrade)

Also covered in Phase 1 Task 1.8. Audit all settings server actions.

---

## Task 4.25 — Fix `actions.ts` No Auth Check in `clearChatHistoryAction` (🔵 Polish)

Also covered in Phase 1 Task 1.9.

---

## Task 4.26 — Fix `ambient-background.tsx` Performance (🟡 P2)

### Fix

Use `will-change: transform`, GPU-accelerated properties only, respect `prefers-reduced-motion`.

---

## Task 4.27 — Fix `page-header.tsx` Responsive Issues (🟡 P2)

### Fix

`flex-col sm:flex-row sm:items-center sm:justify-between`

---

## Task 4.28 — Fix `empty-state.tsx` Accessibility (🟡 P2)

### Fix

Add `role="status"`, `aria-label={title}`, `aria-hidden` on icon.

---

## Task 4.29 — Fix `stat-card.tsx` Missing `aria-label` (🟡 P2)

### Fix

`aria-label={`${label}: ${value}`}`

---

## Task 4.30 — Fix `sparkline.tsx` SVG Accessibility (🟡 P2)

### Fix

`role="img"`, `aria-label={`${label} trend: ${start} to ${end}`}`

---

## Task 4.31 — Fix `animated-number.tsx` Reduced Motion (🟡 P2)

### Fix

Check `prefers-reduced-motion`, show final value instantly if enabled.

---

## Task 4.32 — Fix `provider-info-dot.tsx` Tooltip Accessibility (🟡 P2)

### Fix

Add `aria-label={`${provider} — ${status}`}`, `sr-only` text.

---

## Task 4.33 — Fix `stale-indicator.tsx` `aria-live` (🟡 P2)

### Fix

`role="alert"`, `aria-live="assertive"`

---

## Task 4.34 — Fix `switch.tsx` Focus Indicator (🟡 P2)

### Fix

`focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2`

---

## Task 4.35 — Fix `input.tsx` Missing `aria-invalid` (🟡 P2)

### Fix

`aria-invalid={error || undefined}`, red border on error.

---

## Task 4.36 — Fix `drawer.tsx` Focus Trap (🟡 P2)

### Fix

Store previously focused element, focus drawer on open, Tab cycling within drawer, restore focus on close.

---

## Completion Checklist

- [ ] Task 4.1 — `color-scheme: dark` added
- [ ] Task 4.2 — `startsWith('/chat')` uses segment matching
- [ ] Task 4.3 — Segmented always has `aria-label`
- [ ] Task 4.4 — Confirm drawer stabilized
- [ ] Task 4.5 — Server actions return errors not throw
- [ ] Task 4.6 — Division by zero handled
- [ ] Task 4.7 — Logout checks fetch result
- [ ] Task 4.8 — Segmented has roving tabindex
- [ ] Task 4.9 — Symbol chip clear ≥44pt
- [ ] Task 4.10 — Command palette has arrow keys
- [ ] Task 4.11 — Settings nav has `aria-current`
- [ ] Task 4.12 — Model picker has loading skeleton
- [ ] Task 4.13 — Data card indentation fixed
- [ ] Task 4.14 — All dead code removed
- [ ] Task 4.15 — iPad iOS 13+ detection fixed
- [ ] Task 4.16 — Offline banner has retry loading
- [ ] Task 4.17 — Command palette children have keys
- [ ] Task 4.18 — Manifest description generic
- [ ] Task 4.19 — Symbols page uses design token
- [ ] Task 4.20 — Settings page whitespace fixed
- [ ] Task 4.21 — Multiple apple splash images
- [ ] Task 4.22 — `useLocalStorage` hook created
- [ ] Task 4.23 — `aria-live` for toasts
- [ ] Task 4.24 — Server action error handling consistent
- [ ] Task 4.25 — `clearChatHistoryAction` has auth
- [ ] Task 4.26 — Ambient background respects reduced motion
- [ ] Task 4.27 — Page header responsive
- [ ] Task 4.28 — Empty state accessible
- [ ] Task 4.29 — Stat card has `aria-label`
- [ ] Task 4.30 — Sparkline SVG accessible
- [ ] Task 4.31 — Animated number respects reduced motion
- [ ] Task 4.32 — Provider info dot accessible
- [ ] Task 4.33 — Stale indicator has `aria-live`
- [ ] Task 4.34 — Switch has focus-visible ring
- [ ] Task 4.35 — Input has `aria-invalid`
- [ ] Task 4.36 — Drawer has focus trap

## Post-Phase Verification

1. `pnpm typecheck` — zero errors
2. `pnpm lint` — zero errors
3. axe DevTools — zero WCAG violations
4. Keyboard navigation across all settings pages
5. Mobile — all touch targets ≥44px
6. iPad — install nudge appears
7. Dark mode — all native controls dark themed
