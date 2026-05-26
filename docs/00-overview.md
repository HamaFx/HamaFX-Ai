# 00 — Overview

## Vision

HamaFX-Ai is a **personal, mobile-first AI trading copilot** for three instruments only:

1. **XAUUSD** (Gold vs USD) — primary
2. **EURUSD**
3. **GBPUSD**

This is a **single-user app** built for the repo owner. It is not a public SaaS. That framing changes a lot of decisions — see "Personal-mode constraints" below — but the *product* is no less ambitious. It's a deeply contextual chat-driven copilot with live charts, indicators, news, macro calendar, alerts, and a journal.

> "What's gold doing right now and is the London session bias bullish?"
> — and the agent should answer with a chart annotation, an indicator readout, today's relevant headlines, and a clear bias call with reasoning.

## Personal-mode constraints (and what they unlock)

| We do **not** need…                            | …so we drop                                                  |
| ---------------------------------------------- | ------------------------------------------------------------ |
| Multi-tenancy                                  | RLS, `user_id` columns, idempotency keys, per-user quotas    |
| Public marketing                               | Landing page, OG images, sitemap/robots, analytics           |
| Anyone-can-sign-up auth                        | Magic links, OAuth providers, password resets                |
| Compliance / GDPR                              | Data exports, deletion flows, consent banners                |
| Production observability                       | Axiom / Sentry / dashboards (Vercel logs are enough)         |
| BYOK for users                                 | A whole settings surface for it                              |
| Continuous AI evals                            | LLM-as-judge in CI                                           |

In exchange we keep the budget for **cool features**: SMC structure, RAG, agent annotations, voice, briefings, vision, etc.

## Why narrow scope (only 3 pairs)?

| Reason             | Effect                                                                |
| ------------------ | --------------------------------------------------------------------- |
| Lower data cost    | Free tiers of providers easily cover 3 symbols                        |
| Higher quality     | Agent prompt + prefetched context can be deeply specialised           |
| Faster UX          | All needed data fits in cache; sub-second responses                   |
| Lower mental load  | A focused tool you actually use beats a sprawling one you don't       |

## Product principles

1. **Chat is the primary surface.** Every feature must be reachable via chat or it doesn't ship.
2. **Mobile-first, always.** Layouts are designed for a phone first; desktop is an enhancement.
3. **Show the work.** When the agent gives an opinion it must show the indicators, candles, headlines, or events that justify it.
4. **No hallucinated prices.** Numbers in answers are always tool-call results, never the model's free-form generation.
5. **Customisable & legible.** Every default (model, indicator settings, sources, theme) is overridable.
6. **AI-agent-friendly codebase.** File layout, naming, and docs are optimised for autonomous coding agents to extend safely.

## Success criteria (MVP)

| Dimension                   | Target                                                       |
| --------------------------- | ------------------------------------------------------------ |
| Time to first token (chat)  | < 800 ms p50                                                 |
| Chart load (cold)           | < 1.2 s p50 on 4G mobile                                     |
| Tool-call freshness         | Price ≤ 5 s old, candles ≤ 1 min, news ≤ 5 min               |
| Mobile Lighthouse perf      | ≥ 90                                                         |
| Mobile Lighthouse a11y      | ≥ 95                                                         |
| Cost / month (your usage)   | < $20 (target ~$5–10) in API + LLM                           |
| The "10 prompts" eval       | ≥ 9/10 pass on a manual run                                  |

## Non-goals (for v1)

- Order execution / broker integration (read-only assistant only).
- Backtesting engine UI (the agent can simulate, but no historical strategy lab).
- More instruments (deferred to v2).
- Native mobile app (PWA only at v1).
- Anything multi-user.

## The "10 prompts" — the agent must handle these

These are the manual acceptance prompts (no CI-graded eval — you just run them):

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
