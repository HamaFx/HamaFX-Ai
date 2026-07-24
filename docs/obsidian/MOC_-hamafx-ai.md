---
type: moc
package: "@hamafx/ai"
nodes: 273
totalIncoming: 973
totalOutgoing: 1306
tags: [moc, hamafx-ai]
---

# 📦 @hamafx/ai

> **Map of Content** · 273 files · 973 incoming + 1306 outgoing = 2279 connections

## DataviewJS — All Files in This Package
```dataviewjs
const pages = dv.pages().where(p => p.package === "@hamafx/ai" && p.type);
dv.table(
  ['File', 'Type', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Files by Type

### 📁 Module (236)
- [[agent-runChat]] *(4↖ 39↗)*
- [[orchestrator-RunMultiAgentArgs]] *(0↖ 22↗)*
- [[dispatcher-BotDispatcher]] *(2↖ 18↗)*
- [[resolve-model-ResolveModelContext]] *(1↖ 14↗)*
- [[evaluator-parseIndicatorSpec]] *(6↖ 12↗)*
- [[generate-BriefingsEnv]] *(1↖ 12↗)*
- [[model-chat-ChatModelResolution]] *(1↖ 12↗)*
- [[decision]] *(2↖ 12↗)*
- [[market]] *(0↖ 12↗)*
- [[thread-summary-CompactResult]] *(1↖ 11↗)*
- [[base-agent-baseOpinionSchema]] *(7↖ 11↗)*
- [[ai-data.integration.test]] *(0↖ 11↗)*
- [[registry-BYOK_PROVIDERS]] *(0↖ 10↗)*
- [[auto-title-runAutoTitleBackground]] *(1↖ 10↗)*
- [[chat-retry-loop-AttemptContext]] *(4↖ 10↗)*
- [[review-ReviewTradeArgs]] *(0↖ 10↗)*
- [[context-BuildContextArgs]] *(4↖ 10↗)*
- [[planner-PlannerEnv]] *(2↖ 10↗)*
- [[webhook-TelegramUpdate]] *(0↖ 10↗)*
- [[journal]] *(0↖ 10↗)*
- [[base-agent-contract.test]] *(0↖ 10↗)*
- [[memory-index-MemoryKind]] *(8↖ 9↗)*
- [[model-override-OverrideResolution]] *(0↖ 9↗)*
- [[model-resolution-toModelDomain]] *(4↖ 9↗)*
- [[analysis]] *(0↖ 9↗)*
- [[system]] *(0↖ 9↗)*
- [[delivery-DeliveryResult]] *(2↖ 8↗)*
- [[context-buildLiveSnapshot]] *(2↖ 8↗)*
- [[model-embedding-EmbeddingModelResolution]] *(0↖ 8↗)*
- [[model-strategy-DomainRoutingContext]] *(0↖ 8↗)*
- [[model-vision-VisionModelResolution]] *(0↖ 8↗)*
- [[noise-state-DbNoiseState]] *(0↖ 8↗)*
- [[provider-tester-testProviderKey]] *(0↖ 8↗)*
- [[idor-persistence.test]] *(0↖ 8↗)*
- [[mutation-tools.test]] *(0↖ 8↗)*
- [[analyze-analyzeCommand]] *(1↖ 7↗)*
- [[ask-askCommand]] *(1↖ 7↗)*
- [[committee-committeeCommand]] *(1↖ 7↗)*
- [[persistence-getOrCreateBriefingsThread]] *(1↖ 7↗)*
- [[cost-DEFAULT_TURN_ESTIMATE_USD]] *(17↖ 7↗)*
- [[db-getDb]] *(41↖ 7↗)*
- [[model-helpers-PROVIDER_PRIORITY]] *(4↖ 7↗)*
- [[types-AnalysisMode]] *(34↖ 7↗)*
- [[rag-RagRow]] *(2↖ 7↗)*
- [[compute-DailySnapshot]] *(1↖ 7↗)*
- [[title-GenerateTitleArgs]] *(2↖ 7↗)*
- [[tool-context-ToolEnv]] *(33↖ 7↗)*
- [[alerts-evaluator-parallel.test]] *(0↖ 7↗)*
- [[chat-retry-loop.test]] *(0↖ 7↗)*
- [[me-meCommand]] *(1↖ 6↗)*
- [[status-statusCommand]] *(1↖ 6↗)*
- [[embeddings-EmbedTextsArgs]] *(4↖ 6↗)*
- [[persistence-CreateJournalInput]] *(6↖ 6↗)*
- [[agent-model-tierToDomain]] *(2↖ 6↗)*
- [[risk-service-computePnL]] *(1↖ 6↗)*
- [[tokens-DB]] *(3↖ 6↗)*
- [[get-system-diagnostics.test]] *(0↖ 6↗)*
- [[replay-setup.test]] *(0↖ 6↗)*
- [[run-system-action.test]] *(0↖ 6↗)*
- [[session-levels.test]] *(0↖ 6↗)*
- [[persistence-CreateAlertInput]] *(5↖ 5↗)*
- [[price-priceCommand]] *(1↖ 5↗)*
- [[settings-settingsCommand]] *(1↖ 5↗)*
- [[calendar-persistence-upsertEvents]] *(0↖ 5↗)*
- [[persistence-UpsertCoTReportArgs]] *(1↖ 5↗)*
- [[persistence-SaveOpinionsArgs]] *(1↖ 5↗)*
- [[news-persistence-upsertArticles]] *(0↖ 5↗)*
- [[message-persistence-DbMessage]] *(0↖ 5↗)*
- [[telemetry-persistence-TelemetryInput]] *(0↖ 5↗)*
- [[thread-persistence-DbThread]] *(1↖ 5↗)*
- [[position-service-createPosition]] *(1↖ 5↗)*
- [[risk-service.test]] *(0↖ 5↗)*
- [[system-LiveSnapshot]] *(9↖ 5↗)*
- [[routing-RoutingDomain]] *(10↖ 5↗)*
- [[social-sentiment-service-SentimentEnv]] *(1↖ 5↗)*
- [[persistence-CreateSnapshotArgs]] *(1↖ 5↗)*
- [[persistence-SnapshotRow]] *(0↖ 5↗)*
- [[briefings-generate.test]] *(0↖ 5↗)*
- [[budget-guard.test]] *(0↖ 5↗)*
- [[budget-reservation.test]] *(0↖ 5↗)*
- [[get-macro-resonance.test]] *(0↖ 5↗)*
- [[journal-stats.test]] *(0↖ 5↗)*
- [[last-closed-bar.test]] *(0↖ 5↗)*
- [[fallback.test]] *(0↖ 5↗)*
- [[stream.test]] *(0↖ 5↗)*
- [[rag.test]] *(0↖ 5↗)*
- [[snapshots-compute.test]] *(0↖ 5↗)*
- [[telegram.test]] *(0↖ 5↗)*
- [[anthropic-ANTHROPIC]] *(1↖ 4↗)*
- [[rule-registry-SpecFactory]] *(3↖ 4↗)*
- [[spec-RuleReading]] *(2↖ 4↗)*
- [[alert-alertCommand]] *(1↖ 4↗)*
- [[calendar-calendarCommand]] *(1↖ 4↗)*
- [[help-helpCommand]] *(1↖ 4↗)*
- [[link-linkCommand]] *(1↖ 4↗)*
- [[news-newsCommand]] *(1↖ 4↗)*
- [[positions-positionsCommand]] *(1↖ 4↗)*
- [[dispatcher.test]] *(0↖ 4↗)*
- [[catalogue-CatalogueEntry]] *(0↖ 4↗)*
- [[run-context-DiagnosticStep]] *(2↖ 4↗)*
- [[trace-persistence-PersistedTrace]] *(2↖ 4↗)*
- [[noise-control.test]] *(0↖ 4↗)*
- [[retry.test]] *(0↖ 4↗)*
- [[social-sentiment-service.test]] *(0↖ 4↗)*
- [[services-bootstrapServices]] *(0↖ 4↗)*
- [[with-telemetry-withTelemetry]] *(2↖ 4↗)*
- [[usage-TelemetryRow]] *(1↖ 4↗)*
- [[verification-CitationFinding]] *(5↖ 4↗)*
- [[byok-providers.test]] *(0↖ 4↗)*
- [[chat-helpers.test]] *(0↖ 4↗)*
- [[chat-model.test]] *(0↖ 4↗)*
- [[compute-position-health.test]] *(0↖ 4↗)*
- [[embeddings.test]] *(0↖ 4↗)*
- [[fusion.test]] *(0↖ 4↗)*
- [[override-model.test]] *(0↖ 4↗)*
- [[planner.test]] *(0↖ 4↗)*
- [[prompt.test]] *(0↖ 4↗)*
- [[semantic-routing.test]] *(0↖ 4↗)*
- [[verification.test]] *(0↖ 4↗)*
- [[vertex-byok.test]] *(0↖ 4↗)*
- [[with-telemetry.test]] *(0↖ 4↗)*
- [[helpers-CAPS_FULL]] *(6↖ 3↗)*
- [[types-ModelDomain]] *(6↖ 3↗)*
- [[vertex-VERTEX]] *(1↖ 3↗)*
- [[simulate-SimCandle]] *(1↖ 3↗)*
- [[chart-chartCommand]] *(1↖ 3↗)*
- [[linking.test]] *(0↖ 3↗)*
- [[linking-createLinkCode]] *(4↖ 3↗)*
- [[budget-reservation-BudgetHandle]] *(8↖ 3↗)*
- [[llm-throttle-noteLlmRateLimit]] *(3↖ 3↗)*
- [[modes-selectAgents]] *(3↖ 3↗)*
- [[stream-AgentProgressPart]] *(2↖ 3↗)*
- [[persistence-PushSubscriptionRow]] *(3↖ 3↗)*
- [[send-VapidEnv]] *(1↖ 3↗)*
- [[client-TelegramApiError]] *(2↖ 3↗)*
- [[mutation-guard-assertMutationIntent]] *(4↖ 3↗)*
- [[registry-ToolPlugin]] *(37↖ 3↗)*
- [[types-RunChatArgs]] *(6↖ 3↗)*
- [[alert-decide.test]] *(0↖ 3↗)*
- [[alert-simulate.test]] *(0↖ 3↗)*
- [[alert-snooze.test]] *(0↖ 3↗)*
- [[analyze-fundamental.test]] *(0↖ 3↗)*
- [[analyze-technical.test]] *(0↖ 3↗)*
- [[budget-race.test]] *(0↖ 3↗)*
- [[by-domain.test]] *(0↖ 3↗)*
- [[chaos-retry.test]] *(0↖ 3↗)*
- [[compose-journal-text.test]] *(0↖ 3↗)*
- [[compute-risk.test]] *(0↖ 3↗)*
- [[contract-tool-outputs.test]] *(0↖ 3↗)*
- [[cost-estimate.test]] *(0↖ 3↗)*
- [[cost.test]] *(0↖ 3↗)*
- [[cross-detection.test]] *(0↖ 3↗)*
- [[trace-persistence.test]] *(0↖ 3↗)*
- [[diagnostics.test]] *(0↖ 3↗)*
- [[eval-offline.test]] *(0↖ 3↗)*
- [[fallback.test]] *(0↖ 3↗)*
- [[fork-thread.test]] *(0↖ 3↗)*
- [[get-calendar.test]] *(0↖ 3↗)*
- [[get-candles.test]] *(0↖ 3↗)*
- [[get-market-structure.test]] *(0↖ 3↗)*
- [[get-news.test]] *(0↖ 3↗)*
- [[get-price.test]] *(0↖ 3↗)*
- [[llm-throttle.test]] *(0↖ 3↗)*
- [[message-text.test]] *(0↖ 3↗)*
- [[model-resolution.test]] *(0↖ 3↗)*
- [[model.test]] *(0↖ 3↗)*
- [[modes.test]] *(0↖ 3↗)*
- [[budget.test]] *(0↖ 3↗)*
- [[context.test]] *(0↖ 3↗)*
- [[modes.test]] *(0↖ 3↗)*
- [[parse-indicator-spec.test]] *(0↖ 3↗)*
- [[pem-normalize.test]] *(0↖ 3↗)*
- [[provider-id-from-model.test]] *(0↖ 3↗)*
- [[rate-limits.test]] *(0↖ 3↗)*
- [[redact.test]] *(0↖ 3↗)*
- [[routing.test]] *(0↖ 3↗)*
- [[test-provider-key.test]] *(0↖ 3↗)*
- [[thread-state.test]] *(0↖ 3↗)*
- [[title.test]] *(0↖ 3↗)*
- [[token-estimate.test]] *(0↖ 3↗)*
- [[tool-context.test]] *(0↖ 3↗)*
- [[tools.test]] *(0↖ 3↗)*
- [[verification-findings.test]] *(0↖ 3↗)*
- [[verification-precision.test]] *(0↖ 3↗)*
- [[verify-call.test]] *(0↖ 3↗)*
- [[vision-embedding-model.test]] *(0↖ 3↗)*
- [[eslint.config-config]] *(0↖ 2↗)*
- [[google-GOOGLE]] *(1↖ 2↗)*
- [[groq-mistral-openrouter-GROQ]] *(1↖ 2↗)*
- [[openai-OPENAI]] *(1↖ 2↗)*
- [[xai-deepseek-iamhc-XAI]] *(1↖ 2↗)*
- [[budget-guard-BudgetReservation]] *(2↖ 2↗)*
- [[helpers-countToolCalls]] *(2↖ 2↗)*
- [[index_tool-architecture-explorer|index]] *(2↖ 2↗)*
- [[runner-RunEvalsArgs]] *(1↖ 2↗)*
- [[instrumentation-initLangfuse]] *(0↖ 2↗)*
- [[message-text-sanitizeUserInput]] *(2↖ 2↗)*
- [[noise-control-NoiseState]] *(3↖ 2↗)*
- [[retry-getRetryAfterMs]] *(5↖ 2↗)*
- [[semantic-routing-SemanticRoutingDomain]] *(2↖ 2↗)*
- [[idempotency-isDuplicateUpdate]] *(2↖ 2↗)*
- [[by-domain-RoutingDomain]] *(2↖ 2↗)*
- [[vertex-factory-ResolveModelEnv]] *(12↖ 2↗)*
- [[wait-until-waitUntil]] *(1↖ 2↗)*
- [[context.test]] *(0↖ 2↗)*
- [[agents.test]] *(0↖ 2↗)*
- [[usage.test]] *(0↖ 2↗)*
- [[wait-until.test]] *(0↖ 2↗)*
- [[index_tool-architecture-explorer|index]] *(1↖ 1↗)*
- [[types-BotPlatform]] *(32↖ 1↗)*
- [[byok-providers]] *(13↖ 1↗)*
- [[redact-redactSecrets]] *(2↖ 1↗)*
- [[parse-stream-ParsedToolCall]] *(1↖ 1↗)*
- [[fallback-FallbackReason]] *(5↖ 1↗)*
- [[index_tool-architecture-explorer|index]] *(0↖ 1↗)*
- [[llm-client-GenerateTextOpts]] *(3↖ 1↗)*
- [[model-circuit-breaker-recordModelSuccess]] *(2↖ 1↗)*
- [[model]] *(30↖ 1↗)*
- [[index_tool-architecture-explorer|index]] *(0↖ 1↗)*
- [[index_tool-architecture-explorer|index]] *(0↖ 1↗)*
- [[persistence]] *(14↖ 1↗)*
- [[index_tool-architecture-explorer|index]] *(2↖ 1↗)*
- [[rate-limits-RateLimitData]] *(5↖ 1↗)*
- [[routing-keywords-RoutingKeywordPattern]] *(1↖ 1↗)*
- [[index_tool-architecture-explorer|index]] *(1↖ 1↗)*
- [[sign-ShareTokenPayload]] *(1↖ 1↗)*
- [[rate-limiter-RateLimitResult]] *(3↖ 1↗)*
- [[telemetry-telemetryConfig]] *(12↖ 1↗)*
- [[thread-state-ThreadState]] *(1↖ 1↗)*
- [[token-estimate-TokenEstimateResult]] *(2↖ 1↗)*
- [[index_tool-architecture-explorer|index]] *(8↖ 1↗)*
- [[concurrency-limitConcurrency]] *(1↖ 1↗)*
- [[pem-normalizePemPrivateKey]] *(3↖ 1↗)*
- [[regex-PRICE_TOKEN]] *(2↖ 1↗)*
- [[server-only]] *(0↖ 1↗)*
- [[vitest.config-defineConfig]] *(0↖ 1↗)*

### 🔧 AI Tool (32)
- [[convene_committee]] *(1↖ 14↗)*
- [[summarize_thread]] *(1↖ 9↗)*
- [[analyze_chart_image]] *(1↖ 8↗)*
- [[forecast_volatility]] *(1↖ 8↗)*
- [[run_system_action]] *(2↖ 8↗)*
- [[analyze_technical]] *(3↖ 7↗)*
- [[get_calendar]] *(2↖ 7↗)*
- [[get_journal_stats]] *(2↖ 7↗)*
- [[set_alert]] *(2↖ 7↗)*
- [[share_snapshot]] *(2↖ 7↗)*
- [[analyze_fundamental]] *(3↖ 6↗)*
- [[compute_position_health]] *(2↖ 6↗)*
- [[get_intermarket_resonance]] *(2↖ 6↗)*
- [[get_news]] *(2↖ 6↗)*
- [[get_system_diagnostics]] *(2↖ 6↗)*
- [[log_journal]] *(2↖ 6↗)*
- [[search_knowledge]] *(1↖ 6↗)*
- [[annotate_chart]] *(1↖ 5↗)*
- [[get_indicators]] *(1↖ 5↗)*
- [[get_market_structure]] *(2↖ 5↗)*
- [[get_social_sentiment]] *(1↖ 5↗)*
- [[replay_setup]] *(2↖ 5↗)*
- [[verify_call]] *(3↖ 5↗)*
- [[get_candles]] *(3↖ 4↗)*
- [[get_correlation]] *(1↖ 4↗)*
- [[get_co_t]] *(1↖ 4↗)*
- [[get_intermarket]] *(1↖ 4↗)*
- [[get_portfolio_snapshot]] *(1↖ 4↗)*
- [[get_price]] *(3↖ 4↗)*
- [[get_seasonality]] *(1↖ 4↗)*
- [[get_session_levels]] *(2↖ 4↗)*
- [[compute_risk]] *(4↖ 3↗)*

### 🤖 Agent (4)
- [[RiskAgent]] *(2↖ 6↗)*
- [[FundamentalAgent]] *(2↖ 5↗)*
- [[SentimentAgent]] *(2↖ 5↗)*
- [[TechnicalAgent]] *(2↖ 5↗)*

### 📦 Package (1)
- [[@hamafx-ai]] *(370↖ 0↗)*

