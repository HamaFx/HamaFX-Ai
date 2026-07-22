---
type: index
category: "tool"
count: 32
tags: [index, type/tool]
---

# 🔧 AI Tools (32)

## DataviewJS — Sorted by Most Connected
```dataviewjs
const pages = dv.pages().where(p => p.type === "tool");
dv.table(
  ['Name', 'Package', 'Path', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.package || '', p.path || '', p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Full List

- [[convene_committee]] · `@hamafx/ai` · `packages/ai/src/tools/convene-committee.ts`  *(↖1 ↗14 = 15)*
- [[summarize_thread]] · `@hamafx/ai` · `packages/ai/src/tools/summarize-thread.ts`  *(↖1 ↗9 = 10)*
- [[analyze_chart_image]] · `@hamafx/ai` · `packages/ai/src/tools/analyze-chart-image.ts`  *(↖1 ↗8 = 9)*
- [[forecast_volatility]] · `@hamafx/ai` · `packages/ai/src/tools/forecast-volatility.ts`  *(↖1 ↗8 = 9)*
- [[run_system_action]] · `@hamafx/ai` · `packages/ai/src/tools/run-system-action.ts`  *(↖2 ↗8 = 10)*
- [[analyze_technical]] · `@hamafx/ai` · `packages/ai/src/tools/analyze-technical.ts`  *(↖3 ↗7 = 10)*
- [[get_calendar]] · `@hamafx/ai` · `packages/ai/src/tools/get-calendar.ts`  *(↖2 ↗7 = 9)*
- [[get_journal_stats]] · `@hamafx/ai` · `packages/ai/src/tools/get-journal-stats.ts`  *(↖2 ↗7 = 9)*
- [[set_alert]] · `@hamafx/ai` · `packages/ai/src/tools/set-alert.ts`  *(↖2 ↗7 = 9)*
- [[share_snapshot]] · `@hamafx/ai` · `packages/ai/src/tools/share-snapshot.ts`  *(↖2 ↗7 = 9)*
- [[analyze_fundamental]] · `@hamafx/ai` · `packages/ai/src/tools/analyze-fundamental.ts`  *(↖3 ↗6 = 9)*
- [[compute_position_health]] · `@hamafx/ai` · `packages/ai/src/tools/compute-position-health.ts`  *(↖2 ↗6 = 8)*
- [[get_intermarket_resonance]] · `@hamafx/ai` · `packages/ai/src/tools/get-intermarket-resonance.ts`  *(↖2 ↗6 = 8)*
- [[get_news]] · `@hamafx/ai` · `packages/ai/src/tools/get-news.ts`  *(↖2 ↗6 = 8)*
- [[get_system_diagnostics]] · `@hamafx/ai` · `packages/ai/src/tools/get-system-diagnostics.ts`  *(↖2 ↗6 = 8)*
- [[log_journal]] · `@hamafx/ai` · `packages/ai/src/tools/log-journal.ts`  *(↖2 ↗6 = 8)*
- [[search_knowledge]] · `@hamafx/ai` · `packages/ai/src/tools/search-knowledge.ts`  *(↖1 ↗6 = 7)*
- [[annotate_chart]] · `@hamafx/ai` · `packages/ai/src/tools/annotate-chart.ts`  *(↖1 ↗5 = 6)*
- [[get_indicators]] · `@hamafx/ai` · `packages/ai/src/tools/get-indicators.ts`  *(↖1 ↗5 = 6)*
- [[get_market_structure]] · `@hamafx/ai` · `packages/ai/src/tools/get-market-structure.ts`  *(↖2 ↗5 = 7)*
- [[get_social_sentiment]] · `@hamafx/ai` · `packages/ai/src/tools/get-social-sentiment.ts`  *(↖1 ↗5 = 6)*
- [[replay_setup]] · `@hamafx/ai` · `packages/ai/src/tools/replay-setup.ts`  *(↖2 ↗5 = 7)*
- [[verify_call]] · `@hamafx/ai` · `packages/ai/src/tools/verify-call.ts`  *(↖3 ↗5 = 8)*
- [[get_candles]] · `@hamafx/ai` · `packages/ai/src/tools/get-candles.ts`  *(↖3 ↗4 = 7)*
- [[get_correlation]] · `@hamafx/ai` · `packages/ai/src/tools/get-correlation.ts`  *(↖1 ↗4 = 5)*
- [[get_co_t]] · `@hamafx/ai` · `packages/ai/src/tools/get-cot.ts`  *(↖1 ↗4 = 5)*
- [[get_intermarket]] · `@hamafx/ai` · `packages/ai/src/tools/get-intermarket.ts`  *(↖1 ↗4 = 5)*
- [[get_portfolio_snapshot]] · `@hamafx/ai` · `packages/ai/src/tools/get-portfolio-snapshot.ts`  *(↖1 ↗4 = 5)*
- [[get_price]] · `@hamafx/ai` · `packages/ai/src/tools/get-price.ts`  *(↖3 ↗4 = 7)*
- [[get_seasonality]] · `@hamafx/ai` · `packages/ai/src/tools/get-seasonality.ts`  *(↖1 ↗4 = 5)*
- [[get_session_levels]] · `@hamafx/ai` · `packages/ai/src/tools/get-session-levels.ts`  *(↖2 ↗4 = 6)*
- [[compute_risk]] · `@hamafx/ai` · `packages/ai/src/tools/compute-risk.ts`  *(↖4 ↗3 = 7)*
