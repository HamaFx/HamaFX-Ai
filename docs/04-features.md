# 04 — Features

> Features are grouped by **surface area** (Chat, Chart, Market, News, Calendar, Alerts, Journal, Settings) and tagged by phase: 🅼 MVP, 🅑 v1, 🅒 v2.

## Feature map

```mermaid
mindmap
  root((HamaFX-Ai))
    Chat 💬
      Streaming responses 🅼
      Tool-call inline UI 🅼
      Per-thread memory 🅼
      Voice input 🅑
      Saved replies 🅑
      Multi-thread 🅼
      RAG over news/journal 🅑
    Chart 📈
      lightweight-charts 🅼
      Multi-timeframe sync 🅼
      Indicator overlays 🅼
      Agent annotations 🅼
      SMC/ICT layer 🅑
      TV pro widget 🅒
    Market 💱
      Live price tiles 🅼
      Watchlist 3 pairs 🅼
      Spread + change 🅼
      Heatmap (cross-pair) 🅑
    News 📰
      Curated feed 🅼
      Sentiment chips 🅼
      Filter by symbol 🅼
      RAG-aware summaries 🅑
    Calendar 📅
      Today + 7d 🅼
      Impact filter 🅼
      Pre-event briefings 🅑
      Post-event impact 🅑
    Alerts 🔔
      Price + indicator 🅼
      Push/web 🅑
      AI-suggested alerts 🅑
    Journal 📓
      Manual entries 🅼
      Auto-fill from chat 🅑
      Stats + win-rate 🅑
      Screenshot attach 🅑
    Settings ⚙️
      Theme 🅼
      Model picker 🅼
      Provider keys 🅑
      Indicator defaults 🅼
```

---

## Chat 💬

The primary surface — see `07-ai-agent.md` for internals.

| ID   | Feature                      | Phase | Notes                                         |
| ---- | ---------------------------- | ----- | --------------------------------------------- |
| C-01 | Streaming text answers (SSE) | 🅼     | Vercel AI SDK `useChat`.                      |
| C-02 | Inline tool-call UI parts    | 🅼     | Each tool renders a custom React part.        |
| C-03 | Multi-thread (sidebar)       | 🅼     | Mobile drawer; thread persisted in Postgres.  |
| C-04 | Auto-titled threads          | 🅼     | First-turn title generation.                  |
| C-05 | Symbol-pinned threads        | 🅼     | Thread can be pinned to XAUUSD/EURUSD/GBPUSD. |
| C-06 | Quick prompts (chips)        | 🅼     | "Bias?", "Top-down", "Today's news", ...      |
| C-07 | Resumable streams            | 🅑     | Chat continues across navigation/reload.      |
| C-08 | Voice input (Web Speech)     | ✅     | Mobile-only first.                            |
| C-09 | Voice output (TTS)           | 🅒     | Optional toggle.                              |
| C-10 | Saved snippets / replies     | 🅑     | Reusable user prompts.                        |
| C-11 | Citations panel              | 🅼     | Source links for any retrieved data.          |
| C-12 | Tool-call replay             | 🅑     | Re-run a past tool with current data.         |

## Chart 📈

| ID    | Feature                              | Phase | Notes                                     |
| ----- | ------------------------------------ | ----- | ----------------------------------------- |
| CH-01 | OHLC candles via lightweight-charts  | 🅼     | XAUUSD / EURUSD / GBPUSD only.            |
| CH-02 | Timeframes 1m → 1w                   | 🅼     | URL state via `nuqs`.                     |
| CH-03 | EMA / SMA / RSI / MACD / Bollinger   | 🅼     | Computed in `packages/indicators`.        |
| CH-04 | Agent annotations (markers, lines)   | ✅     | Tool: `annotate-chart`.                   |
| CH-05 | Multi-timeframe split view           | 🅼     | Mobile = stacked, desktop = side-by-side. |
| CH-06 | Cross-hair sync across panes         | 🅼     | lightweight-charts' built-in.             |
| CH-07 | Pivot lines (D/W/M)                  | 🅼     | Auto-drawn.                               |
| CH-08 | Order Blocks / FVG / liquidity (SMC) | ✅     | From `packages/indicators/structure`.     |
| CH-09 | Save chart layout per pair           | 🅑     | Per user.                                 |
| CH-10 | TradingView Advanced Widget view     | 🅒     | Pro mode toggle.                          |
| CH-11 | Snapshot share (PNG)                 | 🅑     | OG image rendered server-side.            |

## Market 💱

