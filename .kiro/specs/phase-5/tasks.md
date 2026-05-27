# Implementation Plan: Phase 5 — UI/UX Polish & Design System

## Overview

Phase 5 is a 13-step page-by-page polish pass. Each step is independent and ships in its own commit so the app stays usable throughout. No new features, no new tools, no schema changes. New deps (`motion`, `lucide-react`, `vaul`, `sonner`) added in T1 and used progressively in later tasks.

Hard rules from `00-project.md` apply. `*` tasks are optional Lighthouse audits.

## Tasks

- [x] 1. T1 — Foundation: dependencies, tokens, fonts, motion root
  - [x] 1.1 Install new deps
    - `pnpm add motion@^12 lucide-react@latest vaul@latest sonner@latest --filter @hamafx/web`
    - _Requirements: 1.1, 3.1, 4.1, 5.1, 6.1_
  - [x] 1.2 Add new tokens to `tokens.ts` and `globals.css`
    - `bgElev3`, `divider`, `overlay` colors
    - Type scale custom properties (`--text-xs` → `--text-3xl`)
    - _Requirements: 1.2, 1.3_
    - Files: `packages/config/tailwind/tokens.ts`, `apps/web/src/app/globals.css`
  - [x] 1.3 Wire Inter Variable + JetBrains Mono Variable via `next/font/google`
    - Apply `--font-inter` and `--font-mono` CSS variables to `<html className={...}>`
    - _Requirements: 1.4_
    - Files: `apps/web/src/app/layout.tsx`
  - [x] 1.4 Add `viewport-fit=cover` to viewport metadata
    - Ensures `env(safe-area-inset-*)` returns correct values on iPhone with Dynamic Island
    - _Requirements: 2.1_
    - Files: `apps/web/src/app/layout.tsx`
  - [x] 1.5 Create `MotionRoot` with LazyMotion + reduced-motion respect
    - _Requirements: 4.1, 4.8_
    - Files: `apps/web/src/components/ui/motion-config.tsx`
  - [x] 1.6 Create `Toaster` (sonner) with mobile/desktop position switch
    - _Requirements: 6.1, 6.4_
    - Files: `apps/web/src/components/ui/toaster.tsx`
  - [x] 1.7 Mount `MotionRoot` and `Toaster` in `(app)/layout.tsx`
    - _Requirements: 4.1, 6.1_
    - Files: `apps/web/src/app/(app)/layout.tsx`

- [x] 2. T2 — UI primitives
  - [x] 2.1 Create `<Drawer>` (vaul wrapper, shadcn-API-compatible)
    - Drag handle, safe-area bottom padding, focus-trap, Escape-to-close
    - _Requirements: 5.1, 5.5, 5.6_
    - Files: `apps/web/src/components/ui/drawer.tsx`
  - [x] 2.2 Create `<Fab>` (floating action button)
    - Motion whileTap scale-down; positioned 80px above BottomNav + safe-area
    - _Requirements: 5.2, 5.3, 5.5_
    - Files: `apps/web/src/components/ui/fab.tsx`
  - [x] 2.3 Create `<AnimatedNumber>` (motion `useSpring` + `useTransform`)
    - _Requirements: 4.4_
    - Files: `apps/web/src/components/ui/animated-number.tsx`
  - [x] 2.4 Create `<Sparkline>` (pure SVG path)
    - _Requirements: 7.7_
    - Files: `apps/web/src/components/ui/sparkline.tsx`
  - [x] 2.5 Create `<StatCard>` (icon + label + value + sparkline)
    - _Requirements: 7.7_
    - Files: `apps/web/src/components/ui/stat-card.tsx`
  - [x] 2.6 Wrap `<Button>` with motion whileTap
    - Use `m.create('button')` so the wrapper accepts both motion + button props
    - _Requirements: 4.2_
    - Files: `apps/web/src/components/ui/button.tsx`

