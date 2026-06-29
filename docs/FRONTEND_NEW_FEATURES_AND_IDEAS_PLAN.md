# Frontend New Features & Ideas Plan

> **Scope:** Net-new capabilities and product ideas for `apps/web`. This is the **ambition** document —
> bugs, polish, and fixes for *existing* features live in `docs/FRONTEND_FIXES_AND_POLISH_PLAN.md`.
> **North star:** make HamaFX-Ai feel like a **premium, AI-native trading terminal** — chat-first,
> data-dense where it matters, cinematic in the moments that earn trust, and unmistakably *not*
> generic AI-template UI.

Every idea below is sized (**S/M/L**), tagged with the surface it lives in, and written to fit the
existing architecture (Next.js 15 server/client split, lightweight-charts v5, motion + `LazyMotion`,
AI SDK v5 tool-parts, the semantic-token design system, the tool-card registry).

---

## 0. Design Compass (so new features stay premium, not slop)

Built from premium references — TradingView (efficiency-first terminal), Coinbase Advanced (modular
20+ widget canvas), institutional terminals (TradeX/Nova), and AI-native chat-trading case studies
(Trinigence, MarketMind) — plus the 2026 fintech trend set (AI-assisted contextual insight,
biometric-first auth, real-time scalable dashboards, behavioral/decision-confidence patterns).

Rules every new feature must follow:
1. **Chat is the spine, dashboards are the muscle.** New surfaces should be reachable from, and
   linkable into, the chat (pin/expand to chat, "ask AI about this").
2. **Earn trust visibly.** Anything the AI asserts shows provenance: model badge, data source, time,
   confidence, and a one-tap "verify".
3. **Density with hierarchy.** Use desktop width for terminal-grade layouts; never dump raw numbers —
   rank them.
4. **Motion only when it means something** (state change, reveal, confirmation). No filler.
5. **One token system.** Reuse the tool-card registry and semantic tokens; no bespoke palettes.

---

## 1. Chart & Trading Terminal (highest visual ROI)

### 1.1 Crosshair OHLC legend + last-price line — **M, `chart/`**
A floating, pinned OHLC(V) legend that follows the crosshair, plus a persistent dashed last-price
line with an axis price tag. This is the single biggest "this feels like TradingView" upgrade. Add a
faint symbol+timeframe **watermark** in the chart background (also improves shared screenshots).

### 1.2 Drawing tools layer — **L, `chart/`**
Trendlines, horizontal/vertical lines, rectangles, and Fibonacci retracement via lightweight-charts
v5 custom primitives. Persist drawings per symbol/timeframe. Even a v1 with horizontal + trend lines
is a step-change. Make drawings "pin to chat" so the AI can reason about user-drawn levels.

### 1.3 Chart screenshot / share image — **S, `chart/`**
`chart.takeScreenshot()` → PNG with branded frame (symbol, TF, timestamp, watermark). One-tap copy,
download, share-to-journal, and attach-to-chat. Traders share constantly; this is cheap and sticky.

### 1.4 Bar Replay (backtesting) mode — **L, `chart/` + `journal/`**
Step through historical candles bar-by-bar with play/pause/speed controls; let users place
hypothetical entries/SL/TP and auto-log the result to the journal. A defining feature for a
journaling+AI product (TradeZella/TradingView replay parity).

### 1.5 Watchlist sidebar with live mini-charts — **M, `chart/` + nav**
Scrollable watchlist of live prices + sparklines + % change, with quick-switch and reorder. Desktop:
persistent left rail; mobile: a drawer. Uses the existing `usePrices` multi-symbol hook.

### 1.6 Multi-timeframe + volume profile — **L, `chart/`**
Overlay a higher-timeframe EMA/structure on a lower TF; add a session/volume profile histogram (when
volume is available). Pro-tier differentiation.

### 1.7 Chart layouts & templates — **M, `chart/`**
Named, savable presets (indicators + overlays + theme + drawings). Switch templates instantly; share
a template as a link. Replaces the single-config localStorage blob with named presets.

### 1.8 Right-click context menu + keyboard nav — **M, `chart/`**
Reset, screenshot, "ask AI about this candle", add alert at price, copy price. Full keyboard control
(`+/-`, `0` reset, arrows to pan, `D` draw) for accessibility and speed.

---

## 2. AI Chat & Multi-Agent (the product's soul)

### 2.1 Cinematic multi-agent "committee" visualization — **L, `chat/parts/`**
Today `agent-deliberation.tsx` is flat pills. Build a **deliberation theater**: agent avatars
(Technical / Fundamental / Risk / Sentiment / Decision) that activate and pulse as each completes,
animated connector lines into a central "fusion" node, then a dramatic verdict reveal with a
confidence meter and dissent indicators. This is the #1 differentiator — make it feel like a war
room, fully on-brand with semantic tokens.