| ID   | Feature                | Phase | Notes                                         |
| ---- | ---------------------- | ----- | --------------------------------------------- |
| M-01 | Live price tiles       | 🅼     | bid/ask/mid + 24h change + spark.             |
| M-02 | Watchlist (3 fixed)    | 🅼     | Pinned tiles on home / chat header.           |
| M-03 | Session badge          | 🅼     | Asia / London / NY current session indicator. |
| M-04 | Pip-distance helper    | 🅼     | "from 1.0820 → 28 pips" inline calc utility.  |
| M-05 | Cross-pair correlation | 🅑     | rolling 50-period.                            |
| M-06 | DXY proxy panel        | 🅑     | derived USD strength.                         |

## News 📰

| ID   | Feature                              | Phase | Notes                                          |
| ---- | ------------------------------------ | ----- | ---------------------------------------------- |
| N-01 | Symbol-tagged feed                   | 🅼     | Filter for XAU/EUR/GBP/USD.                    |
| N-02 | Sentiment chip per article           | 🅼     | Provider sentiment + our zero-shot reclassify. |
| N-03 | Article reader (sheet)               | 🅼     | "Ask the agent about this article" CTA.        |
| N-04 | Time bucket: now / today / week      | 🅼     |                                                |
| N-05 | RAG: agent cites recent news         | ✅     | pgvector search.                               |
| N-06 | Auto-summary digest (morning brief)  | ✅     | Generated daily, persisted.                    |
| N-07 | Push when high-impact + symbol match | 🅑     |                                                |

## Calendar 📅

| ID   | Feature                         | Phase | Notes                                        |
| ---- | ------------------------------- | ----- | -------------------------------------------- |
| K-01 | Today + 7d economic events      | 🅼     | Filtered to USD / EUR / GBP / Gold-relevant. |
| K-02 | Impact badges (low/med/high)    | 🅼     |                                              |
| K-03 | Countdown to next high-impact   | 🅼     | Sticky header on calendar page.              |
| K-04 | Pre-event briefing              | ✅     | Agent generates 1h before high-impact.       |
| K-05 | Post-event price impact summary | ✅     | Agent + indicators.                          |

## Alerts 🔔

| ID   | Feature                         | Phase | Notes                                                |
| ---- | ------------------------------- | ----- | ---------------------------------------------------- |
| A-01 | Price-cross alert               | 🅼     | Tool: `set-alert`.                                   |
| A-02 | Indicator-cross alert (RSI, MA) | 🅼     |                                                      |
| A-03 | Candle-close-above/below        | 🅼     | Per timeframe.                                       |
| A-04 | News tag alert                  | 🅑     | "high-impact USD news" trigger.                      |
| A-05 | Web Push delivery               | 🅑     | PWA push.                                            |
| A-06 | Email delivery                  | 🅼     | via Supabase / Resend.                               |
| A-07 | AI-suggested alert from chat    | 🅑     | "Want me to alert if it closes below 1.0820?" → tap. |

## Journal 📓

| ID   | Feature                            | Phase | Notes                             |
| ---- | ---------------------------------- | ----- | --------------------------------- |
| J-01 | Manual entry (entry/SL/TP/result)  | 🅼     |                                   |
| J-02 | Auto-fill from chat command        | ✅     | "Journal: I shorted XAU at 2392…" |
| J-03 | Win rate / R-multiple stats        | ✅     |                                   |
| J-04 | Tag filtering (London / SMC / NFP) | 🅑     |                                   |
| J-05 | Screenshot attachments             | 🅑     | Supabase Storage.                 |
| J-06 | Weekly review (agent-authored)     | ✅     |                                   |

## Settings ⚙️

| ID   | Feature                             | Phase | Notes                                    |
| ---- | ----------------------------------- | ----- | ---------------------------------------- |
| S-01 | Theme: dark/light/system            | 🅼     | `next-themes`.                           |
| S-02 | Model picker (per thread + default) | 🅼     | OpenAI / Anthropic / Google via Gateway. |
| S-03 | Indicator defaults                  | 🅼     | EMA periods, RSI length, etc.            |
| S-04 | Time zone + session preferences     | 🅼     |                                          |
| S-05 | Notification preferences            | 🅑     |                                          |
| S-06 | Usage / cost dashboard              | 🅼     | `chat_telemetry` summary, last 30 days.  |
| S-07 | Local export (manual JSON dump)     | 🅑     | Button that downloads journal + alerts.  |

## Cross-cutting features

| ID   | Feature                             | Phase | Notes                            |
| ---- | ----------------------------------- | ----- | -------------------------------- |
| X-01 | PWA installable + offline shell     | 🅼     | `next-pwa`.                      |
| X-02 | Command palette (`Cmd/Ctrl-K`)      | 🅼     | Symbol switch, action shortcuts. |
| X-03 | Keyboard shortcuts on desktop       | 🅑     |                                  |
| X-04 | Global "freshness" badge (data age) | 🅼     |                                  |
| X-05 | Network-aware fallbacks             | 🅼     | If WS down, poll REST.           |
| X-06 | Telegram bot for alert delivery     | ✅     | Cheaper + simpler than web push. |
