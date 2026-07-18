# HamaFX-Ai — Comprehensive Frontend Audit Report

**Date:** July 18, 2026  
**Audited:** `apps/web/` (Next.js 15 App Router, 268 `.tsx` files, 21 E2E spec files)  
**Auditor:** Buffy (AI-assisted systematic review)

---

## Executive Summary

HamaFX-Ai's frontend is a **high-quality, professionally engineered** Next.js 15 application with strong fundamentals across most dimensions. The codebase demonstrates sophisticated patterns — virtualized chat message lists, multi-level error boundaries, hydration-safe voice input, keyboard-accessible menus, PWA support, and a cohesive dark-only design system.

**Overall Grade: B+ (85/100)**

### Strengths
- Excellent accessibility coverage (168+ `aria-label`s, skip-to-content, live regions, keyboard navigation in menus)
- Thoughtful performance patterns (virtualization, `memo`, `useMemo`, dynamic imports, paint containment)
- Robust error handling (global + per-route error boundaries, Sentry, dismissable inline errors)
- Cohesive design system (CSS custom properties, Tailwind v4 @theme, reusable surface utilities)
- Mobile-first with safe-area and PWA support (splash screens, service worker, offline detection)

### Key Areas for Improvement
- Over-reliance on client components (172 `"use client"` directives) limits SSR benefits
- Only 1 `<Suspense>` boundary in the entire app (login page only)
- Some large components exceed maintainability thresholds (chat-screen.tsx: ~700 lines)
- Limited unit test coverage for UI components and hooks
- No explicit Core Web Vitals monitoring or performance budgets

---

## 1. Rendering Performance

### 1.1 Server vs Client Components

**Finding:** 172 files use the `"use client"` directive, representing the overwhelming majority of components. The root layout (`layout.tsx`) and auth layout (`(auth)/layout.tsx`) are the only significant server components.

**Impact:** Most pages render client-side only, missing out on static generation and streaming SSR benefits. The auth pages, where SEO doesn't matter, are appropriately client-rendered.

**Recommendation (Medium):** Audit which components genuinely need interactivity. Components like `PageHeader`, `StatCard`, `EmptyState`, and some dashboard widgets could potentially be server components with client islands for interactive parts.

**Affected files:** All 172 `"use client"` files

### 1.2 Virtualization

**Finding:** `MessageList` uses `@tanstack/react-virtual` with dynamic size estimation based on content type (tool calls: 500px, tables: 400px, markdown: 300px, user messages: 80px). Overscan is set to 5.

**Assessment:** ✅ **Excellent**. This is a best-practice implementation that handles large chat threads efficiently. The granular `estimateSize` function accounts for different message types.

**Affected files:** `apps/web/src/components/chat/message-list.tsx`

### 1.3 Memoization

**Finding:** The codebase uses `memo`, `useMemo`, and `useCallback` strategically:
- `Message`, `MessageList`, `QuickPrompts`, `ArticleCard` are wrapped in `memo` with custom comparison functions
- 67+ `useMemo` calls across the app, primarily for derived data (filtered lists, computed metrics)
- `useCallback` used for stable handler references (e.g., `NavDrawerContext`, `ChatScreen`)

**Assessment:** ✅ **Good**. Memoization is applied thoughtfully, not indiscriminately. The custom `memo` comparator in `Message` is particularly well-crafted, comparing parts arrays by reference with a fallback to element-by-element comparison.

**Affected files:** `apps/web/src/components/chat/message.tsx` (custom memo comparator), `message-list.tsx`, `quick-prompts.tsx`

### 1.4 Suspense Boundaries

**Finding:** Only **1 `<Suspense>` boundary** exists in the entire app — in `login/page.tsx`. No Suspense is used for code-splitting, data fetching, or streaming.

**Impact:** Without Suspense, the app cannot leverage React 18/19 streaming SSR, and large code-split chunks cause layout shifts when they load.

