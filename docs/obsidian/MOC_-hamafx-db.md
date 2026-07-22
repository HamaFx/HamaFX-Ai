---
type: moc
package: "@hamafx/db"
nodes: 154
totalIncoming: 427
totalOutgoing: 246
tags: [moc, hamafx-db]
---

# 📦 @hamafx/db

> **Map of Content** · 154 files · 427 incoming + 246 outgoing = 673 connections

## DataviewJS — All Files in This Package
```dataviewjs
const pages = dv.pages().where(p => p.package === "@hamafx/db" && p.type);
dv.table(
  ['File', 'Type', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Files by Type

### 📁 Module (104)
- [[seed-plans]] *(0↖ 3↗)*
- [[local-db-getLocalDb]] *(0↖ 3↗)*
- [[agent-opinions-agentOpinions]] *(1↖ 3↗)*
- [[analysis-jobs-analysisJobs]] *(1↖ 3↗)*
- [[briefings-briefingsEmitted]] *(1↖ 3↗)*
- [[client.test]] *(0↖ 3↗)*
- [[full-migration-chain.test]] *(0↖ 3↗)*
- [[isolated-db.test]] *(0↖ 3↗)*
- [[migration-0013-chat-model.test]] *(0↖ 3↗)*
- [[migration-0014.test]] *(0↖ 3↗)*
- [[migration-rename.test]] *(0↖ 3↗)*
- [[phase2-3-migrations.test]] *(0↖ 3↗)*
- [[phase3-multitenancy-session-a.test]] *(0↖ 3↗)*
- [[phase4-5-migrations.test-encryptSecret]] *(0↖ 3↗)*
- [[schema-drift.test]] *(0↖ 3↗)*
- [[tracing.test]] *(0↖ 3↗)*
- [[with-user-scope.test]] *(0↖ 3↗)*
- [[eslint.config-config]] *(0↖ 2↗)*
- [[active-users-getActiveUserIds]] *(0↖ 2↗)*
- [[client-DbClient]] *(35↖ 2↗)*
- [[pglite-client-sanitizeStatement]] *(9↖ 2↗)*
- [[provider-quota-DailyQuotaResult]] *(0↖ 2↗)*
- [[agent-opinions-AgentOpinionRow]] *(0↖ 2↗)*
- [[alerts-AlertRow]] *(0↖ 2↗)*
- [[analysis-jobs-AnalysisJobRow]] *(0↖ 2↗)*
- [[auth-AuthUserRow]] *(0↖ 2↗)*
- [[billing-extras-listActivePlans]] *(0↖ 2↗)*
- [[billing-SubscriptionWithPlan]] *(0↖ 2↗)*
- [[candles-CandleRow]] *(0↖ 2↗)*
- [[chat-telemetry-listToolTelemetry]] *(0↖ 2↗)*
- [[cot-CotReportRow]] *(0↖ 2↗)*
- [[cron-runs-CronRunRow]] *(0↖ 2↗)*
- [[diagnostic-traces-DiagnosticTraceRow]] *(0↖ 2↗)*
- [[feature-flags-FeatureFlagRow]] *(0↖ 2↗)*
- [[ipn-events-findIpnEvent]] *(0↖ 2↗)*
- [[journal-JournalRow]] *(0↖ 2↗)*
- [[news-articles-NewsArticleRow]] *(0↖ 2↗)*
- [[onboarding-ResetMode]] *(0↖ 2↗)*
- [[portfolio-PositionRow]] *(0↖ 2↗)*
- [[provider-tests-getProviderHealthForUser]] *(0↖ 2↗)*
- [[push-PushSubscriptionRow]] *(0↖ 2↗)*
- [[telemetry-TelemetryRow]] *(0↖ 2↗)*
- [[tenants-OrganizationRow]] *(0↖ 2↗)*
- [[threads-ThreadRow]] *(0↖ 2↗)*
- [[tool-telemetry-ToolTelemetryRow]] *(0↖ 2↗)*
- [[user-sessions-SessionRow]] *(0↖ 2↗)*
- [[user-settings-UserWithSettings]] *(0↖ 2↗)*
- [[user-symbols-UserSymbolRow]] *(0↖ 2↗)*
- [[users-UserRow]] *(0↖ 2↗)*
- [[verification-tokens-lazyPurgeExpiredTokens]] *(0↖ 2↗)*
- [[watchlist-WatchlistEntry]] *(0↖ 2↗)*
- [[rate-limit-RateLimitResult]] *(0↖ 2↗)*
- [[retention-RetentionConfig]] *(0↖ 2↗)*
- [[alerts-alerts]] *(1↖ 2↗)*
- [[audit-auditLogs]] *(1↖ 2↗)*
- [[billing-planInterval]] *(5↖ 2↗)*
- [[bot-links-botLinks]] *(1↖ 2↗)*
- [[chat-chatThreads]] *(5↖ 2↗)*
- [[daily-ai-spend-dailyAiSpend]] *(1↖ 2↗)*
- [[diagnostic-traces-diagnosticTraces]] *(1↖ 2↗)*
- [[journal-journalEntries]] *(1↖ 2↗)*
- [[memory-memoryEmbeddings]] *(1↖ 2↗)*
- [[noise-control-notificationNoiseState]] *(1↖ 2↗)*
- [[portfolio-portfolioPositions]] *(2↖ 2↗)*
- [[provider-tests-providerTests]] *(1↖ 2↗)*
- [[push-pushSubscriptions]] *(1↖ 2↗)*
- [[rate-limits-rateLimits]] *(1↖ 2↗)*
- [[share-sharedSnapshots]] *(1↖ 2↗)*
- [[telemetry-ChatTelemetryKind]] *(1↖ 2↗)*
- [[tool-telemetry-chatToolTelemetry]] *(1↖ 2↗)*
- [[test-utils-withIsolatedDb]] *(1↖ 2↗)*
- [[index.test]] *(0↖ 2↗)*
- [[local-db.test]] *(0↖ 2↗)*
- [[migration-hash-stability.test]] *(0↖ 2↗)*
- [[phase6-7-8.test-REQUIRED_EXTENSIONS]] *(0↖ 2↗)*
- [[rate-limit.test]] *(0↖ 2↗)*
- [[drizzle.config-defineConfig]] *(0↖ 1↗)*
- [[db-check]] *(0↖ 1↗)*
- [[install-extensions]] *(0↖ 1↗)*
- [[list-tables]] *(0↖ 1↗)*
- [[migrate-status]] *(0↖ 1↗)*
- [[index_tool-architecture-explorer|index]] *(2↖ 1↗)*
- [[index_tool-architecture-explorer|index]] *(0↖ 1↗)*
- [[_extensions]] *(0↖ 1↗)*
- [[auth-users]] *(29↖ 1↗)*
- [[calendar-economicEvents]] *(1↖ 1↗)*
- [[candles-1m-candles1m]] *(1↖ 1↗)*
- [[cot-cotReports]] *(1↖ 1↗)*
- [[cron-runs-cronRuns]] *(1↖ 1↗)*
- [[enums-userRoleEnum]] *(0↖ 1↗)*
- [[feature-flags-featureFlags]] *(1↖ 1↗)*
- [[index_tool-architecture-explorer|index]] *(2↖ 1↗)*
- [[intermarket-resonance-intermarketResonance]] *(1↖ 1↗)*
- [[live-ticks-liveTicks]] *(1↖ 1↗)*
- [[news-newsArticles]] *(2↖ 1↗)*
- [[provider-daily-quota-providerDailyQuota]] *(1↖ 1↗)*
- [[provider-health-providerHealth]] *(1↖ 1↗)*
- [[snapshots-snapshots]] *(1↖ 1↗)*
- [[symbol-catalog-symbolCatalog]] *(1↖ 1↗)*
- [[telegram-updates-telegramUpdates]] *(1↖ 1↗)*
- [[throttle-providerThrottle]] *(1↖ 1↗)*
- [[tracing-traceQuery]] *(1↖ 1↗)*
- [[with-user-scope-withUserScope]] *(1↖ 1↗)*
- [[vitest.config-defineConfig]] *(0↖ 1↗)*

### 🗄️ DB Table (49)
- [[agent_opinions]] *(0↖ 1↗)*
- [[alerts]] *(0↖ 1↗)*
- [[analysis_jobs]] *(0↖ 1↗)*
- [[audit_logs]] *(0↖ 1↗)*
- [[user]] *(0↖ 1↗)*
- [[organization]] *(0↖ 1↗)*
- [[organization_member]] *(0↖ 1↗)*
- [[user_sessions]] *(0↖ 1↗)*
- [[account]] *(0↖ 1↗)*
- [[session]] *(0↖ 1↗)*
- [[verificationToken]] *(0↖ 1↗)*
- [[user_settings]] *(0↖ 1↗)*
- [[user_symbols]] *(0↖ 1↗)*
- [[plans]] *(0↖ 1↗)*
- [[subscriptions]] *(0↖ 1↗)*
- [[payments]] *(0↖ 1↗)*
- [[ipn_events]] *(0↖ 1↗)*
- [[bot_links]] *(0↖ 1↗)*
- [[briefings_emitted]] *(0↖ 1↗)*
- [[economic_events]] *(0↖ 1↗)*
- [[candles_1m]] *(0↖ 1↗)*
- [[chat_threads]] *(0↖ 1↗)*
- [[chat_messages]] *(0↖ 1↗)*
- [[cot_reports]] *(0↖ 1↗)*
- [[cron_runs]] *(0↖ 1↗)*
- [[daily_ai_spend]] *(0↖ 1↗)*
- [[diagnostic_traces]] *(0↖ 1↗)*
- [[feature_flags]] *(0↖ 1↗)*
- [[intermarket_resonance]] *(0↖ 1↗)*
- [[journal_entries]] *(0↖ 1↗)*
- [[live_ticks]] *(0↖ 1↗)*
- [[memory_embeddings]] *(0↖ 1↗)*
- [[news_articles]] *(0↖ 1↗)*
- [[news_embeddings]] *(0↖ 1↗)*
- [[notification_noise_state]] *(0↖ 1↗)*
- [[portfolio_positions]] *(0↖ 1↗)*
- [[portfolio_settings]] *(0↖ 1↗)*
- [[provider_daily_quota]] *(0↖ 1↗)*
- [[provider_health]] *(0↖ 1↗)*
- [[provider_tests]] *(0↖ 1↗)*
- [[push_subscriptions]] *(0↖ 1↗)*
- [[rate_limits]] *(0↖ 1↗)*
- [[shared_snapshots]] *(0↖ 1↗)*
- [[snapshots]] *(0↖ 1↗)*
- [[symbol_catalog]] *(0↖ 1↗)*
- [[telegram_updates]] *(0↖ 1↗)*
- [[chat_telemetry]] *(0↖ 1↗)*
- [[provider_throttle]] *(0↖ 1↗)*
- [[chat_tool_telemetry]] *(0↖ 1↗)*

### 📦 Package (1)
- [[@hamafx-db]] *(303↖ 0↗)*

