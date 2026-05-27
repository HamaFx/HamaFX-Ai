# Requirements Document — Phase 5: UI/UX Polish & Design System

## Introduction

Phase 5 is a **design-system overhaul**. No new features. The goal is to take the working but utilitarian UI from Phases 1–4 and turn it into a polished, mobile-first experience that feels native on **iPhone 14 Pro Max** (430×932 viewport, Dynamic Island, home indicator). Phase 4 fixed reliability; Phase 5 fixes how the app *feels*.

The web research surfaced three consistent fintech design principles for 2026:

1. **Trust through clarity** — clean typography, generous whitespace, no decoration that obscures data. (Wise, Robinhood patterns.)
2. **Native gestures** — bottom sheets that slide up from the dock, swipe-to-dismiss, pull-to-refresh, haptic-style spring animations. (Linear, Apple Wallet patterns.)
3. **Fast feedback** — micro-interactions on every tap, animated number transitions for prices, optimistic UI on writes.

Stack additions in scope: `motion/react` (formerly framer-motion v12) for animations, `lucide-react` for the icon set, `vaul` for bottom sheets/drawers, `sonner` for toasts. All four are tree-shakeable, ~5KB gzipped each, and battle-tested in shadcn/ui.

The hard rules from `00-project.md` still apply: mobile-first, Tailwind tokens only (no raw colors), `tabular-nums` for numbers, ≥44×44 tap targets, visible focus rings, server components by default, URL state via `nuqs`.

## Glossary

- **Design system** — the unified set of tokens, components, motion patterns, and icon set used across every page.
- **Safe-area insets** — the `env(safe-area-inset-*)` CSS values that account for the Dynamic Island, home indicator, and rounded corners.
- **Bottom sheet** — a panel that slides up from the bottom dock, dismissible by swipe-down. Native-feeling alternative to centered dialogs on mobile.
- **Pull-to-refresh** — the gesture where dragging down at the top of a scrollable list triggers a refresh.
- **Haptic-style spring** — a motion curve that mimics iOS's UIKit spring (overshoot + settle) without actually triggering haptic feedback (which web can't do).
- **Animated number** — a number that smoothly tweens between values when it changes (e.g. live price updates).
- **Skeleton screen** — a content-shaped placeholder shown while data loads. Better perceived perf than a spinner.
- **Optimistic UI** — updating the UI immediately on user action and reconciling with the server response asynchronously.
- **Micro-interaction** — a subtle animation or visual response to a user action (button press, toggle, hover).

## Requirements

### Requirement 1: Design tokens & typography

**User Story:** As the single user, I want consistent spacing, colors, and type that feel modern and premium so the app reads like a real product.

#### Acceptance Criteria

1. THE design tokens in `packages/config/tailwind/tokens.ts` and `apps/web/src/app/globals.css` SHALL be the single source of truth — no component shall hard-code colors or spacing.
2. THE color palette SHALL retain the existing dark-mode OKLCH baseline but add: `--color-bg-elev-3` (slightly higher elevation for sticky headers), `--color-divider` (subtle separator distinct from `--color-border`), `--color-overlay` (modal/sheet backdrop with controlled alpha).
3. THE typography scale SHALL be defined explicitly: `text-xs` (11px), `text-sm` (13px), `text-base` (15px), `text-lg` (17px), `text-xl` (22px), `text-2xl` (28px), `text-3xl` (36px). Mobile-first; no `md:` overrides for body text.
4. THE app SHALL load **Inter Variable** (with `font-display: swap`) as the primary sans font for tight visual rhythm, and **JetBrains Mono Variable** for the `font-mono` token (used in tool cards, raw JSON, model ids).
5. THE `tabular-nums` class SHALL stay applied to every numeric readout (prices, deltas, R-multiples, token counts, percentages).
6. ALL text SHALL respect `prefers-reduced-motion` — disable animations and reduce parallax for users who opt out.