**Recommendation (High):** Add Suspense boundaries:
- Around dynamic imports (`CommandPalette`, `InstallNudge`, `Chart`, `ChartSettingsDrawer`)
- Around data-fetching components (dashboard widgets, settings pages)
- Consider wrapping `children` in the `(app)/layout.tsx` for route-level streaming

**Affected files:** `apps/web/src/components/layout/lazy-chrome.tsx`, all pages without Suspense

### 1.5 Dynamic / Lazy Loading

**Finding:** Only 4 dynamic imports exist:
- `CommandPalette` and `InstallNudge` (lazy-chrome.tsx, ssr: false)
- `Chart` and `ChartSettingsDrawer` (chart-view.tsx, ssr: false)

**Assessment:** ✅ **Adequate but could be expanded**. Heavy chart libraries, TradingView widget, and analytics components are appropriately lazy-loaded. Consider adding more (calendar view, journal analytics, admin log viewer).

### 1.6 CSS Performance

**Finding:** The app uses `contain: layout paint` on `.paint-isolated` and overscroll containment. The ticker tape uses `will-change: transform`. Animations respect `prefers-reduced-motion`.

**Assessment:** ✅ **Excellent**. CSS containment, reduced-motion support, and `field-sizing: content` on textareas are all modern best practices.

**Affected files:** `apps/web/src/app/globals.css`

---

## 2. Component Architecture

### 2.1 Structure

```
apps/web/src/
├── app/                    # Next.js App Router pages + layouts
│   ├── (app)/             # Authenticated routes (chat, dashboard, chart, settings, etc.)
│   ├── (auth)/            # Unauthenticated routes (login, register, forgot-password)
│   ├── onboarding/        # Onboarding wizard
│   └── share/             # Public shared snapshots
├── components/
│   ├── chat/              # Chat UI (screen, message, composer, parts, top-bar)
│   ├── chart/             # Chart components (canvas, indicators, overlays)
│   ├── layout/            # Shell (top-bar, nav-drawer, ticker, command-palette)
│   ├── providers/         # Client providers (Query, Time, SW)
│   ├── ui/                # Design system primitives (button, input, skeleton, etc.)
│   ├── news/              # News components
│   ├── calendar/          # Calendar components
│   └── onboarding/        # Onboarding wizard
├── hooks/                 # 9 custom hooks (prices, candles, voice-input, etc.)
└── lib/                   # 24 utility modules (api, format, csrf, auth, etc.)
```

**Assessment:** ✅ **Well-organized**. Clear separation between route-level pages, shared components (by domain), UI primitives, and utilities. The `_components` convention for route-scoped components is a good pattern.

### 2.2 Component Size Analysis

| Component | Lines | Assessment |
|-----------|-------|------------|
| `chat-screen.tsx` | ~700 | ⚠️ **Too large** — contains multi-agent SSE handling, auto-scroll, error display, empty state, and thread title fetching |
| `composer.tsx` | ~550 | ⚠️ **Large** — combines voice input, slash commands, image upload, drag-drop, and send/stop logic |
| `chat-top-bar.tsx` | ~650 | ⚠️ **Large** — includes thread switcher drawer with bulk delete, mode selector, and conversation menu |
| `dashboard-canvas.tsx` | ~480 | ✅ Acceptable — focused on layout + drag-and-drop |
| `nav-drawer.tsx` | ~280 | ✅ Well-scoped |
| `command-palette.tsx` | ~360 | ✅ Acceptable — single responsibility |

**Recommendation (Medium):** Extract from `chat-screen.tsx`:
- Multi-agent SSE handler → `use-multi-agent-chat.ts` hook
- Auto-scroll logic → `use-auto-scroll.ts` hook  
- Thread title fetching → `use-thread-title.ts` hook

**Affected files:** `apps/web/src/components/chat/chat-screen.tsx`, `composer.tsx`, `chat-top-bar.tsx`