- [x] 3. T3 — Layout: TopBar, BottomNav, PageHeader
  - [x] 3.1 BottomNav: replace inline SVG with lucide-react icons
    - `MessageCircle`, `LineChart`, `Newspaper`, `Calendar`, `MoreHorizontal`
    - Add a `motion.div` selection indicator that slides between active items
    - _Requirements: 3.1, 3.2, 4.1_
    - Files: `apps/web/src/components/layout/bottom-nav.tsx`
  - [x] 3.2 TopBar: glass-morphism background
    - `bg-bg-elev-1/85 backdrop-blur-md`
    - Track height in CSS custom property `--top-bar-h`
    - _Requirements: 7.3.1_
    - Files: `apps/web/src/components/layout/top-bar.tsx`
  - [x] 3.3 PageHeader: consistent spacing + optional icon prop
    - _Requirements: 7.8.1_
    - Files: `apps/web/src/components/layout/page-header.tsx`

- [x] 4. T4 — Login page
  - [x] 4.1 Add ambient radial-gradient glow + brand icon mark
    - 56×56 rounded-2xl `Image` from `/icons/icon-192.png`
    - Single static radial gradient behind the card
    - _Requirements: 7.1.1, 7.1.2_
    - Files: `apps/web/src/app/login/page.tsx`
  - [x] 4.2 Animate login button success state
    - Brief check-icon flash + green tint before redirect
    - _Requirements: 7.1.4_
    - Files: `apps/web/src/app/login/_components/login-form.tsx`

- [x] 5. T5 — Chart page
  - [x] 5.1 Convert chart header to sticky sub-header with glass blur
    - _Requirements: 7.3.1_
    - Files: `apps/web/src/app/(app)/chart/[symbol]/_components/chart-view.tsx`
  - [x] 5.2 Animate TimeframePicker selection underline
    - `<motion.div layoutId="tf-indicator">` for shared-element transition
    - _Requirements: 7.3.3_
    - Files: `apps/web/src/components/chart/timeframe-picker.tsx`
  - [x] 5.3 Move OverlayToggle into a Drawer triggered by `Settings2` icon
    - Sheet shows the 5 SMC toggles + a "summary" line at the bottom
    - _Requirements: 5.4, 7.3.5_
    - Files: `apps/web/src/components/chart/overlay-toggle.tsx`, chart-view
  - [x] 5.4 Replace PriceTag with animated number + trend icon
    - `<AnimatedNumber>` for the price; `TrendingUp`/`TrendingDown` for the delta
    - _Requirements: 4.4, 7.3.4_
    - Files: `apps/web/src/components/chart/price-tag.tsx`
  - [x] 5.5 Add inner-shadow border to chart container
    - _Requirements: 7.3.2_
    - Files: chart-view

- [x] 6. T6 — Chat page
  - [x] 6.1 Tighten chat bubble radii (iOS Messages style)
    - `rounded-2xl rounded-br-sm` for user, `rounded-2xl rounded-bl-sm` for assistant
    - _Requirements: 7.2.1_
    - Files: `apps/web/src/components/chat/message.tsx`
  - [x] 6.2 Composer focus shadow + lift
    - _Requirements: 7.2.2_
    - Files: `apps/web/src/components/chat/composer.tsx`
  - [x] 6.3 Animate quick-prompt chips entrance/exit
    - `<motion.div>` with `AnimatePresence` around the chip wrapper
    - _Requirements: 7.2.3_
    - Files: `apps/web/src/components/chat/chat-surface.tsx`, quick-prompts
  - [x] 6.4 Replace abstract typing-indicator with chat-bubble shape
    - _Requirements: 7.2.5_
    - Files: `apps/web/src/components/chat/message-list.tsx`
  - [x] 6.5 Animate image thumbnail add/remove (scale-pop / fade)
    - _Requirements: 7.2.4_
    - Files: composer
  - [x] 6.6 Hide scrollbars on mobile
    - Tailwind `scrollbar-hide` plugin or raw CSS
    - _Requirements: 7.2.6_
    - Files: globals.css or chat-surface

