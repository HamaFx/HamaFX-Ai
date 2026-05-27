# 04 — Features

> Features are grouped by **surface area** (Chat, Chart, Market, News, Calendar, Alerts, Journal, Settings) and tagged by phase: 🅼 MVP, 🅑 v1, 🅒 v2.
>
> ✅ = shipped (Phase 1 / 2 / 3 / 5 / 6 reflect actual deployed state).

## Feature map

```mermaid
mindmap
  root((HamaFX-Ai))
    Chat 💬
      Streaming responses ✅
      Tool-call inline UI ✅
      Per-thread memory ✅
      Voice input ✅
      Stop streaming ✅
      Regenerate response ✅
      Light Markdown render ✅
      Multi-thread + search ✅
      RAG over news ✅
      Vision (chart screenshots) ✅
      Auto-submit deep links ✅
    Chart 📈
      lightweight-charts ✅
      Multi-timeframe sync ✅
      Indicator overlays ✅
      Agent annotations ✅
      SMC/ICT layer ✅
      TV pro widget ✅
      Snapshot share ✅
    News 📰
      Curated feed ✅
      Sentiment chips ✅
      Filter by symbol ✅
      Live search ✅
      News pulse strip ✅
      Time bucketing ✅
      Bookmarks (local) ✅
      Auto-refresh ✅
      Ask AI deep-link ✅
    Calendar 📅
      Today + 7d ✅
      Impact filter ✅
      Currency filter ✅
      Hero countdown ✅
      Impact distribution ✅
      Time bucketing ✅
      Beat/miss chip ✅
      Remind me ✅
      Pre-event briefings ✅
      Post-event impact ✅
    Alerts 🔔
      Price + indicator ✅
      Push/web ✅
      Telegram ✅
      Email ✅
    Journal 📓
      Manual entries ✅
      Auto-fill from chat ✅
      Stats + win-rate ✅
      Sparkline cards ✅
      Weekly review ✅
    Settings ⚙️
      System status card ✅
      Usage at a glance ✅
      Notifications hub ✅
      Local preferences ✅
      Data & cache mgmt ✅
      Build id footer ✅
```

---

## Chat 💬

The primary surface — see `07-ai-agent.md` for the agent loop and `05-ui-ux.md` for the UI.

| ID   | Feature                          | Phase | Notes                                                          |
| ---- | -------------------------------- | ----- | -------------------------------------------------------------- |
| C-01 | Streaming text answers (SSE)     | ✅     | Vercel AI SDK `useChat`.                                       |
| C-02 | Inline tool-call UI parts        | ✅     | Each tool renders a typed React part via the registry.         |
| C-03 | Multi-thread (drawer + search)   | ✅     | Drawer auto-shows search input when >5 threads.                |
| C-04 | Auto-titled threads              | ✅     | First-turn LLM-generated title.                                |
| C-05 | Symbol-pinned threads            | ✅     | Thread can be pinned to XAUUSD/EURUSD/GBPUSD.                  |
| C-06 | Quick prompts (chips)            | ✅     | Embedded inside the empty state, not a separate panel.         |
| C-07 | Stop streaming                   | ✅     | Send button morphs to Stop while streaming.                    |
| C-08 | Regenerate last assistant turn   | ✅     | Hover/focus reveals action.                                    |
| C-09 | Voice input (Web Speech)         | ✅     | Mic-pulse ring + Listening… pill.                              |
| C-10 | Light Markdown rendering         | ✅     | bold / italic / code / fenced (with copy) / lists / links.     |
| C-11 | Vision input (chart screenshots) | ✅     | Up to 4 images per turn; `analyze_chart_image` tool.           |
| C-12 | Citations panel                  | ✅     | Source links surfaced from tool outputs.                       |
| C-13 | Ask AI deep-link                 | ✅     | `/chat?prompt=…` → fresh thread that auto-submits the prompt.  |
| C-14 | Auto-scroll only when at bottom  | ✅     | Smooth-scroll suppressed when user has scrolled up.            |

## Chart 📈