### 2.3 Props Drilling

**Finding:** ChatScreen passes callbacks (`onCopy`, `onRegenerate`, `onEdit`) through MessageList → Message → action buttons. This requires careful memoization.

**Assessment:** ⚠️ **Mild concern**. The depth is manageable (3 levels), but the callback reference stability relies on `useCallback` in ChatScreen. The custom `memo` comparator in `Message` explicitly checks for callback reference changes. Consider a lightweight chat context to avoid prop threading.

**Affected files:** `chat-screen.tsx` → `message-list.tsx` → `message.tsx`

---

## 3. State Management

### 3.1 TanStack Query

**Finding:** Used for all server data fetching (prices, candles, structure, journal entries, alerts, etc.). Configured with sensible defaults: 30s stale time, 5min GC, exponential retry with 10s cap, no refetch on window focus.

**Assessment:** ✅ **Excellent**. The query client is stable across navigations (created in `useState`). Polling is tuned per-use-case (3s for prices, per-timeframe for candles). The `enabled` flag pattern in `useCandles` pairs with IntersectionObserver to stop polling offscreen charts.

**Affected files:** `apps/web/src/components/providers/query-provider.tsx`, `apps/web/src/hooks/use-prices.ts`, `use-candles.ts`

### 3.2 Context Usage

**Finding:** Three React contexts used:
- `NavDrawerContext` — split into State/Actions contexts (prevents unnecessary re-renders)
- `TimeContext` + `ReducedMotionContext` — shared clock + motion preference
- `BookmarksContext` — news article bookmarks

**Assessment:** ✅ **Good pattern**. The State/Actions split in NavDrawerContext is a best practice. The contexts are lean and focused.

### 3.3 Local State

**Finding:** `useLocalStorage` hook used for dashboard layout, AI preferences, and other user settings. Individual components use `useState` for UI state (modals, editing mode, etc.).

**Assessment:** ✅ **Appropriate**. No global state library needed. The existing patterns cover all requirements cleanly.

### 3.4 URL State

**Finding:** `nuqs` (via `NuqsAdapter`) is integrated for URL-based state management. Used for settings pages and search parameters.

**Assessment:** ✅ **Good**. URL state enables shareable, bookmarkable views. Properly integrated with the provider hierarchy.

**Affected files:** `apps/web/src/components/providers/index.tsx`

---

## 4. Accessibility

### 4.1 ARIA Labels

**Finding:** 168+ `aria-label` attributes found across the codebase, covering:
- Navigation elements (menu, drawer, toolbar)
- Interactive controls (buttons, toggles, inputs)
- Status indicators (loading, streaming, errors)
- Data visualizations (sparklines, gauges, heatmaps)

**Assessment:** ✅ **Excellent**. This is a standout strength. Every interactive element has an accessible name.

### 4.2 Skip Navigation

**Finding:** `SkipToContent` component renders as first focusable element in the (app) layout. Visible on focus only per WCAG 2.4.1. Tested in E2E accessibility spec.

**Assessment:** ✅ **Excellent**.

**Affected files:** `apps/web/src/components/layout/skip-to-content.tsx`

### 4.3 Keyboard Navigation

**Finding:** 
- `NavDrawer` (vaul Drawer) provides focus trap, swipe-to-dismiss, Escape-to-close
- `ChatTopBar` overflow menu has full keyboard nav (Arrow Up/Down, Escape, Tab with wrapping)
- `CommandPalette` has combobox pattern (Arrow Up/Down, Enter, Escape) with `aria-activedescendant`
- Slash command menu in `Composer` has keyboard navigation
- `DashboardCanvas` has KeyboardSensor for drag-and-drop reordering

**Assessment:** ✅ **Excellent**. Keyboard navigation is comprehensive and follows ARIA authoring practices.

### 4.4 Live Regions

