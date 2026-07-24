---
type: index
category: "component"
count: 112
tags: [index, type/component]
---

# 🧩 Components (112)

## DataviewJS — Sorted by Most Connected
```dataviewjs
const pages = dv.pages().where(p => p.type === "component");
dv.table(
  ['Name', 'Package', 'Path', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.package || '', p.path || '', p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Full List

- [[registry-ToolPartState]] · `@hamafx/web` · `apps/web/src/components/chat/parts/registry.tsx`  *(↖45 ↗35 = 80)*
- [[wizard-OnboardingWizard]] · `@hamafx/web` · `apps/web/src/components/onboarding/wizard.tsx`  *(↖0 ↗13 = 13)*
- [[chart-canvas-ChartCanvasHandle]] · `@hamafx/web` · `apps/web/src/components/chart/chart-canvas.tsx`  *(↖1 ↗11 = 12)*
- [[message-Message]] · `@hamafx/web` · `apps/web/src/components/chat/message.tsx`  *(↖1 ↗10 = 11)*
- [[chat-screen-ChatScreen]] · `@hamafx/web` · `apps/web/src/components/chat/chat-screen.tsx`  *(↖0 ↗9 = 9)*
- [[chart-atr-ChartATRProps]] · `@hamafx/web` · `apps/web/src/components/chart/chart-atr.tsx`  *(↖1 ↗8 = 9)*
- [[chart-macd-ChartMACDProps]] · `@hamafx/web` · `apps/web/src/components/chart/chart-macd.tsx`  *(↖1 ↗8 = 9)*
- [[chart-rsi-ChartRSIProps]] · `@hamafx/web` · `apps/web/src/components/chart/chart-rsi.tsx`  *(↖1 ↗8 = 9)*
- [[chart-Chart]] · `@hamafx/web` · `apps/web/src/components/chart/chart.tsx`  *(↖3 ↗8 = 11)*
- [[performance-chart-PerformanceChart]] · `@hamafx/web` · `apps/web/src/components/chart/performance-chart.tsx`  *(↖0 ↗5 = 5)*
- [[analyze-fundamental-AnalyzeFundamentalPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/analyze-fundamental.tsx`  *(↖1 ↗5 = 6)*
- [[analyze-technical-AnalyzeTechnicalPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/analyze-technical.tsx`  *(↖1 ↗5 = 6)*
- [[annotate-chart-AnnotateChartPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/annotate-chart.tsx`  *(↖1 ↗5 = 6)*
- [[convene-committee-ConveneCommitteePart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/convene-committee.tsx`  *(↖1 ↗5 = 6)*
- [[get-cot-GetCoTPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-cot.tsx`  *(↖1 ↗5 = 6)*
- [[get-intermarket-GetIntermarketPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-intermarket.tsx`  *(↖1 ↗5 = 6)*
- [[get-journal-stats-GetJournalStatsPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-journal-stats.tsx`  *(↖1 ↗5 = 6)*
- [[get-session-levels-GetSessionLevelsPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-session-levels.tsx`  *(↖1 ↗5 = 6)*
- [[wizard-step-provider-WizardStepProvider]] · `@hamafx/web` · `apps/web/src/components/onboarding/_components/wizard-step-provider.tsx`  *(↖1 ↗5 = 6)*
- [[wizard-step-review-WizardStepReview]] · `@hamafx/web` · `apps/web/src/components/onboarding/_components/wizard-step-review.tsx`  *(↖1 ↗5 = 6)*
- [[overlay-toggle-useOverlayToggles]] · `@hamafx/web` · `apps/web/src/components/chart/overlay-toggle.tsx`  *(↖0 ↗4 = 4)*
- [[chat-top-bar-AnalysisMode]] · `@hamafx/web` · `apps/web/src/components/chat/chat-top-bar.tsx`  *(↖3 ↗4 = 7)*
- [[analyze-chart-image-AnalyzeChartImagePart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/analyze-chart-image.tsx`  *(↖1 ↗4 = 5)*
- [[get-correlation-GetCorrelationPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-correlation.tsx`  *(↖1 ↗4 = 5)*
- [[ticker-tape-TickerTape]] · `@hamafx/web` · `apps/web/src/components/layout/ticker-tape.tsx`  *(↖0 ↗4 = 4)*
- [[article-card-ArticleCard]] · `@hamafx/web` · `apps/web/src/components/news/article-card.tsx`  *(↖0 ↗4 = 4)*
- [[event-card-EventCard]] · `@hamafx/web` · `apps/web/src/components/calendar/event-card.tsx`  *(↖0 ↗3 = 3)*
- [[chart-settings-drawer-ChartIndicators]] · `@hamafx/web` · `apps/web/src/components/chart/chart-settings-drawer.tsx`  *(↖0 ↗3 = 3)*
- [[pin-to-chat-PinToChatProps]] · `@hamafx/web` · `apps/web/src/components/chart/pin-to-chat.tsx`  *(↖0 ↗3 = 3)*
- [[regen-model-picker-RegenModelPicker]] · `@hamafx/web` · `apps/web/src/components/chat/_components/regen-model-picker.tsx`  *(↖1 ↗3 = 4)*
- [[thread-switcher-ThreadSwitcher]] · `@hamafx/web` · `apps/web/src/components/chat/_components/thread-switcher.tsx`  *(↖1 ↗3 = 4)*
- [[composer-ComposerImage]] · `@hamafx/web` · `apps/web/src/components/chat/composer.tsx`  *(↖1 ↗3 = 4)*
- [[citation-warning-CitationWarningPartView]] · `@hamafx/web` · `apps/web/src/components/chat/parts/citation-warning.tsx`  *(↖1 ↗3 = 4)*
- [[compute-position-health-ComputePositionHealthPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/compute-position-health.tsx`  *(↖1 ↗3 = 4)*
- [[compute-risk-ComputeRiskPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/compute-risk.tsx`  *(↖1 ↗3 = 4)*
- [[forecast-volatility-ForecastVolatilityPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/forecast-volatility.tsx`  *(↖1 ↗3 = 4)*
- [[get-calendar-GetCalendarPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-calendar.tsx`  *(↖1 ↗3 = 4)*
- [[get-intermarket-resonance-GetIntermarketResonancePart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-intermarket-resonance.tsx`  *(↖1 ↗3 = 4)*
- [[get-news-GetNewsPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-news.tsx`  *(↖1 ↗3 = 4)*
- [[get-seasonality-GetSeasonalityPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-seasonality.tsx`  *(↖1 ↗3 = 4)*
- [[get-system-diagnostics-GetSystemDiagnosticsPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-system-diagnostics.tsx`  *(↖1 ↗3 = 4)*
- [[log-journal-LogJournalPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/log-journal.tsx`  *(↖1 ↗3 = 4)*
- [[plan-PlanPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/plan.tsx`  *(↖1 ↗3 = 4)*
- [[replay-setup-ReplaySetupPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/replay-setup.tsx`  *(↖1 ↗3 = 4)*
- [[run-system-action-RunSystemActionPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/run-system-action.tsx`  *(↖1 ↗3 = 4)*
- [[search-knowledge-SearchKnowledgePart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/search-knowledge.tsx`  *(↖1 ↗3 = 4)*
- [[set-alert-SetAlertPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/set-alert.tsx`  *(↖1 ↗3 = 4)*
- [[share-snapshot-ShareSnapshotPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/share-snapshot.tsx`  *(↖1 ↗3 = 4)*
- [[summarize-thread-SummarizeThreadPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/summarize-thread.tsx`  *(↖1 ↗3 = 4)*
- [[verify-call-VerifyCallPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/verify-call.tsx`  *(↖1 ↗3 = 4)*
- [[quick-prompts-QuickPrompts]] · `@hamafx/web` · `apps/web/src/components/chat/quick-prompts.tsx`  *(↖1 ↗3 = 4)*
- [[wizard-step-style-WizardStepStyle]] · `@hamafx/web` · `apps/web/src/components/onboarding/_components/wizard-step-style.tsx`  *(↖1 ↗3 = 4)*
- [[wizard-step-symbols-WizardStepSymbols]] · `@hamafx/web` · `apps/web/src/components/onboarding/_components/wizard-step-symbols.tsx`  *(↖1 ↗3 = 4)*
- [[index-Providers]] · `@hamafx/web` · `apps/web/src/components/providers/index.tsx`  *(↖0 ↗3 = 3)*
- [[provider-info-dot-buildProviderTooltip]] · `@hamafx/web` · `apps/web/src/components/ui/provider-info-dot.tsx`  *(↖1 ↗3 = 4)*
- [[symbol-chip-SymbolChipProps]] · `@hamafx/web` · `apps/web/src/components/ui/symbol-chip.tsx`  *(↖0 ↗3 = 3)*
- [[price-tag-PriceTag]] · `@hamafx/web` · `apps/web/src/components/chart/price-tag.tsx`  *(↖0 ↗2 = 2)*
- [[symbol-picker-SymbolPicker]] · `@hamafx/web` · `apps/web/src/components/chart/symbol-picker.tsx`  *(↖0 ↗2 = 2)*
- [[timeframe-picker-TimeframePicker]] · `@hamafx/web` · `apps/web/src/components/chart/timeframe-picker.tsx`  *(↖0 ↗2 = 2)*
- [[message-footer-formatModelLabel]] · `@hamafx/web` · `apps/web/src/components/chat/_components/message-footer.tsx`  *(↖1 ↗2 = 3)*
- [[message-list-MessageList]] · `@hamafx/web` · `apps/web/src/components/chat/message-list.tsx`  *(↖1 ↗2 = 3)*
- [[get-candles-GetCandlesPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-candles.tsx`  *(↖1 ↗2 = 3)*
- [[get-indicators-GetIndicatorsPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-indicators.tsx`  *(↖1 ↗2 = 3)*
- [[get-market-structure-GetMarketStructurePart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-market-structure.tsx`  *(↖1 ↗2 = 3)*
- [[get-portfolio-snapshot-GetPortfolioSnapshotPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-portfolio-snapshot.tsx`  *(↖1 ↗2 = 3)*
- [[get-price-GetPricePart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-price.tsx`  *(↖1 ↗2 = 3)*
- [[get-social-sentiment-GetSocialSentimentPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/get-social-sentiment.tsx`  *(↖1 ↗2 = 3)*
- [[nav-drawer-NavDrawer]] · `@hamafx/web` · `apps/web/src/components/layout/nav-drawer.tsx`  *(↖0 ↗2 = 2)*
- [[nav-trigger-NavTrigger]] · `@hamafx/web` · `apps/web/src/components/layout/nav-trigger.tsx`  *(↖1 ↗2 = 3)*
- [[top-bar-TopBar]] · `@hamafx/web` · `apps/web/src/components/layout/top-bar.tsx`  *(↖0 ↗2 = 2)*
- [[use-bookmarks-useBookmarks]] · `@hamafx/web` · `apps/web/src/components/news/use-bookmarks.tsx`  *(↖1 ↗2 = 3)*
- [[confirm-drawer-ConfirmDrawer]] · `@hamafx/web` · `apps/web/src/components/ui/confirm-drawer.tsx`  *(↖0 ↗2 = 2)*
- [[stat-card-StatTone]] · `@hamafx/web` · `apps/web/src/components/ui/stat-card.tsx`  *(↖0 ↗2 = 2)*
- [[thread-summary-header-ThreadSummaryHeader]] · `@hamafx/web` · `apps/web/src/components/chat/_components/thread-summary-header.tsx`  *(↖1 ↗1 = 2)*
- [[composer-slash-menu-SlashMenuCommand]] · `@hamafx/web` · `apps/web/src/components/chat/composer-slash-menu.tsx`  *(↖1 ↗1 = 2)*
- [[nav-trigger-NavTrigger]] · `@hamafx/web` · `apps/web/src/components/chat/nav-trigger.tsx`  *(↖0 ↗1 = 1)*
- [[_shared-SharedSkeletonCardProps]] · `@hamafx/web` · `apps/web/src/components/chat/parts/_shared.tsx`  *(↖0 ↗1 = 1)*
- [[agent-deliberation-AgentDeliberation]] · `@hamafx/web` · `apps/web/src/components/chat/parts/agent-deliberation.tsx`  *(↖1 ↗1 = 2)*
- [[fallback-FallbackPartViewProps]] · `@hamafx/web` · `apps/web/src/components/chat/parts/fallback.tsx`  *(↖1 ↗1 = 2)*
- [[text-TextPart]] · `@hamafx/web` · `apps/web/src/components/chat/parts/text.tsx`  *(↖1 ↗1 = 2)*
- [[tool-card-ToolCard]] · `@hamafx/web` · `apps/web/src/components/chat/parts/tool-card.tsx`  *(↖1 ↗1 = 2)*
- [[command-palette-CommandPaletteProps]] · `@hamafx/web` · `apps/web/src/components/layout/command-palette.tsx`  *(↖0 ↗1 = 1)*
- [[install-nudge-InstallNudge]] · `@hamafx/web` · `apps/web/src/components/layout/install-nudge.tsx`  *(↖0 ↗1 = 1)*
- [[lazy-chrome-CommandPalette]] · `@hamafx/web` · `apps/web/src/components/layout/lazy-chrome.tsx`  *(↖0 ↗1 = 1)*
- [[nav-drawer-context-NavDrawerProvider]] · `@hamafx/web` · `apps/web/src/components/layout/nav-drawer-context.tsx`  *(↖2 ↗1 = 3)*
- [[offline-banner-OfflineBanner]] · `@hamafx/web` · `apps/web/src/components/layout/offline-banner.tsx`  *(↖0 ↗1 = 1)*
- [[page-header-PageHeader]] · `@hamafx/web` · `apps/web/src/components/layout/page-header.tsx`  *(↖0 ↗1 = 1)*
- [[skip-to-content-SkipToContent]] · `@hamafx/web` · `apps/web/src/components/layout/skip-to-content.tsx`  *(↖0 ↗1 = 1)*
- [[bookmarks-context-BookmarksProvider]] · `@hamafx/web` · `apps/web/src/components/news/bookmarks-context.tsx`  *(↖1 ↗1 = 2)*
- [[wizard-step-profile-WizardStepProfile]] · `@hamafx/web` · `apps/web/src/components/onboarding/_components/wizard-step-profile.tsx`  *(↖1 ↗1 = 2)*
- [[wizard-stepper-WizardStepper]] · `@hamafx/web` · `apps/web/src/components/onboarding/_components/wizard-stepper.tsx`  *(↖1 ↗1 = 2)*
- [[query-provider-QueryProvider]] · `@hamafx/web` · `apps/web/src/components/providers/query-provider.tsx`  *(↖1 ↗1 = 2)*
- [[sw-register-SwRegister]] · `@hamafx/web` · `apps/web/src/components/providers/sw-register.tsx`  *(↖0 ↗1 = 1)*
- [[time-provider-TimeProvider]] · `@hamafx/web` · `apps/web/src/components/providers/time-provider.tsx`  *(↖1 ↗1 = 2)*
- [[animated-number-AnimatedNumber]] · `@hamafx/web` · `apps/web/src/components/ui/animated-number.tsx`  *(↖0 ↗1 = 1)*
- [[badge-BadgeTone]] · `@hamafx/web` · `apps/web/src/components/ui/badge.tsx`  *(↖0 ↗1 = 1)*
- [[button-ButtonProps]] · `@hamafx/web` · `apps/web/src/components/ui/button.tsx`  *(↖1 ↗1 = 2)*
- [[drawer]] · `@hamafx/web` · `apps/web/src/components/ui/drawer.tsx`  *(↖0 ↗1 = 1)*
- [[empty-state-EmptyState]] · `@hamafx/web` · `apps/web/src/components/ui/empty-state.tsx`  *(↖0 ↗1 = 1)*
- [[field-Field]] · `@hamafx/web` · `apps/web/src/components/ui/field.tsx`  *(↖0 ↗1 = 1)*
- [[input-InputProps]] · `@hamafx/web` · `apps/web/src/components/ui/input.tsx`  *(↖0 ↗1 = 1)*
- [[leverage-gauge-LeverageGauge]] · `@hamafx/web` · `apps/web/src/components/ui/leverage-gauge.tsx`  *(↖0 ↗1 = 1)*
- [[motion-config-MotionRoot]] · `@hamafx/web` · `apps/web/src/components/ui/motion-config.tsx`  *(↖0 ↗1 = 1)*
- [[segmented-SegmentedVariant]] · `@hamafx/web` · `apps/web/src/components/ui/segmented.tsx`  *(↖0 ↗1 = 1)*
- [[skeleton-Skeleton]] · `@hamafx/web` · `apps/web/src/components/ui/skeleton.tsx`  *(↖0 ↗1 = 1)*
- [[sparkline-canvas-SparklineCanvas]] · `@hamafx/web` · `apps/web/src/components/ui/sparkline-canvas.tsx`  *(↖0 ↗1 = 1)*
- [[sparkline-Sparkline]] · `@hamafx/web` · `apps/web/src/components/ui/sparkline.tsx`  *(↖1 ↗1 = 2)*
- [[stale-indicator-StaleIndicator]] · `@hamafx/web` · `apps/web/src/components/ui/stale-indicator.tsx`  *(↖0 ↗1 = 1)*
- [[switch-Switch]] · `@hamafx/web` · `apps/web/src/components/ui/switch.tsx`  *(↖0 ↗1 = 1)*
- [[tag-input-TagInputProps]] · `@hamafx/web` · `apps/web/src/components/ui/tag-input.tsx`  *(↖0 ↗1 = 1)*
- [[toaster-Toaster]] · `@hamafx/web` · `apps/web/src/components/ui/toaster.tsx`  *(↖0 ↗1 = 1)*
- [[tooltip-Tooltip]] · `@hamafx/web` · `apps/web/src/components/ui/tooltip.tsx`  *(↖0 ↗1 = 1)*