### 2.2 Inline mini-visuals in tool cards — **M, `chat/parts/`**
Tiny embedded SVGs: candle sparkline for `get_candles`, RSI gauge arc for `get_indicators`, COT
positioning bars for `get_cot`, a correlation heat-strip for `get_correlation`, a risk gauge for
`compute_risk`. Turns chat answers into a trading terminal, not a text bot.

### 2.3 Trust layer on every assistant message — **M, `chat/`**
Model badge ("Gemini 2.5 Flash"), timestamp, token/cost footer (collapsible), and per-claim citation
chips. Builds the trust premium fintech AI lives or dies on. Metadata already exists on messages.

### 2.4 Reasoning / "thinking" panel — **M, `chat/`**
A collapsible streamed reasoning preview (Claude-style) that transitions into the final answer.
Surface the existing `PlanPart` prominently during streaming.

### 2.5 Thread-level conversation summary header — **S, `chat/`**
After ~20 messages, a collapsible summary card pinned at the top (reuse `summarize_thread` output) so
users get context without scrolling.

### 2.6 Regenerate compare / model A-B — **M, `chat/`**
Regenerate with a chosen model and show the two responses side-by-side ("keep this one"). Pairs with
the fallback-chain config and the regen model picker.

### 2.7 Voice mode upgrades — **M, `chat/` + `hooks/`**
Live waveform visualization reacting to mic level (Web Audio), partial transcript display, and
optional spoken responses (TTS) for hands-free market check-ins.

### 2.8 Command palette as a true trading command bar — **M, `layout/`**
Beyond navigation: "buy idea XAUUSD", "set alert EURUSD 1.0850", "open chart GBPUSD 15m", fuzzy
symbol search, recent threads, and quick actions. Show the ⌘K hint in the TopBar so desktop users
discover it.

### 2.9 Keyboard shortcut system + cheatsheet — **S, global**
`⌘K` palette, `⌘⇧N` new chat, `Esc` close, `↑` edit last, `⌘R` regenerate, `?` opens a shortcut
overlay. Signals a power-user product.

---

## 3. Dashboard & Home (currently thin)

### 3.1 Modular, customizable dashboard canvas — **L, `dashboard/`**
A Coinbase-Advanced-style widget grid: drag/resize widgets (watchlist, open positions, daily P&L,
economic calendar countdown, news pulse, AI morning briefing, equity curve, alerts). `@dnd-kit` is
already in the repo. Persist per-user layouts; ship sensible defaults so it's great out of the box.

### 3.2 AI morning/market briefing card — **M, `dashboard/` + `ai/`**
A daily generated briefing (overnight moves, today's high-impact events, watchlist bias, open-risk
summary) with "dig deeper in chat". The `briefings` package already exists on the backend — surface
it beautifully.

### 3.3 P&L calendar heatmap — **M, `dashboard/` + `journal/`**
Green/red day grid (TradeZella-style) of daily realized R/P&L, click a day to see its trades. Classic
trading-journal staple currently missing.

### 3.4 "Today at a glance" hero — **S, `dashboard/`**
Above the fold: next high-impact event countdown, current session + bias, open positions risk, and
one AI nudge. Decision-confidence at a glance.

---

## 4. Journal & Performance Analytics

### 4.1 Rich analytics suite — **L, `journal/`**
Drawdown curve + max drawdown/recovery factor, R-distribution histogram, win-rate by
symbol/session/setup-tag, expectancy, average win/loss, streaks, and best/worst times of day. Turn
the journal into a serious performance tool.

### 4.2 Chart-attached trade replay — **M, `journal/` + `chart/`**
For each closed trade, render the entry/SL/TP/exit on a mini-chart of that period so users *see* the
trade. Ties into Bar Replay (1.4).