**Finding:**
- `StreamingLiveRegion` (sr-only, `aria-live="polite"`) announces streamed assistant text
- `Toaster` has sr-only `aria-live="polite"` for toast announcements
- `OfflineBanner` uses `role="status"` + `aria-live="polite"`
- Chat error messages use `role="alert"`

**Assessment:** ✅ **Excellent**.

### 4.5 Heading Hierarchy

**Finding:** E2E tests verify no duplicate `<h1>` on key pages and at least one heading per page. The codebase uses semantic heading levels (`h1`, `h2`, `h3`).

**Assessment:** ✅ **Good**. E2E-verified heading structure.

### 4.6 Color Contrast

**Finding:** The dark-only design system uses `#F0F0F0` text on `#0A0A0A` background (≈21:1 contrast ratio). Brand color `#F56E0F` on white `#FFFFFF` has ≈3.5:1 (acceptable for large UI elements). Market signal colors (bull `#22C55E`, bear `#EF4444`) are reserved exclusively for price/P&L data.

**Assessment:** ✅ **Good contrast**. The distinction between market signal colors (price data) and system status colors (UI feedback) is a thoughtful touch.

### 4.7 Accessibility E2E Tests

**Finding:** `accessibility.spec.ts` has 8 test cases covering:
- Login/register form labels
- Skip-to-content link focus visibility
- Main content landmark
- Chat textbox role
- Settings form labels
- Heading hierarchy
- No duplicate h1

**Assessment:** ✅ **Good foundation**. Could be expanded with axe-core automated checks.

---

## 5. Responsiveness & Mobile UX

### 5.1 Viewport & Safe Area

**Finding:** 
- `<meta name="viewport">` with `viewport-fit: cover` and `maximumScale: 5`
- CSS custom properties for safe area: `--topbar-h`, `--fab-bottom`, `--toast-bottom`
- Utility classes: `pt-safe`, `pb-safe`, `pl-safe`, `pr-safe`
- Inline `env(safe-area-inset-*)` on layout containers, composer, and FAB

**Assessment:** ✅ **Excellent**. Proper notch/island handling across all surfaces.

### 5.2 PWA Support

**Finding:**
- `manifest.ts` with proper icons (192px, 512px, apple-touch-icon)
- Service worker registration with update detection and "Reload" toast
- iOS splash screens for iPhone 12-15 Pro/Pro Max and iPad Pro
- `InstallNudge` component for PWA install prompt
- Offline page at `(app)/offline/page.tsx`

**Assessment:** ✅ **Excellent**. Production-grade PWA implementation.

### 5.3 Touch Detection

**Finding:** The app detects touch devices using `(pointer: coarse)` media query:
- Hides desktop-only keyboard hints on touch
- Hides auto-focus behavior on touch (avoids unwanted keyboard popup)
- Shows touch-only quick-switch button for command palette

**Assessment:** ✅ **Good pattern**. Pointer-based detection is more reliable than screen-size-based.

### 5.4 Responsive Layout

**Finding:** 
- Dashboard grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Chat: `xl:grid-cols-12` layout (sidebar + main + empty space for future panels)
- Nav drawer: `w-[88vw] max-w-[340px]` on mobile
- Settings nav: horizontal scroll on mobile (`overflow-x-auto snap-x`)
- Toaster: bottom-center on mobile, bottom-right on desktop

**Assessment:** ✅ **Good**. Responsive breakpoints are well-chosen.

### 5.5 E2E Responsive Tests

**Finding:** `responsive.spec.ts` verifies:
- No horizontal scroll on 7 key pages at mobile viewport
- Chat composer is within viewport bounds
- Settings form inputs don't overflow

**Assessment:** ✅ **Good**.

---

## 6. Routing & Hydration

### 6.1 App Router Usage

**Finding:** Full Next.js 15 App Router patterns:
- Route groups: `(app)`, `(auth)`
- Dynamic routes: `[threadId]`, `[symbol]`, `[id]`
- Layout nesting: root → (app) → settings → settings sub-pages
- Route-level error boundaries at every level
- Route-level `loading.tsx` at 20+ routes