| ID    | Feature                              | Phase | Notes                                                  |
| ----- | ------------------------------------ | ----- | ------------------------------------------------------ |
| CH-01 | OHLC candles via lightweight-charts  | ✅     | XAUUSD / EURUSD / GBPUSD only.                         |
| CH-02 | Timeframes 1m → 1w                   | ✅     | URL state via `nuqs`. Picker scrolls horizontally.     |
| CH-03 | EMA / SMA / RSI / MACD / Bollinger   | ✅     | Computed in `packages/indicators`.                     |
| CH-04 | Agent annotations (markers, lines)   | ✅     | Tool: `annotate_chart`.                                |
| CH-05 | Cross-hair sync across panes         | ✅     | lightweight-charts' built-in.                          |
| CH-06 | Order Blocks / FVG / liquidity (SMC) | ✅     | From `packages/indicators/structure`.                  |
| CH-07 | TradingView Advanced Widget          | ✅     | Pro mode at `/chart/[symbol]/pro`, env-gated.          |
| CH-08 | Snapshot share (PNG)                 | ✅     | `share_snapshot` tool + signed `/share/[id]?t=` link.  |
| CH-09 | Stale indicator                      | ✅     | `<StaleIndicator/>` while query is background-refetching. |

## Market 💱

| ID   | Feature                | Phase | Notes                                                  |
| ---- | ---------------------- | ----- | ------------------------------------------------------ |
| M-01 | Live price tiles       | ✅     | `<PriceTag/>` with arrow + delta.                      |
| M-02 | Animated digit tween   | ✅     | `<AnimatedNumber/>` with rest-delta to stop scheduling. |
| M-03 | Cross-pair correlation | ✅     | `get_correlation` tool — Pearson over windowBars.      |
| M-04 | DXY proxy panel        | ✅     | 50/50 EUR/GBP geometric proxy with 24h change.         |

## News 📰

| ID   | Feature                              | Phase | Notes                                          |
| ---- | ------------------------------------ | ----- | ---------------------------------------------- |
| N-01 | Symbol-tagged feed                   | ✅     | Filter for XAU/EUR/GBP/USD.                    |
| N-02 | Sentiment chip per article           | ✅     | Provider sentiment + zero-shot reclassify.     |
| N-03 | News pulse summary                   | ✅     | Top-of-page stacked sentiment bar with lean label. |
| N-04 | Live search                          | ✅     | Filters titles, summaries, and publishers.     |
| N-05 | Time-bucketed sections               | ✅     | Last hour / Today / Yesterday / This week / Older. |
| N-06 | Symbol chip rail (by frequency)      | ✅     | Derived from the loaded set; sorted desc.      |
| N-07 | Local bookmarks                      | ✅     | `localStorage` with cross-tab sync; saved-only filter. |
| N-08 | Auto-refresh                         | ✅     | Every 5 min + manual refresh pill.             |
| N-09 | Ask AI deep-link from card           | ✅     | Pre-fills /chat with headline + URL.           |
| N-10 | Article card sentiment ribbon        | ✅     | 3px green/red ribbon on the left edge.         |
| N-11 | RAG: agent cites recent news         | ✅     | pgvector search via `search_knowledge`.        |

## Calendar 📅

| ID   | Feature                         | Phase | Notes                                                  |
| ---- | ------------------------------- | ----- | ------------------------------------------------------ |
| K-01 | Today + 7d economic events      | ✅     | Filtered to USD / EUR / GBP / Gold-relevant.           |
| K-02 | Impact badges (low/med/high)    | ✅     | Color + glyph (▲/■/•) for color-blind discrimination.  |
| K-03 | Hero countdown to next high-impact | ✅     | Live ticker re-renders every 60s.                    |
| K-04 | Impact distribution bar         | ✅     | Next 14 days, hi/med/low proportional split.           |
| K-05 | Currency + importance + past filters | ✅     | Chip rails plus a "Show past" toggle.             |
| K-06 | Time-bucketed sections          | ✅     | Today / Tomorrow / Later this week / Later / Past.     |
| K-07 | Beat / miss chip                | ✅     | Auto when both `actual` and `forecast` are present.    |
| K-08 | Remind me (5 min before)        | ✅     | Browser Notifications API + local setTimeout.          |
| K-09 | Ask AI deep-link from event     | ✅     | Prefilled with event name and time.                    |
| K-10 | Pre-event briefing              | ✅     | Agent generates 1h before high-impact.                 |
| K-11 | Post-event price impact summary | ✅     | Agent + indicators.                                    |
| K-12 | Auto-refresh                    | ✅     | Every 5 min + manual refresh pill.                     |