### 4.3 Setup tagging + tag analytics — **M, `journal/`**
Chip-based tags with autocomplete; analytics per tag ("your 'London breakout' setups: 62% win,
+1.4R avg"). Behavioral-design pattern that improves decisions.

### 4.4 AI trade review — **M, `journal/` + `ai/`**
One-tap "review this trade": the AI critiques entry timing, R:R, and management vs. the recorded
context, and suggests improvements. Weekly auto-review digest (the `weekly-review` cron exists).

### 4.5 Screenshot/import trades — **M, `journal/`**
Attach a chart screenshot to an entry (uses existing upload + vision tooling) and/or parse a
broker/MT5 statement to bulk-import trades (the `tools/mt5` dir hints at this).

---

## 5. Alerts, Signals & Notifications

### 5.1 Visual alert builder on the chart — **M, `alerts/` + `chart/`**
Drag a line on the chart to set a price alert; preview how often it would've triggered historically.
Far better than a blind numeric form.

### 5.2 Decision-signal feedback loop UI — **M, `chat/` + signals**
The backend has `decision-signals` with feedback + stats endpoints. Build a UI: signal cards with
outcome tracking, a "was this useful?" loop, and a personal signal scorecard. Closes the
trust/accuracy loop visibly.

### 5.3 Smart alert digest & noise control UX — **S, `settings/` + notifications**
A friendly UI over the existing noise-config (dedup/cooldown/quiet-hours) with a live "you'd have
received N alerts this week" preview.

### 5.4 Alert templates — **S, `alerts/`**
One-tap common alerts: session open, round-number levels, ATR-based breakout, calendar-event
pre-alerts.

---

## 6. Onboarding, Auth & Trust

### 6.1 Interactive, progress-saved onboarding — **M, `onboarding/`**
Per-step validation, server-side progress save (resume on any device), a "try a sample chat" preview,
and a "skip setup, explore first" path. Add a guided product tour on first chat.

### 6.2 Biometric / passkey auth — **M, `auth/`**
WebAuthn passkeys for sub-second, frictionless login (2026 fintech baseline). Pairs with existing 2FA.

### 6.3 2FA recovery codes + security center — **S, `settings/`**
Generate/show one-time recovery codes; a consolidated "Security" hub (password, 2FA, sessions, login
history) — also fixes the lockout risk.

---

## 7. Cross-Cutting Premium Systems

### 7.1 Real light theme (or remove the affordance) — **M, global**
If keeping it: full token light theme + a light chart preset + per-chart theme sync. Otherwise remove
the half-wired light-mode hints. (Tracked as a decision in the fixes plan; the *feature* is a polished
light theme.)

### 7.2 Shared `TimeProvider` + live-data fabric — **M, global**
One ticking clock for all relative timestamps/countdowns, and a move from 1.5s polling to SSE/WebSocket
for prices — enabling smooth real-time across watchlist, chart, dashboard.

### 7.3 PWA depth — **S, global**
Manifest `shortcuts` (New Chat / Chart / Alerts), `screenshots` for richer install prompts,
per-device splash images, and home-screen quick actions. Plus offline read of cached news/journal.

### 7.4 Personalization layer — **S/M, nav + global**
User identity (name/avatar) in the nav drawer, unread/pending badges on nav items (chat, alerts),
and "continue where you left off" on open.

### 7.5 Haptics + tactile feedback — **S, mobile**
Guarded `navigator.vibrate` on send, alert-set, swipe-delete, and tool completion for a premium
mobile feel.

### 7.6 Shareable, branded snapshots — **M, `share/`**
Upgrade the share page to render markdown + an embedded mini-chart with the annotations, an OG image,
and a branded frame — so shared analyses look premium in the wild.

---

## 8. Prioritization (impact × effort)

**Tier 1 — do first (max premium signal):**
- 1.1 Crosshair OHLC + last-price line (M)
- 2.1 Cinematic multi-agent committee (L)
- 2.2 Inline mini-visuals in tool cards (M)
- 2.3 Trust layer on assistant messages (M)
- 3.1 Modular dashboard canvas (L)

**Tier 2 — strong differentiators:**
- 1.2 Drawing tools (L) · 1.3 Chart screenshot/share (S) · 1.5 Watchlist sidebar (M)
- 3.2 AI briefing (M) · 3.3 P&L heatmap (M)
- 4.1 Analytics suite (L) · 5.2 Decision-signal feedback UI (M)
- 2.8 Trading command bar (M) · 2.9 Shortcuts (S)

**Tier 3 — depth & delight:**
- 1.4 Bar Replay (L) · 1.6 MTF/volume profile (L) · 1.7 Templates (M)
- 4.2–4.5 Journal depth · 5.1 Visual alert builder (M)
- 6.1 Onboarding (M) · 6.2 Passkeys (M) · 6.3 Security center (S)
- 7.x Cross-cutting systems

---

## 9. What "Unique & Premium" Means Here (anti-template guardrails)

- **Signature moment:** the multi-agent committee theater (2.1) is the brand's wow — invest in it.
- **Terminal, not template:** crosshair legend, drawing tools, watchlist rail, modular dashboard make
  it read as a *trading terminal*, not a chat wrapper.
- **Trust is the feature:** model badges, citations, confidence, verify, signal scorecards — premium
  fintech AI wins on trust, not gradients.
- **Consistent restraint:** pure-black OKLCH + glass, functional motion, tokenized color, tabular
  numerals, density-with-hierarchy. No purple-gradient hero blobs, no decorative AI clip-art, no raw
  palette colors.
