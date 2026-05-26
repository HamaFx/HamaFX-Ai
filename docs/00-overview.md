# 00 — Overview

## Vision

HamaFX-Ai is a **focused, mobile-first AI trading copilot** for three instruments only:

1. **XAUUSD** (Gold vs USD) — primary
2. **EURUSD**
3. **GBPUSD**

Instead of being a generic dashboard, it is a **conversation-first** product. The user talks to a single, expert AI agent that already has live charts, prices, indicators, news, and macro context loaded for those three pairs. The UI exists to make the conversation richer — not to replace it.

> "What's gold doing right now and is the London session bias bullish?"
> — and the agent should answer with a chart annotation, an indicator readout, today's relevant headlines, and a clear bias call with reasoning.

## Why narrow scope (only 3 pairs)?

| Reason             | Effect                                                                |
| ------------------ | --------------------------------------------------------------------- |
| Lower data cost    | Free / cheap tiers of providers cover 3 symbols cleanly               |
| Higher quality     | Agent prompt and prefetched context can be deeply specialised         |
| Faster UX          | All needed data fits in cache; sub-second responses                   |
| Better evaluations | Behaviour can be regression-tested against a small fixed surface area |

## Target users

- Discretionary forex / gold traders who want a "second brain" beside their main platform.
- Learners who want explanations of structure, liquidity, news impact, and confluences.
- Quants who want a chat interface to a normalised data layer they trust.

**Not for**: stock pickers, options traders, DeFi yield, generic news readers.

## Product principles

1. **Chat is the primary surface.** Every feature must be reachable via chat or it doesn't ship.
2. **Mobile-first, always.** Every layout is designed for a phone in landscape *and* portrait first; desktop is an enhancement.
3. **Show the work.** When the agent gives an opinion it must show the indicators, candles, headlines, or calendar events that justify it.
4. **No hallucinated prices.** Numbers in answers are always tool-call results, never the model's free-form generation.
5. **Customisable & legible.** Every default (model, indicator settings, sources, theme) is overridable from a single settings surface.
6. **AI-agent-friendly codebase.** File layout, naming, and docs are optimised for autonomous coding agents to extend safely.

## Success criteria (MVP)

| Dimension       | Target                                                                          |
| --------------- | ------------------------------------------------------------------------------- |
| Time to first token (chat) | < 800 ms p50                                                         |
| Chart load (cold)          | < 1.2 s p50 on 4G mobile                                             |
| Tool-call freshness        | Price ≤ 5 s old, candles ≤ 1 min, news ≤ 5 min                       |
| Mobile Lighthouse perf     | ≥ 90                                                                 |
| Mobile Lighthouse a11y     | ≥ 95                                                                 |
| Cost per active user / mo  | < $0.50 in API + LLM at MVP scale                                    |
| Cold-start agent accuracy  | ≥ 95% correct symbol/timeframe routing on internal eval set          |

## Non-goals (for v1)

- Order execution / broker integration (read-only assistant only).
- Backtesting engine UI (the agent can simulate, but no historical strategy lab).
- Social / copy-trading.
- More instruments (deferred to v2).
- Native mobile app (PWA only at v1).

## Out-of-the-box scenarios the agent must handle

These are the **acceptance prompts** that will live in the eval suite (see `docs/07-ai-agent.md`):

1. _"Give me a top-down read on gold from 4H down to 15M."_
2. _"What's the bias on EURUSD right now and why?"_
3. _"Are there any high-impact USD events in the next 24h?"_
4. _"Summarise today's gold-relevant news and tell me what to watch."_
5. _"Show RSI divergence on GBPUSD 1H if any."_
6. _"Mark the previous day's high/low and Asian range on XAUUSD."_
7. _"If price breaks 2380 on gold, what's the next liquidity above?"_
8. _"Set an alert if EURUSD closes a 1H below 1.0820."_
9. _"Journal: I shorted XAUUSD at 2392, SL 2398, TP 2378 — log it."_
10. _"What did I trade last week and what was my win rate?"_

If the agent can answer all 10 cleanly with sourced data and on-chart annotations, MVP is done.
