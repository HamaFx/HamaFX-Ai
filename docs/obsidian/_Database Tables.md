---
type: index
category: "table"
count: 52
tags: [index, type/table]
---

# 🗄️ DB Tables (52)

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

- [[admin_audit_log]] · `@kestrel/db` · `packages/db/src/schema/admin-audit.ts`  *(↖0 ↗1 = 1)*
- [[agent_opinions]] · `@kestrel/db` · `packages/db/src/schema/agent-opinions.ts`  *(↖0 ↗1 = 1)*
- [[alerts]] · `@kestrel/db` · `packages/db/src/schema/alerts.ts`  *(↖0 ↗1 = 1)*
- [[analysis_jobs]] · `@kestrel/db` · `packages/db/src/schema/analysis-jobs.ts`  *(↖0 ↗1 = 1)*
- [[audit_logs]] · `@kestrel/db` · `packages/db/src/schema/audit.ts`  *(↖0 ↗1 = 1)*
- [[user]] · `@kestrel/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[organization]] · `@kestrel/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[organization_member]] · `@kestrel/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[user_sessions]] · `@kestrel/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[account]] · `@kestrel/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[session]] · `@kestrel/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[verificationToken]] · `@kestrel/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[user_settings]] · `@kestrel/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[user_symbols]] · `@kestrel/db` · `packages/db/src/schema/auth.ts`  *(↖0 ↗1 = 1)*
- [[plans]] · `@kestrel/db` · `packages/db/src/schema/billing.ts`  *(↖0 ↗1 = 1)*
- [[subscriptions]] · `@kestrel/db` · `packages/db/src/schema/billing.ts`  *(↖0 ↗1 = 1)*
- [[payments]] · `@kestrel/db` · `packages/db/src/schema/billing.ts`  *(↖0 ↗1 = 1)*
- [[ipn_events]] · `@kestrel/db` · `packages/db/src/schema/billing.ts`  *(↖0 ↗1 = 1)*
- [[billing_webhook_dlq]] · `@kestrel/db` · `packages/db/src/schema/billing.ts`  *(↖0 ↗1 = 1)*
- [[billing_checkout_attempts]] · `@kestrel/db` · `packages/db/src/schema/billing.ts`  *(↖0 ↗1 = 1)*
- [[bot_links]] · `@kestrel/db` · `packages/db/src/schema/bot-links.ts`  *(↖0 ↗1 = 1)*
- [[briefings_emitted]] · `@kestrel/db` · `packages/db/src/schema/briefings.ts`  *(↖0 ↗1 = 1)*
- [[economic_events]] · `@kestrel/db` · `packages/db/src/schema/calendar.ts`  *(↖0 ↗1 = 1)*
- [[candles_1m]] · `@kestrel/db` · `packages/db/src/schema/candles-1m.ts`  *(↖0 ↗1 = 1)*
- [[chat_threads]] · `@kestrel/db` · `packages/db/src/schema/chat.ts`  *(↖0 ↗1 = 1)*
- [[chat_messages]] · `@kestrel/db` · `packages/db/src/schema/chat.ts`  *(↖0 ↗1 = 1)*
- [[cot_reports]] · `@kestrel/db` · `packages/db/src/schema/cot.ts`  *(↖0 ↗1 = 1)*
- [[cron_runs]] · `@kestrel/db` · `packages/db/src/schema/cron-runs.ts`  *(↖0 ↗1 = 1)*
- [[daily_ai_spend]] · `@kestrel/db` · `packages/db/src/schema/daily-ai-spend.ts`  *(↖0 ↗1 = 1)*
- [[diagnostic_traces]] · `@kestrel/db` · `packages/db/src/schema/diagnostic-traces.ts`  *(↖0 ↗1 = 1)*
- [[feature_flags]] · `@kestrel/db` · `packages/db/src/schema/feature-flags.ts`  *(↖0 ↗1 = 1)*
- [[intermarket_resonance]] · `@kestrel/db` · `packages/db/src/schema/intermarket-resonance.ts`  *(↖0 ↗1 = 1)*
- [[journal_entries]] · `@kestrel/db` · `packages/db/src/schema/journal.ts`  *(↖0 ↗1 = 1)*
- [[live_ticks]] · `@kestrel/db` · `packages/db/src/schema/live-ticks.ts`  *(↖0 ↗1 = 1)*
- [[memory_embeddings]] · `@kestrel/db` · `packages/db/src/schema/memory.ts`  *(↖0 ↗1 = 1)*
- [[news_articles]] · `@kestrel/db` · `packages/db/src/schema/news.ts`  *(↖0 ↗1 = 1)*
- [[news_embeddings]] · `@kestrel/db` · `packages/db/src/schema/news.ts`  *(↖0 ↗1 = 1)*
- [[notification_noise_state]] · `@kestrel/db` · `packages/db/src/schema/noise-control.ts`  *(↖0 ↗1 = 1)*
- [[portfolio_positions]] · `@kestrel/db` · `packages/db/src/schema/portfolio.ts`  *(↖0 ↗1 = 1)*
- [[portfolio_settings]] · `@kestrel/db` · `packages/db/src/schema/portfolio.ts`  *(↖0 ↗1 = 1)*
- [[provider_daily_quota]] · `@kestrel/db` · `packages/db/src/schema/provider-daily-quota.ts`  *(↖0 ↗1 = 1)*
- [[provider_health]] · `@kestrel/db` · `packages/db/src/schema/provider-health.ts`  *(↖0 ↗1 = 1)*
- [[provider_tests]] · `@kestrel/db` · `packages/db/src/schema/provider-tests.ts`  *(↖0 ↗1 = 1)*
- [[push_subscriptions]] · `@kestrel/db` · `packages/db/src/schema/push.ts`  *(↖0 ↗1 = 1)*
- [[rate_limits]] · `@kestrel/db` · `packages/db/src/schema/rate-limits.ts`  *(↖0 ↗1 = 1)*
- [[shared_snapshots]] · `@kestrel/db` · `packages/db/src/schema/share.ts`  *(↖0 ↗1 = 1)*
- [[snapshots]] · `@kestrel/db` · `packages/db/src/schema/snapshots.ts`  *(↖0 ↗1 = 1)*
- [[symbol_catalog]] · `@kestrel/db` · `packages/db/src/schema/symbol-catalog.ts`  *(↖0 ↗1 = 1)*
- [[telegram_updates]] · `@kestrel/db` · `packages/db/src/schema/telegram-updates.ts`  *(↖0 ↗1 = 1)*
- [[chat_telemetry]] · `@kestrel/db` · `packages/db/src/schema/telemetry.ts`  *(↖0 ↗1 = 1)*
- [[provider_throttle]] · `@kestrel/db` · `packages/db/src/schema/throttle.ts`  *(↖0 ↗1 = 1)*
- [[chat_tool_telemetry]] · `@kestrel/db` · `packages/db/src/schema/tool-telemetry.ts`  *(↖0 ↗1 = 1)*