### Requirement 2: Safe-area + Dynamic Island handling

**User Story:** As the single user on iPhone 14 Pro Max, I want the app to respect the Dynamic Island and home indicator so nothing critical sits behind hardware features.

#### Acceptance Criteria

1. THE `<head>` SHALL include `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` so `env(safe-area-inset-*)` returns the correct values.
2. THE TopBar SHALL use `padding-top: env(safe-area-inset-top)` and the BottomNav SHALL use `padding-bottom: env(safe-area-inset-bottom)` (already partially done — verify and audit).
3. THE login page SHALL use `min-h-svh` (small-viewport height) to avoid the keyboard pushing content under the BottomNav.
4. THE chat surface's height calculation SHALL use `100svh` minus dynamic chrome heights so the composer sits flush above the home indicator on every keyboard state.
5. ALL fixed-position elements (FAB, toasts, bottom sheets) SHALL clear the home indicator with `bottom: calc(<offset> + env(safe-area-inset-bottom))`.
6. WHEN the user is in a PWA standalone mode (`display-mode: standalone`), THE app SHALL detect this via CSS media query and render a small visual delta — no separate codebase, just a class hook for tweaks.

### Requirement 3: Iconography & visual identity

**User Story:** As the single user, I want a coherent, consistent icon set across every page so the app feels designed, not assembled.

#### Acceptance Criteria

1. THE app SHALL adopt **lucide-react** as the exclusive icon library. All inline SVG icons in components shall be replaced with named `lucide-react` exports.
2. THE BottomNav SHALL use icons that are visually balanced (consistent stroke width, optical sizing) — `MessageCircle`, `LineChart`, `Newspaper`, `Calendar`, `MoreHorizontal`.
3. THE chart toolbar SHALL use `Settings2` (overlays), `Maximize2` (Pro), `RefreshCw` (refresh).
4. THE alerts list SHALL use `Bell` (armed), `BellOff` (paused), `BellRing` (fired), `Trash2` (delete).
5. THE journal stats SHALL use `TrendingUp` / `TrendingDown` / `Minus` instead of text labels for tone indicators.
6. ICON sizes SHALL be standardized: 16px for inline buttons, 20px for navigation/cards, 24px for headers.

### Requirement 4: Motion & micro-interactions

**User Story:** As the single user, I want every tap and state change to feel responsive and alive so the app doesn't feel static.

#### Acceptance Criteria

1. THE app SHALL install `motion/react` (Motion v12) with `LazyMotion` + `domAnimation` features for smaller bundle size.
2. ALL button presses SHALL render a subtle scale-down (`whileTap={{ scale: 0.97 }}`) with a 150ms haptic-style spring (`stiffness: 400, damping: 30`).
3. PAGE transitions SHALL render an opacity+vertical-slide enter animation (8px slide, 220ms) — only on first paint, not on `popstate`.
4. PRICE updates SHALL animate the digit change (vertical roll, 200ms) so the eye catches the move. Limit to the price tag and the chart header.
5. CHART overlays toggling on/off SHALL fade in over 180ms (no slide, would be janky on lightweight-charts).
6. CHAT messages SHALL slide-up + fade-in on first render (12px, 240ms, staggered 30ms per message — only the most recent N).
7. TYPING indicator (three dots) SHALL pulse with a staggered keyframe animation, not all dots in sync.
8. ALL animations SHALL be skipped when `useReducedMotion()` returns true.

### Requirement 5: Bottom sheets & drawers (replace dialogs on mobile)

**User Story:** As the single user, I want context-shifting actions to slide up from the bottom dock so they feel native and don't blow away the page state.

#### Acceptance Criteria

