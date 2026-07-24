---
type: index
category: "table"
count: 50
tags: [index, type/table]
---

# 🗄️ DB Tables (50)

## DataviewJS — Sorted by Most Connected
```dataviewjs
const pages = dv.pages().where(p => p.type === "table");
dv.table(
  ['Name', 'Package', 'Path', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.package || '', p.path || '', p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Full List

- [[admin_audit_log]] · `@hamafx/db` · `packages/db/src/schema/admin-audit.ts`  *(↖0 ↗1 = 1)*
- [[agent_opinions]] · `@hamafx/db` · `packages/db/src/schema/agent-opinions.ts`  *(↖0 ↗1 = 1)*
- [[alerts]] · `@hamafx/db` · `packages/db/src/schema/alerts.ts`  *(↖0 ↗1 = 1)*
- [[analysis_jobs]] · `@hamafx/db` · `packages/db/src/schema/analysis-jobs.ts`  *(↖0 ↗1 = 1)*
- [[audit_logs]] · `@hamafx/db` · `packages/db/src/schema/audit.ts`  *(↖0 ↗1 = 1)*
- [[user]] · `@hamafx/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[organization]] · `@hamafx/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[organization_member]] · `@hamafx/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[user_sessions]] · `@hamafx/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[account]] · `@hamafx/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[session]] · `@hamafx/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[verificationToken]] · `@hamafx/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[user_settings]] · `@hamafx/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[user_symbols]] · `@hamafx/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[plans]] · `@hamafx/db` · `packages/db/src/schema/billing.ts`  *(↖0 ↗1 = 1)*
- [[subscriptions]] · `@hamafx/db` · `packages/db/src/schema/billing.ts`  *(↖0 ↗1 = 1)*
- [[payments]] · `@hamafx/db` · `packages/db/src/schema/billing.ts`  *(↖0 ↗1 = 1)*
- [[ipn_events]] · `@hamafx/db` · `packages/db/src/schema/billing.ts`  *(↖0 ↗1 = 1)*
- [[bot_links]] · `@hamafx/db` · `packages/db/src/schema/bot-links.ts`  *(↖0 ↗1 = 1)*
- [[briefings_emitted]] · `@hamafx/db` · `packages/db/src/schema/briefings.ts`  *(↖0 ↗1 = 1)*
- [[economic_events]] · `@hamafx/db` · `packages/db/src/schema/calendar.ts`  *(↖0 ↗1 = 1)*
- [[candles_1m]] · `@hamafx/db` · `packages/db/src/schema/candles-1m.ts`  *(↖0 ↗1 = 1)*
- [[chat_threads]] · `@hamafx/db` · `packages/db/src/schema/chat.ts`  *(↖0 ↗1 = 1)*
- [[chat_messages]] · `@hamafx/db` · `packages/db/src/schema/chat.ts`  *(↖0 ↗1 = 1)*
- [[cot_reports]] · `@hamafx/db` · `packages/db/src/schema/cot.ts`  *(↖0 ↗1 = 1)*
- [[cron_runs]] · `@hamafx/db` · `packages/db/src/schema/cron-runs.ts`  *(↖0 ↗1 = 1)*
- [[daily_ai_spend]] · `@hamafx/db` · `packages/db/src/schema/daily-ai-spend.ts`  *(↖0 ↗1 = 1)*
- [[diagnostic_traces]] · `@hamafx/db` · `packages/db/src/schema/diagnostic-traces.ts`  *(↖0 ↗1 = 1)*
- [[feature_flags]] · `@hamafx/db` · `packages/db/src/schema/feature-flags.ts`  *(↖0 ↗1 = 1)*
- [[intermarket_resonance]] · `@hamafx/db` · `packages/db/src/schema/intermarket-resonance.ts`  *(↖0 ↗1 = 1)*
- [[journal_entries]] · `@hamafx/db` · `packages/db/src/schema/journal.ts`  *(↖0 ↗1 = 1)*
- [[live_ticks]] · `@hamafx/db` · `packages/db/src/schema/live-ticks.ts`  *(↖0 ↗1 = 1)*
- [[memory_embeddings]] · `@hamafx/db` · `packages/db/src/schema/memory.ts`  *(↖0 ↗1 = 1)*
- [[news_articles]] · `@hamafx/db` · `packages/db/src/schema/news.ts`  *(↖0 ↗1 = 1)*
- [[news_embeddings]] · `@hamafx/db` · `packages/db/src/schema/news.ts`  *(↖0 ↗1 = 1)*
- [[notification_noise_state]] · `@hamafx/db` · `packages/db/src/schema/noise-control.ts`  *(↖0 ↗1 = 1)*
- [[portfolio_positions]] · `@hamafx/db` · `packages/db/src/schema/portfolio.ts`  *(↖0 ↗1 = 1)*
- [[portfolio_settings]] · `@hamafx/db` · `packages/db/src/schema/portfolio.ts`  *(↖0 ↗1 = 1)*
- [[provider_daily_quota]] · `@hamafx/db` · `packages/db/src/schema/provider-daily-quota.ts`  *(↖0 ↗1 = 1)*
- [[provider_health]] · `@hamafx/db` · `packages/db/src/schema/provider-health.ts`  *(↖0 ↗1 = 1)*
- [[provider_tests]] · `@hamafx/db` · `packages/db/src/schema/provider-tests.ts`  *(↖0 ↗1 = 1)*
- [[push_subscriptions]] · `@hamafx/db` · `packages/db/src/schema/push.ts`  *(↖0 ↗1 = 1)*
- [[rate_limits]] · `@hamafx/db` · `packages/db/src/schema/rate-limits.ts`  *(↖0 ↗1 = 1)*
- [[shared_snapshots]] · `@hamafx/db` · `packages/db/src/schema/share.ts`  *(↖0 ↗1 = 1)*
- [[snapshots]] · `@hamafx/db` · `packages/db/src/schema/snapshots.ts`  *(↖0 ↗1 = 1)*
- [[symbol_catalog]] · `@hamafx/db` · `packages/db/src/schema/symbol-catalog.ts`  *(↖0 ↗1 = 1)*
- [[telegram_updates]] · `@hamafx/db` · `packages/db/src/schema/telegram-updates.ts`  *(↖0 ↗1 = 1)*
- [[chat_telemetry]] · `@hamafx/db` · `packages/db/src/schema/telemetry.ts`  *(↖0 ↗1 = 1)*
- [[provider_throttle]] · `@hamafx/db` · `packages/db/src/schema/throttle.ts`  *(↖0 ↗1 = 1)*
- [[chat_tool_telemetry]] · `@hamafx/db` · `packages/db/src/schema/tool-telemetry.ts`  *(↖0 ↗1 = 1)*