**Assessment:** ✅ **Excellent**. Proper App Router patterns throughout.

### 6.2 View Transitions

**Finding:** `next-view-transitions` wraps the root layout. Named view transitions on:
- `chat-composer`, `chat-planner`, `alert-row-active`
- Main content area uses `viewTransitionName: 'main-content'`

**Assessment:** ✅ **Good**. Smooth page transitions without layout shift.

### 6.3 Hydration Safety

**Finding:** 
- `<html suppressHydrationWarning>` for dark mode class
- `useVoiceInput` sets `supported` to `undefined` during SSR, settles to boolean on client
- `SwRegister` gates `window` access, uses `requestIdleCallback` with `setTimeout` fallback
- `useLocalStorage` returns `hydrated: boolean` for SSR-safe rendering
- Dashboard layout deferred until hydration flag is true

**Assessment:** ✅ **Good**. Careful hydration handling, especially for the voice input and localStorage.

### 6.4 Loading States

**Finding:** 20+ `loading.tsx` files across routes. The `Skeleton` and `SkeletonCard` primitives are used for consistent shimmer animations. The chat route has its own `loading.tsx`.

However, some `loading.tsx` files use inline loading states rather than the shared `<Skeleton>` component.

**Assessment:** ✅ **Good coverage**. Standardize all loading.tsx files to use `<SkeletonCard>`.

### 6.5 ISR / Revalidation

**Finding:** Several settings pages use `export const revalidate = 60`. News page uses `revalidate = 300`. Dynamic routes (`generateMetadata`) on chat threads, chart symbols, and share pages.

**Assessment:** ✅ **Good**. Appropriate caching strategies.

---

## 7. Asset Loading

### 7.1 Images

**Finding:** `next/image` used sparingly — only in auth layout (logo) and journal entry-form (chart thumbnails). The auth layout logo uses `priority` for LCP optimization.

Chat image uploads go through `/api/upload` to Supabase Storage, returning public URLs rendered as `<img>` tags in the composer thumbnail rail.

**Assessment:** ⚠️ **Minor concern**. The thumbnail images in the composer don't use `next/image`. Consider wrapping them for optimization, or document the rationale (dynamic URLs from Supabase Storage are already CDN-served).

### 7.2 Font Loading

**Finding:** `JetBrains_Mono` loaded via `next/font/google` with `display: 'swap'`, variable font, and `adjustFontFallback: false`. Used as both sans and mono font for the terminal aesthetic.

**Assessment:** ✅ **Excellent**. No layout shift from font loading. The swap strategy ensures text is visible immediately.

### 7.3 Service Worker

**Finding:** Registered lazily via `requestIdleCallback`. Update detection triggers a toast with "Reload" action. SW file (`/sw.js`) has proper cache headers (`no-cache, no-store, must-revalidate`).

**Assessment:** ✅ **Good**. Proper SW lifecycle management.

### 7.4 Bundle Analysis

**Finding:** `@next/bundle-analyzer` configured, gated behind `ANALYZE=true` env var. Not currently integrated into CI. No size budgets enforced.

**Recommendation (Low):** Add bundle size budgets to CI or at minimum run periodic bundle analysis.

---

## 8. Error Handling

### 8.1 Error Boundaries

**Finding:** Three-tier error boundary system:
| Level | File | Scope |
|-------|------|-------|
| Global | `global-error.tsx` | Catastrophic failures, renders standalone HTML |
| Root | `error.tsx` | App-wide, keeps basic styling |
| Route | `(app)/error.tsx` | Per-group, keeps chrome intact |
| Per-route | `chat/error.tsx`, etc. | Page-specific fallback |

All levels report to Sentry via `Sentry.captureException(error)`.

**Assessment:** ✅ **Excellent**. This is one of the best error boundary implementations I've seen. The per-segment boundary in `(app)/error.tsx` keeps the top bar and nav visible during errors — much better UX than a blank screen.

