# Frontend Fix Plans — HamaFX-Ai

Complete deep-dive analysis and fix plans for all 244 frontend source files.

## Analysis Summary

- **Repo:** HamaFx/HamaFX-Ai
- **Stack:** Next.js 15 + React 19 + Tailwind v4 + lightweight-charts
- **Files analyzed:** 244
- **Total findings:** 164 issues (34 bugs, 63 improvements, 41 polish, 27 upgrades)

## Phase Execution Order

| Phase | File | Focus | Tasks | Priority |
|-------|------|-------|-------|----------|
| 1 | `phase-1-critical-security-auth.md` | Security & Authentication | 15 | P0 |
| 2 | `phase-2-chart-trading-fixes.md` | Chart & Trading Components | 23 | P1 |
| 3 | `phase-3-chat-composer-fixes.md` | Chat & Composer System | 35 | P2 |
| 4 | `phase-4-layout-settings-ui-fixes.md` | Layout, Settings & UI Library | 36 | P2 |
| 5 | `phase-5-news-journal-cross-cutting.md` | News, Journal, Calendar, Alerts & Cross-cutting | 42 | P3 |

## Top 10 Critical Fixes

| # | Issue | Phase |
|---|-------|-------|
| 1 | Auth bypass via `__system__` fallback | Phase 1 |
| 2 | Wrong onboarding redirect (`/auth/login` → `/login`) | Phase 1 |
| 3 | CSRF first-request failure | Phase 1 |
| 4 | Chart sub-pane subscription leak | Phase 2 |
| 5 | Chart recreation on every candle update | Phase 2 |
| 6 | `applyDecimals` never called (wrong forex precision) | Phase 2 |
| 7 | Uncleared `setTimeout` in copy buttons | Phase 3 |
| 8 | No `React.memo` on Message (re-render storm) | Phase 3 |
| 9 | Missing `color-scheme: dark` | Phase 4 |
| 10 | Dashboard hardcoded placeholder data | Phase 5 |

## How to Use

1. Start with **Phase 1** — fix all security issues before any deployment
2. Proceed to **Phase 2** — fix chart performance and correctness bugs
3. Then **Phase 3** — fix chat re-renders, memory leaks, and accessibility
4. Then **Phase 4** — fix UI library, settings, and layout issues
5. Finish with **Phase 5** — fix feature pages and cross-cutting concerns

Each task includes:
- **Problem** description with code snippets
- **Fix** with detailed implementation code
- **Verification** steps to confirm the fix works
- **File paths** with approximate line numbers

## Parallelization

Phases 2 and 3 touch different files and can be executed in parallel by different developers. All other phases should be executed sequentially.