## Alerts 🔔

| ID   | Feature                         | Phase | Notes                                                |
| ---- | ------------------------------- | ----- | ---------------------------------------------------- |
| A-01 | Price-cross alert               | ✅     | Tool: `set_alert`.                                   |
| A-02 | Indicator-cross alert (RSI, MA) | ✅     |                                                      |
| A-03 | Candle-close-above/below        | ✅     | Per timeframe.                                       |
| A-04 | Web Push delivery               | ✅     | RFC 8030 + VAPID. Settings → Enable web push.        |
| A-05 | Email delivery                  | ✅     | via Resend.                                          |
| A-06 | Telegram delivery               | ✅     | via Telegram Bot API.                                |
| A-07 | Drawer-confirmed delete         | ✅     | `<ConfirmDrawer/>`, no native `confirm()`.           |

## Journal 📓

| ID   | Feature                            | Phase | Notes                             |
| ---- | ---------------------------------- | ----- | --------------------------------- |
| J-01 | Manual entry (entry/SL/TP/result)  | ✅     | Drawer-based form.                |
| J-02 | Auto-fill from chat command        | ✅     | "Journal: I shorted XAU at 2392…" |
| J-03 | Win rate / R-multiple stats        | ✅     | 2×2 stat-cards with sparklines.   |
| J-04 | Long-stop / short-stop validation  | ✅     | Field-level validation.           |
| J-05 | Drawer-confirmed delete            | ✅     | Replaces native `confirm()`.      |
| J-06 | Weekly review (agent-authored)     | ✅     | Sunday cron.                      |

## Settings ⚙️

Six structured cards:

| ID   | Card                              | Phase | Notes                                                            |
| ---- | --------------------------------- | ----- | ---------------------------------------------------------------- |
| S-01 | System status                     | ✅     | Per-channel Ready/Off chips + DB connectivity + rollup pill.     |
| S-02 | Usage at a glance                 | ✅     | Daily-budget gauge with bull/warn/bear tone; deep-links to /usage. |
| S-03 | Notifications                     | ✅     | Email / Telegram / Web push, each with status pill + test button. |
| S-04 | Preferences                       | ✅     | Default symbol, time format, force-reduce-motion (localStorage). |
| S-05 | Data & cache                      | ✅     | Clear bookmarks / reset prefs / wipe all `hamafx:*` keys (drawer-confirmed). |
| S-06 | Session                           | ✅     | Drawer-confirmed sign-out + build-id footer for bug reports.     |
| S-07 | Detailed usage page               | ✅     | `/settings/usage` — token spend, daily-budget gauge, model breakdown, recent turns. |

## Cross-cutting features

| ID   | Feature                                | Phase | Notes                                                       |
| ---- | -------------------------------------- | ----- | ----------------------------------------------------------- |
| X-01 | PWA install + offline shell            | ✅     | `next-pwa` style, but custom service worker.                |
| X-02 | Single global nav drawer               | ✅     | Replaces Phase 5's bottom nav.                              |
| X-03 | Skip-to-content link                   | ✅     | Visible on focus only (WCAG §2.4.1).                        |
| X-04 | Drawer-confirmed destructive actions   | ✅     | `<ConfirmDrawer/>` + `useConfirm()`. No native `confirm()`. |
| X-05 | Stale indicator across query-driven pages | ✅  | Steering rule §6 enforced.                                  |
| X-06 | Auto-refresh for news + calendar       | ✅     | Every 5 minutes via TanStack Query.                         |
| X-07 | Telegram bot for alert delivery        | ✅     | Cheaper + simpler than web push.                            |
| X-08 | Force-reduce-motion override           | ✅     | `data-reduce-motion="force"` on `<html>` from prefs card.   |
| X-09 | localStorage cross-tab sync            | ✅     | Bookmarks listen to `storage` events.                       |