### 8.2 Inline Error States

**Finding:**
- Chat errors show as animated alert with retry and dismiss buttons
- Dashboard: per-widget fetch errors shown in a warning banner
- API key testing: inline success/error indicators
- Alert form: field-level validation errors
- Composer: image upload errors shown inline

**Assessment:** ✅ **Excellent**. Errors are surfaced close to the affected UI, not just in toasts.

### 8.3 Network Error Handling

**Finding:** `OfflineBanner` monitors `navigator.onLine` and shows a persistent pill with retry button. Positioned above the toast area.

**Assessment:** ✅ **Good**.

### 8.4 Toast Notifications

**Finding:** Sonner toaster with:
- Screen-reader announcement via sr-only live region
- Position: bottom-center (mobile) / bottom-right (desktop)
- Color-coded borders (success/danger/info/warning)
- Rich colors enabled

**Assessment:** ✅ **Good**.

---

## 9. User Experience

### 9.1 Empty States

**Finding:** Chat has a full empty state with logo mark, title, subtitle, and `QuickPrompts`. The `<EmptyState>` UI component exists for reuse. Chart has `<ChartEmpty>` and `<ChartError>` components.

**Assessment:** ✅ **Good**. Empty states are designed, not just empty pages.

### 9.2 Micro-interactions

**Finding:**
- `AnimatedNumber` for price transitions
- `motion/react` spring animations on messages (fade + slide up)
- Send/Stop button morph animation (AnimatePresence `popLayout`)
- Slash command menu with hover/focus states
- Copy button with temporary checkmark feedback
- Stale data indicator with pulse animation
- Voice input mic with pulse ring animation
- Scroll-to-bottom FAB with scroll-driven animation

**Assessment:** ✅ **Excellent**. Rich micro-interactions without overdoing it. All animations respect `prefers-reduced-motion`.

### 9.3 Composer UX

**Finding:** The chat composer is feature-rich:
- Slash commands (`/chart`, `/journal`, `/settings`, `/analyze`) with autocomplete dropdown
- Image attachment with drag-drop and paste support
- Voice input with Web Speech API
- Character count with soft/hard limits
- Keyboard hint (Enter to send)
- Stop button during streaming
- Pre-upload pattern (images go to storage before sending)

**Assessment:** ✅ **Excellent**. The composer rivals production chat apps in UX quality.

### 9.4 Dashboard UX

**Finding:** Customizable dashboard with:
- Drag-and-drop widget reordering (dnd-kit)
- Per-widget span toggle (1↔2 columns)
- Add/remove widgets
- Layout persistence in localStorage
- Reset to defaults with confirmation
- Leverage gauge summary row

**Assessment:** ✅ **Excellent**. Well-implemented customizable dashboard.

### 9.5 Command Palette

**Finding:** ⌘K/ Ctrl-K command palette with:
- Fuzzy search across navigation commands
- Keyboard navigation (Arrow, Enter, Escape)
- Grouped results (Navigate, Create, Settings)
- Highlighted match characters
- Touch fallback (floating button)
- `aria-combobox` pattern

**Assessment:** ✅ **Excellent**.

---

## 10. Code Quality & Maintainability

### 10.1 TypeScript Usage

**Finding:** Strict mode enabled. `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`. Proper typing of AI SDK UIMessage parts, tool outputs, and stream states.

**Assessment:** ✅ **Good**. The `UIMessage` part typing with discriminated unions is well-done. Some `as unknown as` casts exist (e.g., in `message.tsx` for plan/citation warning parts) — these are type-safe workarounds for the AI SDK's generic part types.

### 10.2 Import Organization

**Finding:** Imports are well-organized with clear groupings (React → third-party → local). Some files have large import blocks (20+ lines) which could benefit from barrel exports.

**Assessment:** ✅ **Good**.

