---
type: moc
package: "@hamafx/shared"
nodes: 84
totalIncoming: 821
totalOutgoing: 250
tags: [moc, hamafx-shared]
---

# 📦 @hamafx/shared

> **Map of Content** · 84 files · 821 incoming + 250 outgoing = 1071 connections

## DataviewJS — All Files in This Package
```dataviewjs
const pages = dv.pages().where(p => p.package === "@hamafx/shared" && p.type);
dv.table(
  ['File', 'Type', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Files by Type

### 📁 Module (83)
- [[tool-io-UiTextPart]] *(1↖ 67↗)*
- [[encryption-encryptByok]] *(1↖ 4↗)*
- [[logger-LOG_CATEGORIES]] *(3↖ 4↗)*
- [[analyze-chart-image-AnalyzeChartImageInputSchema]] *(2↖ 4↗)*
- [[analyze-fundamental-AnalyzeFundamentalInputSchema]] *(2↖ 4↗)*
- [[share-snapshot-ShareSnapshotInputSchema]] *(2↖ 4↗)*
- [[bug-report.test]] *(0↖ 4↗)*
- [[env.test]] *(0↖ 4↗)*
- [[error-patterns.test]] *(0↖ 4↗)*
- [[index_tool-architecture-explorer|index]] *(7↖ 3↗)*
- [[alerts-AlertChannelSchema]] *(0↖ 3↗)*
- [[candle-CandleSchema]] *(1↖ 3↗)*
- [[indicator-IndicatorKindSchema]] *(1↖ 3↗)*
- [[structure-SwingTypeSchema]] *(1↖ 3↗)*
- [[analyze-technical-AnalyzeTechnicalInputSchema]] *(2↖ 3↗)*
- [[annotate-chart-AnnotateChartKindSchema]] *(4↖ 3↗)*
- [[compute-position-health-ComputePositionHealthInputSchema]] *(2↖ 3↗)*
- [[convene-committee-ConveneCommitteeInputSchema]] *(2↖ 3↗)*
- [[forecast-volatility-ForecastVolatilityInputSchema]] *(2↖ 3↗)*
- [[get-correlation-GetCorrelationInputSchema]] *(2↖ 3↗)*
- [[get-journal-stats-GetJournalStatsInputSchema]] *(2↖ 3↗)*
- [[replay-setup-ReplayRuleEmaCrossSchema]] *(2↖ 3↗)*
- [[search-knowledge-SearchKnowledgeInputSchema]] *(2↖ 3↗)*
- [[verify-call-VerifyCallDirectionSchema]] *(2↖ 3↗)*
- [[ui-parts-PlanDomainSchema]] *(1↖ 3↗)*
- [[vault-loadSecretsFromVault]] *(0↖ 3↗)*
- [[billing-features.test]] *(0↖ 3↗)*
- [[biquote.test]] *(0↖ 3↗)*
- [[chat-stream.test]] *(0↖ 3↗)*
- [[encryption.test]] *(0↖ 3↗)*
- [[errors.test]] *(0↖ 3↗)*
- [[logger.test]] *(0↖ 3↗)*
- [[market-phase.test]] *(0↖ 3↗)*
- [[schemas.test]] *(0↖ 3↗)*
- [[tool-io.test]] *(0↖ 3↗)*
- [[eslint.config-config]] *(0↖ 2↗)*
- [[features-PLAN_FEATURES]] *(1↖ 2↗)*
- [[bug-report-DiagnosticStep]] *(1↖ 2↗)*
- [[error-patterns-ErrorPattern]] *(1↖ 2↗)*
- [[chat-ChatRoleSchema]] *(0↖ 2↗)*
- [[journal-TradeSideSchema]] *(2↖ 2↗)*
- [[live-tick-LiveTickSchema]] *(0↖ 2↗)*
- [[news-SymbolOrCurrencyTagSchema]] *(1↖ 2↗)*
- [[portfolio-PositionDirectionSchema]] *(0↖ 2↗)*
- [[sentiment-SentimentLabelSchema]] *(0↖ 2↗)*
- [[tick-TickSchema]] *(1↖ 2↗)*
- [[compute-risk-TradeDirectionSchema]] *(2↖ 2↗)*
- [[get-calendar-ToolCalendarItemSchema]] *(2↖ 2↗)*
- [[get-candles-GetCandlesOutputSchema]] *(2↖ 2↗)*
- [[get-cot-GetCoTInputSchema]] *(2↖ 2↗)*
- [[get-indicators-GetIndicatorsOutputSchema]] *(2↖ 2↗)*
- [[get-intermarket-resonance-GetIntermarketResonanceInputSchema]] *(2↖ 2↗)*
- [[get-intermarket-RiskRegimeSchema]] *(2↖ 2↗)*
- [[get-market-structure-GetMarketStructureOutputSchema]] *(2↖ 2↗)*
- [[get-news-ToolNewsItemSchema]] *(4↖ 2↗)*
- [[get-price-GetPriceOutputSchema]] *(2↖ 2↗)*
- [[get-seasonality-SeasonalityGranularitySchema]] *(2↖ 2↗)*
- [[get-session-levels-SessionTagSchema]] *(2↖ 2↗)*
- [[summarize-thread-SummarizeThreadInputSchema]] *(2↖ 2↗)*
- [[symbols-SYMBOLS]] *(31↖ 2↗)*
- [[tool-names-TOOL_NAMES]] *(3↖ 1↗)*
- [[index_tool-architecture-explorer|index]] *(0↖ 1↗)*
- [[byok-PROVIDER_IDS]] *(1↖ 1↗)*
- [[container-Token]] *(0↖ 1↗)*
- [[env-secrets-generateSecret]] *(1↖ 1↗)*
- [[env-ServerEnvSchema]] *(1↖ 1↗)*
- [[errors-ERROR_CODES]] *(3↖ 1↗)*
- [[log-stream-LogStreamClient]] *(1↖ 1↗)*
- [[market-phase-ForexSession]] *(1↖ 1↗)*
- [[biquote-BiquoteTickSchema]] *(0↖ 1↗)*
- [[briefings-BriefingKindSchema]] *(0↖ 1↗)*
- [[calendar-ImportanceSchema]] *(2↖ 1↗)*
- [[chat-stream-TextStartEventSchema]] *(1↖ 1↗)*
- [[noise-control-SeveritySchema]] *(0↖ 1↗)*
- [[get-portfolio-snapshot-GetPortfolioSnapshotOutputSchema]] *(2↖ 1↗)*
- [[get-social-sentiment-GetSocialSentimentOutputSchema]] *(2↖ 1↗)*
- [[get-system-diagnostics-GetSystemDiagnosticsInputSchema]] *(2↖ 1↗)*
- [[log-journal-LogJournalOutputSchema]] *(2↖ 1↗)*
- [[run-system-action-RunSystemActionInputSchema]] *(2↖ 1↗)*
- [[set-alert-SetAlertOutputSchema]] *(2↖ 1↗)*
- [[symbol-catalog-SymbolCategory]] *(1↖ 1↗)*
- [[timeframes-TIMEFRAMES]] *(13↖ 1↗)*
- [[vitest.config-defineConfig]] *(0↖ 1↗)*

### 📦 Package (1)
- [[@hamafx-shared]] *(671↖ 0↗)*