1. THE app SHALL install `vaul` (the library shadcn/ui's `Drawer` is built on) and create a wrapping `<Drawer>` shadcn-style component at `apps/web/src/components/ui/drawer.tsx`.
2. THE alert creation form SHALL render in a bottom sheet triggered by a floating "+" button, not as an inline form above the list. Sheet dismissed by swipe-down or backdrop tap.
3. THE journal entry form SHALL render in a bottom sheet triggered by a "+" button. Same swipe-to-dismiss UX.
4. THE chart's overlay toggles SHALL move into a bottom sheet triggered by a `Settings2` icon in the chart header — frees vertical space below the chart.
5. ALL bottom sheets SHALL respect safe-area-bottom + leave a visible 8px gap above the home indicator.
6. ALL bottom sheets SHALL trap focus, return focus to trigger on close, and close on Escape.

### Requirement 6: Toast notifications

**User Story:** As the single user, I want non-blocking confirmation toasts for writes (alert created, journal saved, refresh succeeded) so I get feedback without inline status text cluttering the page.

#### Acceptance Criteria

1. THE app SHALL install `sonner` and mount `<Toaster />` once in the root `(app)/layout.tsx`.
2. SUCCESSFUL writes (alert created, journal entry created, refresh complete) SHALL fire a `toast.success(...)` with a brief message.
3. FAILED writes SHALL fire `toast.error(...)` with the actual error message.
4. TOASTS SHALL render bottom-center on mobile (above BottomNav, respecting safe-area-bottom), and bottom-right on desktop.
5. TOASTS SHALL auto-dismiss after 3000ms, or persist if `important: true`.
6. THE existing inline status indicators (RefreshButton's "ok" / "error" text) SHALL be removed in favor of toasts.

### Requirement 7: Page-by-page polish

**User Story:** As the single user, I want every page to follow the design system consistently so the app feels coherent.

#### 7.1 Login page

1. THE login form SHALL render on a centered, gradient-edged card with subtle ambient glow (no skeuomorphism, just 1 soft radial gradient behind the card).
2. THE app brand SHALL show the Hama icon (192px PNG already exists at `/icons/icon-192.png`) above the title.
3. THE input SHALL be a standard size with an animated border-color change on focus (tween to brand, 180ms).
4. THE login button SHALL show a brief checkmark + green flash on success before redirecting.

#### 7.2 Chat page

1. THE chat surface SHALL render messages in iOS-Messages-style chat bubbles: user bubbles right-aligned with `bg-brand`, assistant bubbles left-aligned with `bg-bg-elev-1`, max-width 85%.
2. THE composer SHALL "lift" off the dock with a subtle shadow when focused or scrolled.
3. THE quick-prompt chips SHALL animate in (slide-up + fade) when the thread is empty, and out (fade) when the user starts typing or sends.
4. ATTACHED images in the composer SHALL render with a slight scale-pop animation on add and fade-out on remove.
5. THE typing indicator SHALL appear in a chat bubble shape (matching assistant style) so it reads as "the assistant is composing", not an abstract loader.
6. SCROLLBARS SHALL be hidden on mobile (`scrollbar-width: none`) — the user uses gestures.

#### 7.3 Chart page

1. THE chart header SHALL be a sticky sub-header below the TopBar with the symbol picker, price tag, timeframe picker. Glass-morphism background (`bg-bg-elev-1/85 backdrop-blur`).
2. THE chart container SHALL have a subtle inner-shadow border so it reads as a contained surface, not floating text.
3. THE timeframe picker SHALL animate the selection underline (slide between segments, 180ms spring).
4. THE PriceTag delta SHALL include a small `TrendingUp` / `TrendingDown` icon next to the number.
5. THE overlay toggles SHALL move to a bottom sheet (per Requirement 5.4) — chart header gets cleaner.

#### 7.4 News page

1. THE article cards SHALL gain hover lift (`-translate-y-0.5` + shadow) on desktop only.
2. THE sentiment chip SHALL animate a pulse on first render of an article card so the user notices the sentiment value.
3. THE "Last updated: Xm ago" timestamp SHALL update live every 30 seconds via a small client island, not require a page refresh.

#### 7.5 Calendar page

1. EVENTS SHALL be grouped by day with a sticky day header that scrolls into the page (`position: sticky; top: <header-height>`).
2. THE current-time indicator SHALL appear as a horizontal "now" line through the events list (red 1px line at the position where the current UTC time sits among event times).
3. PAST events SHALL fade to 50% opacity with a striked-through actual-vs-forecast delta to make scanning faster.
4. THE impact dot SHALL animate a pulse for any event within ±15 minutes of the current time.

#### 7.6 Alerts page

1. THE alert list SHALL show empty state with a friendly illustration (using `BellOff` icon at 64px, faded) and a primary CTA button: "Create your first alert".
2. THE create-alert button SHALL be a floating "+" FAB (per Requirement 5.2). The FAB sits 16px above the BottomNav, respecting safe-area.
3. THE alert rule SHALL be displayed with the matching tool icon (price → `TrendingUp`, indicator → `Activity`, candle close → `BarChart3`).
4. SWIPE-LEFT on an alert row (mobile only) SHALL reveal pause/delete actions (use `framer-motion` drag).

#### 7.7 Journal page

1. THE stats summary SHALL render as a 2×2 grid of stat cards on mobile (current 4-col grid is too cramped on phones at 430px wide).
2. EACH stat card SHALL have an icon (Activity, Target, TrendingUp, Calculator), a label, the value, and a sparkline showing the trend over the last N entries (using a 60×16px inline SVG).
3. THE create-entry FAB SHALL match the alerts FAB pattern.
4. THE entry list SHALL use lazy-load: render only the first 20 entries, with an "Load more" button at the bottom (no infinite scroll on mobile — explicit is better).

#### 7.8 Settings page

1. THE settings SHALL be grouped into clearly-labeled sections with section icons (`Bell` for Notifications, `Cpu` for Models, `Palette` for Appearance, `User` for Session).
2. EACH setting row SHALL have left icon + label + description (current pattern), and right slot for the action/toggle/chevron.
3. THE existing test buttons (test email, test telegram, web push enable) SHALL retain their three-state result rendering, but use toasts instead of inline text.

#### 7.9 More page

1. THE More page list rows SHALL gain icons matching the destination (Bell for Alerts, BookOpen for Journal, Cog for Settings).
2. ROW heights SHALL be ≥56px to feel comfortable on mobile.

### Requirement 8: Accessibility & performance

**User Story:** As the single user, I want the app to remain fast and accessible after the visual polish lands.

#### Acceptance Criteria

1. ALL Lighthouse mobile scores SHALL stay ≥ 90 Performance, 100 Accessibility, 100 Best Practices, 100 SEO across the audited routes.
2. THE motion library bundle SHALL stay under 35KB gzipped (LazyMotion + domAnimation features only).
3. THE icon library SHALL be tree-shaken — only imported icons ship to the client.
4. ALL animations SHALL respect `prefers-reduced-motion: reduce` and skip to the final state instantly.
5. ALL interactive elements SHALL maintain ≥ 44×44px tap targets.
6. ALL focus states SHALL be visible (2px brand-color outline with 2px offset, already in globals.css).
7. CONTRAST ratios SHALL meet WCAG AA: ≥4.5:1 for body text on every surface elevation, ≥3:1 for large text.

### Requirement 9: Documentation

**User Story:** As another agent picking up the repo, I want a single design-system doc that covers tokens, motion, and component conventions.

#### Acceptance Criteria

1. `docs/05-ui-ux.md` SHALL be expanded to a full design-system reference: token table, type scale, motion vocabulary, icon usage rules, bottom-sheet vs dialog decision tree.
2. `.kiro/steering/30-ui.md` SHALL be updated with the new motion/icon/sheet rules so future work follows the system.
3. `docs/10-roadmap.md` SHALL flip Phase 5 to ✅ when complete.