### 10.3 Naming Conventions

**Finding:** Consistent patterns throughout:
- Components: PascalCase, kebab-case files
- Hooks: `use*` prefix
- Contexts: `*Provider`, `use*State`, `use*Actions`
- Test files: `*.test.ts` / `*.spec.ts`
- Private: `_components/`, `_extensions.ts`, `_shared.tsx`

**Assessment:** ✅ **Good**.

### 10.4 Code Comments

**Finding:** Extensive JSDoc-style block comments on most components explaining architecture decisions, layout rationale, and phase references (e.g., "Phase B — UX_UPGRADE_PLAN.md item 11"). This is excellent for maintainability.

**Assessment:** ✅ **Excellent**. Documentation density is above average.

### 10.5 Test Coverage

**Finding:**
- 21 E2E Playwright spec files covering auth, chat, navigation, accessibility, responsiveness, dashboard, settings, admin, service worker, theme tokens, multi-agent, and onboarding
- Vitest unit tests exist for lib utilities (`settings-actions.test.ts`, `composer-helpers.test.ts`)
- 9 custom hooks with `<10 unit test files directly targeting hooks`
- No React Testing Library component tests found

**Assessment:** ⚠️ **E2E-strong, unit-weak**. The E2E coverage is excellent, but there's a gap in:
- Component unit tests (Button, Input, Skeleton, etc.)
- Hook unit tests (usePrices, useCandles, useVoiceInput)
- Utility function tests (format, datetime, cn)

**Recommendation (Medium):** Add unit tests for UI primitives and custom hooks. The project has vitest configured and test-utils available.

### 10.6 DRY / Code Reuse

**Finding:** Good reuse of UI primitives (`Button`, `Skeleton`, `StatCard`, `Tooltip`, `SymbolChip`, `EmptyState`). The `cn()` utility is used pervasively for class composition. The `useConfirm` hook/component provides consistent confirmation dialogs.

**Assessment:** ✅ **Good**. Some patterns could be further extracted:
- The "click-outside + escape-to-close" pattern is duplicated in `chat-top-bar.tsx` (overflow menu, analysis mode menu). Could be a `usePopupMenu` hook.
- The debounced search pattern appears in both `command-palette.tsx` and `chat-top-bar.tsx`.

---

## 11. Security Headers & CSP

### 11.1 Content Security Policy

**Finding:** CSP configured in `next.config.mjs`:
```
default-src 'self'; 
script-src 'self' 'unsafe-eval' 'unsafe-inline' https://s3.tradingview.com; 
style-src 'self' 'unsafe-inline' https://s3.tradingview.com; 
img-src 'self' data: blob: https:; 
font-src 'self' data:; 
connect-src 'self' wss: https:;
```

**Assessment:** ⚠️ **Room for improvement**. `'unsafe-inline'` and `'unsafe-eval'` are currently needed for Tailwind dark mode toggle, TradingView widget, and service worker. The codebase has a TODO to implement nonce-based CSP.

### 11.2 Other Security Headers