- [x] 7. T7 — News page
  - [x] 7.1 Replace inline timestamp with `<LiveTimestamp>` client island
    - Re-renders every 30s
    - _Requirements: 7.4.3_
    - Files: `apps/web/src/components/news/live-timestamp.tsx`, `apps/web/src/app/(app)/news/page.tsx`
  - [x] 7.2 Add card hover lift on desktop (`hover:-translate-y-0.5 hover:shadow-md`)
    - _Requirements: 7.4.1_
    - Files: `apps/web/src/components/news/article-card.tsx`
  - [x] 7.3 Sentiment chip pulse animation on render
    - _Requirements: 7.4.2_
    - Files: article-card
  - [x] 7.4 Replace RefreshButton inline status with toast
    - _Requirements: 6.6_
    - Files: `apps/web/src/app/(app)/news/_components/refresh-button.tsx`

- [x] 8. T8 — Calendar page
  - [x] 8.1 Add sticky day headers (`position: sticky; top: <header-h>`)
    - _Requirements: 7.5.1_
    - Files: `apps/web/src/app/(app)/calendar/page.tsx`
  - [x] 8.2 Add "now" line indicator
    - 1px horizontal red line absolutely positioned in the day group
    - _Requirements: 7.5.2_
    - Files: `apps/web/src/components/calendar/now-line.tsx`, calendar/page
  - [x] 8.3 Past-event dimming + striked-through actuals
    - Already 60% opacity from Phase 4; add `line-through` to actual values for clarity
    - _Requirements: 7.5.3_
    - Files: `apps/web/src/components/calendar/event-card.tsx`
  - [x] 8.4 Imminent-event impact dot pulse (events within ±15 min of now)
    - _Requirements: 7.5.4_
    - Files: event-card

- [x] 9. T9 — Alerts page
  - [x] 9.1 Replace inline AlertForm with FAB → Drawer
    - _Requirements: 5.2, 7.6.2_
    - Files: `apps/web/src/app/(app)/alerts/_components/alert-list.tsx`, alert-form
  - [x] 9.2 Empty-state illustration with primary CTA
    - `<BellOff />` 64px faded + "Create your first alert" button
    - _Requirements: 7.6.1_
    - Files: alert-list
  - [x] 9.3 Replace alert dot with rule-typed icon
    - `TrendingUp` for price, `Activity` for indicator, `BarChart3` for candle close
    - _Requirements: 7.6.3_
    - Files: alert-list
  - [x] 9.4 Add swipe-left actions (mobile only)
    - `motion.div` with `drag="x"` revealing pause/delete underneath
    - _Requirements: 7.6.4_
    - Files: alert-list, new component `apps/web/src/app/(app)/alerts/_components/swipeable-row.tsx`
  - [x] 9.5 Replace `Pause`/`Re-arm`/`✕` text with lucide icons
    - `Bell`, `BellOff`, `BellRing`, `Trash2`
    - _Requirements: 3.4_
    - Files: alert-list
  - [x] 9.6 Toast on create / pause / re-arm / delete
    - _Requirements: 6.2, 6.3, 6.6_
    - Files: alert-list, alert-form

- [x] 10. T10 — Journal page
  - [x] 10.1 Replace inline EntryForm with FAB → Drawer
    - _Requirements: 5.3, 7.7.3_
    - Files: `apps/web/src/app/(app)/journal/_components/journal-view.tsx`
  - [x] 10.2 Refactor StatsSummary to 2×2 StatCard grid with sparklines
    - Sparkline data = sliding window of last 20 entries' R-multiples / win-rate / etc.
    - _Requirements: 7.7.1, 7.7.2_
    - Files: `apps/web/src/app/(app)/journal/_components/stats-summary.tsx`
  - [x] 10.3 Lazy-load entry list (first 20 + "Load more")
    - _Requirements: 7.7.4_
    - Files: `apps/web/src/app/(app)/journal/_components/entry-list.tsx`
  - [x] 10.4 Toast on entry create / close / delete
    - _Requirements: 6.2, 6.6_
    - Files: entry-form, entry-list