**Finding:**
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(self), geolocation=()`
- CSRF token on all state-changing requests

**Assessment:** ✅ **Good**.

---

## 12. Summary of Findings by Severity

### Critical (0)
No critical issues found.

### High (2)
| # | Finding | Recommendation |
|---|---------|---------------|
| H1 | Only 1 `<Suspense>` boundary in the entire app | Add Suspense around dynamic imports and data-fetching components to enable streaming SSR and prevent layout shifts |
| H2 | ChatScreen component is excessively large (~700 lines) with mixed concerns | Extract multi-agent SSE, auto-scroll, and thread title fetching into custom hooks |

### Medium (4)
| # | Finding | Recommendation |
|---|---------|---------------|
| M1 | 172 `"use client"` directives — most components are client-rendered | Audit non-interactive components that could be server components |
| M2 | Limited unit test coverage for hooks and UI primitives | Add vitest tests for custom hooks, Button, Input, Skeleton, and utility functions |
| M3 | Composer (~550 lines) and ChatTopBar (~650 lines) exceed maintainability comfort zone | Extract slash command handling into `use-slash-commands.ts`, voice input state into the useVoiceInput hook |
| M4 | Popup menu pattern duplicated across chat-top-bar | Extract `usePopupMenu` hook for click-outside + escape-to-close + focus management |

### Low (3)
| # | Finding | Recommendation |
|---|---------|---------------|
| L1 | No bundle size budgets or CI bundle analysis | Add periodic bundle analysis as CI step |
| L2 | Chat thumbnail images use plain `<img>` instead of `next/image` | Evaluate using next/image or document CDN rationale |
| L3 | Some loading.tsx files use inline loading states instead of shared `<SkeletonCard>` | Standardize on `<SkeletonCard>` |

### Positive Highlights (No Action Needed)
1. ✅ 168+ aria-labels with comprehensive keyboard navigation
2. ✅ Three-tier error boundary system with Sentry integration
3. ✅ TanStack Query with per-use-case stale/polling configuration
4. ✅ Virtualized message list with dynamic size estimation
5. ✅ PWA support with splash screens, service worker, offline detection
6. ✅ Cohesive dark-only design system with CSS custom properties
7. ✅ `prefers-reduced-motion` respected across all animations
8. ✅ Hydration-safe patterns (voice input, localStorage, SW registration)
9. ✅ Feature-rich composer with slash commands, voice, and image upload
10. ✅ Customizable dashboard with drag-and-drop and localStorage persistence
11. ✅ ⌘K command palette with fuzzy search and keyboard navigation
12. ✅ Split State/Actions context pattern (NavDrawerContext)
13. ✅ Excellent code documentation and architectural comments

---

## Appendix A: File Heatmap

| File | Lines | Complexity | Risk |
|------|-------|-----------|------|
| `chat-screen.tsx` | 700 | 🔴 High | Extract hooks |
| `chat-top-bar.tsx` | 650 | 🔴 High | Extract ThreadSwitcher |
| `composer.tsx` | 550 | 🟡 Medium | Extract slash commands |
| `dashboard-canvas.tsx` | 480 | 🟢 Low | Well-scoped |
| `chart-view.tsx` | 350 | 🟡 Medium | Acceptable |
| `command-palette.tsx` | 360 | 🟢 Low | Single responsibility |
| `nav-drawer.tsx` | 280 | 🟢 Low | Well-scoped |
| `message.tsx` | 480 | 🟡 Medium | Part dispatch is complex |
| `message-list.tsx` | 140 | 🟢 Low | Clean virtualization |

## Appendix B: Hook Inventory

| Hook | Purpose | Test Coverage |
|------|---------|--------------|
| `usePrices` | Poll live prices (3s) | None |
| `useCandles` | Fetch candle data | None |
| `useChartData` | Combined candles + indicators | None |
| `useStructure` | Market structure data | None |
| `usePriceStream` | Real-time price stream | None |
| `useVoiceInput` | Web Speech API | None |
| `useLocalStorage` | SSR-safe localStorage | None |
| `useCopied` | Copy feedback state | None |
| `useTf` | Timeframe state | None |

## Appendix C: Context Inventory

| Context | Provider File | Consumers |
|---------|--------------|-----------|
| `QueryClientProvider` | `providers/query-provider.tsx` | All data hooks |
| `NavDrawerContext` (State + Actions) | `layout/nav-drawer-context.tsx` | NavTrigger, NavDrawer |
| `TimeContext` + `ReducedMotionContext` | `providers/time-provider.tsx` | Message footer, formatRelative |
| `BookmarksContext` | `news/bookmarks-context.tsx` | Article cards |
| `NuqsAdapter` | `providers/index.tsx` | URL state users |

---

**Report generated by Buffy (Freebuff) on July 18, 2026.**