- [x] 11. T11 — Settings page
  - [x] 11.1 Refactor into sectioned layout with icons
    - `<Section icon={<Bell />} title="Notifications">` etc.
    - _Requirements: 7.8.1, 7.8.2_
    - Files: `apps/web/src/app/(app)/settings/page.tsx`, new `_components/settings-section.tsx`
  - [x] 11.2 Replace test-button inline status with toasts
    - TestEmailButton, TestTelegramButton, EnableWebPushButton
    - _Requirements: 6.6, 7.8.3_
    - Files: all `_components/*.tsx`

- [x] 12. T12 — More page
  - [x] 12.1 Add lucide left-icons + chevron-right
    - `Bell`, `BookOpen`, `Cog`, `ChevronRight`
    - _Requirements: 3.4, 7.9.1_
    - Files: `apps/web/src/app/(app)/more/page.tsx`
  - [x] 12.2 Increase row min-height to 56px
    - _Requirements: 7.9.2_
    - Files: more/page

- [x] 13. T13 — Documentation
  - [x] 13.1 Expand `docs/05-ui-ux.md`
    - Token table, type scale, motion vocabulary, icon usage rules, drawer-vs-dialog decision tree
    - _Requirements: 9.1_
    - Files: `docs/05-ui-ux.md`
  - [x] 13.2 Update `.kiro/steering/30-ui.md`
    - Add motion, icon, drawer, toast rules
    - _Requirements: 9.2_
    - Files: `.kiro/steering/30-ui.md`
  - [x] 13.3 Flip Phase 5 to ✅ in `docs/10-roadmap.md`
    - _Requirements: 9.3_
    - Files: `docs/10-roadmap.md`

- [x] 14. T14 — Acceptance
  - [x] 14.1 Lighthouse audit on iPhone 14 Pro Max viewport
    - Goal: Performance ≥ 90, Accessibility 100, Best Practices 100, SEO 100 across all routes
    - _Requirements: 8.1_
    - Files: log results in `docs/eval/lighthouse-<timestamp>.md`
  - [x] 14.2 Re-run AI eval harness against production
    - 10/10 must still pass after the refactor
    - Files: `docs/eval/<timestamp>.md`
  - [ ]* 14.3 Manual mobile smoke test
    - Audit each page in Chrome DevTools 430×932 viewport for safe-area + gesture flows
    - Files: notes only

- [x] 15. Final checkpoint — Phase 5 done

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.5", "1.6", "1.7", "2.1", "2.2", "2.3", "2.4", "2.5", "2.6"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 3, "tasks": ["4.1", "4.2"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5"] },
    { "id": 5, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3", "7.4"] },
    { "id": 7, "tasks": ["8.1", "8.2", "8.3", "8.4"] },
    { "id": 8, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6"] },
    { "id": 9, "tasks": ["10.1", "10.2", "10.3", "10.4"] },
    { "id": 10, "tasks": ["11.1", "11.2"] },
    { "id": 11, "tasks": ["12.1", "12.2"] },
    { "id": 12, "tasks": ["13.1", "13.2", "13.3"] },
    { "id": 13, "tasks": ["14.1", "14.2", "14.3"] },
    { "id": 14, "tasks": ["15"] }
  ]
}
```

## Notes

- Each page-level task (T4–T12) is independently shippable. The app stays usable throughout.
- New deps total ~110KB gz; budget enforced by Lighthouse perf check ≥ 90.
- No schema changes, no API changes, no new env vars.
- The eval must still pass 10/10 after Phase 5 (T14.2).
