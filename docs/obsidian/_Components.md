---
type: index
category: "component"
count: 106
tags: [index, type/component]
---

# 🧩 Components (106)

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

- [[registry-ToolPartState]] · `@kestrel/web` · `apps/web/src/components/chat/parts/registry.tsx`  *(↖45 ↗35 = 80)*
- [[wizard-OnboardingWizard]] · `@kestrel/web` · `apps/web/src/components/onboarding/wizard.tsx`  *(↖0 ↗12 = 12)*
- [[message-Message]] · `@kestrel/web` · `apps/web/src/components/chat/message.tsx`  *(↖1 ↗10 = 11)*
- [[chat-screen-ChatScreen]] · `@kestrel/web` · `apps/web/src/components/chat/chat-screen.tsx`  *(↖0 ↗9 = 9)*
- [[analyze-fundamental-AnalyzeFundamentalPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/analyze-fundamental.tsx`  *(↖1 ↗5 = 6)*
- [[analyze-technical-AnalyzeTechnicalPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/analyze-technical.tsx`  *(↖1 ↗5 = 6)*
- [[annotate-chart-AnnotateChartPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/annotate-chart.tsx`  *(↖1 ↗5 = 6)*
- [[convene-committee-ConveneCommitteePart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/convene-committee.tsx`  *(↖1 ↗5 = 6)*
- [[get-cot-GetCoTPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-cot.tsx`  *(↖1 ↗5 = 6)*
- [[get-intermarket-GetIntermarketPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-intermarket.tsx`  *(↖1 ↗5 = 6)*
- [[get-journal-stats-GetJournalStatsPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-journal-stats.tsx`  *(↖1 ↗5 = 6)*
- [[get-session-levels-GetSessionLevelsPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-session-levels.tsx`  *(↖1 ↗5 = 6)*
- [[wizard-step-provider-WizardStepProvider]] · `@kestrel/web` · `apps/web/src/components/onboarding/_components/wizard-step-provider.tsx`  *(↖1 ↗5 = 6)*
- [[wizard-step-review-WizardStepReview]] · `@kestrel/web` · `apps/web/src/components/onboarding/_components/wizard-step-review.tsx`  *(↖1 ↗5 = 6)*
- [[performance-chart-PerformanceChart]] · `@kestrel/web` · `apps/web/src/components/chart/performance-chart.tsx`  *(↖0 ↗4 = 4)*
- [[chat-top-bar-AnalysisMode]] · `@kestrel/web` · `apps/web/src/components/chat/chat-top-bar.tsx`  *(↖3 ↗4 = 7)*
- [[analyze-chart-image-AnalyzeChartImagePart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/analyze-chart-image.tsx`  *(↖1 ↗4 = 5)*
- [[get-correlation-GetCorrelationPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-correlation.tsx`  *(↖1 ↗4 = 5)*
- [[ticker-tape-TickerTape]] · `@kestrel/web` · `apps/web/src/components/layout/ticker-tape.tsx`  *(↖0 ↗4 = 4)*
- [[article-card-ArticleCard]] · `@kestrel/web` · `apps/web/src/components/news/article-card.tsx`  *(↖0 ↗4 = 4)*
- [[event-card-EventCard]] · `@kestrel/web` · `apps/web/src/components/calendar/event-card.tsx`  *(↖0 ↗3 = 3)*
- [[pin-to-chat-PinToChatProps]] · `@kestrel/web` · `apps/web/src/components/chart/pin-to-chat.tsx`  *(↖0 ↗3 = 3)*
- [[regen-model-picker-RegenModelPicker]] · `@kestrel/web` · `apps/web/src/components/chat/_components/regen-model-picker.tsx`  *(↖1 ↗3 = 4)*
- [[thread-switcher-ThreadSwitcher]] · `@kestrel/web` · `apps/web/src/components/chat/_components/thread-switcher.tsx`  *(↖1 ↗3 = 4)*
- [[composer-ComposerImage]] · `@kestrel/web` · `apps/web/src/components/chat/composer.tsx`  *(↖1 ↗3 = 4)*
- [[citation-warning-CitationWarningPartView]] · `@kestrel/web` · `apps/web/src/components/chat/parts/citation-warning.tsx`  *(↖1 ↗3 = 4)*
- [[compute-position-health-ComputePositionHealthPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/compute-position-health.tsx`  *(↖1 ↗3 = 4)*
- [[compute-risk-ComputeRiskPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/compute-risk.tsx`  *(↖1 ↗3 = 4)*
- [[forecast-volatility-ForecastVolatilityPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/forecast-volatility.tsx`  *(↖1 ↗3 = 4)*
- [[get-calendar-GetCalendarPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-calendar.tsx`  *(↖1 ↗3 = 4)*
- [[get-intermarket-resonance-GetIntermarketResonancePart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-intermarket-resonance.tsx`  *(↖1 ↗3 = 4)*
- [[get-news-GetNewsPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-news.tsx`  *(↖1 ↗3 = 4)*
- [[get-seasonality-GetSeasonalityPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-seasonality.tsx`  *(↖1 ↗3 = 4)*
- [[get-system-diagnostics-GetSystemDiagnosticsPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-system-diagnostics.tsx`  *(↖1 ↗3 = 4)*
- [[log-journal-LogJournalPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/log-journal.tsx`  *(↖1 ↗3 = 4)*
- [[plan-PlanPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/plan.tsx`  *(↖1 ↗3 = 4)*
- [[replay-setup-ReplaySetupPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/replay-setup.tsx`  *(↖1 ↗3 = 4)*
- [[run-system-action-RunSystemActionPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/run-system-action.tsx`  *(↖1 ↗3 = 4)*
- [[search-knowledge-SearchKnowledgePart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/search-knowledge.tsx`  *(↖1 ↗3 = 4)*
- [[set-alert-SetAlertPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/set-alert.tsx`  *(↖1 ↗3 = 4)*
- [[share-snapshot-ShareSnapshotPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/share-snapshot.tsx`  *(↖1 ↗3 = 4)*
- [[summarize-thread-SummarizeThreadPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/summarize-thread.tsx`  *(↖1 ↗3 = 4)*
- [[verify-call-VerifyCallPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/verify-call.tsx`  *(↖1 ↗3 = 4)*
- [[quick-prompts-QuickPrompts]] · `@kestrel/web` · `apps/web/src/components/chat/quick-prompts.tsx`  *(↖1 ↗3 = 4)*
- [[wizard-step-style-WizardStepStyle]] · `@kestrel/web` · `apps/web/src/components/onboarding/_components/wizard-step-style.tsx`  *(↖1 ↗3 = 4)*
- [[wizard-step-symbols-WizardStepSymbols]] · `@kestrel/web` · `apps/web/src/components/onboarding/_components/wizard-step-symbols.tsx`  *(↖1 ↗3 = 4)*
- [[index-Providers]] · `@kestrel/web` · `apps/web/src/components/providers/index.tsx`  *(↖0 ↗3 = 3)*
- [[provider-info-dot-buildProviderTooltip]] · `@kestrel/web` · `apps/web/src/components/ui/provider-info-dot.tsx`  *(↖1 ↗3 = 4)*
- [[symbol-chip-SymbolChipProps]] · `@kestrel/web` · `apps/web/src/components/ui/symbol-chip.tsx`  *(↖0 ↗3 = 3)*
- [[price-tag-PriceTag]] · `@kestrel/web` · `apps/web/src/components/chart/price-tag.tsx`  *(↖0 ↗2 = 2)*
- [[symbol-picker-SymbolPicker]] · `@kestrel/web` · `apps/web/src/components/chart/symbol-picker.tsx`  *(↖0 ↗2 = 2)*
- [[timeframe-picker-TimeframePicker]] · `@kestrel/web` · `apps/web/src/components/chart/timeframe-picker.tsx`  *(↖0 ↗2 = 2)*
- [[message-footer-formatModelLabel]] · `@kestrel/web` · `apps/web/src/components/chat/_components/message-footer.tsx`  *(↖1 ↗2 = 3)*
- [[message-list-MessageList]] · `@kestrel/web` · `apps/web/src/components/chat/message-list.tsx`  *(↖1 ↗2 = 3)*
- [[get-candles-GetCandlesPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-candles.tsx`  *(↖1 ↗2 = 3)*
- [[get-indicators-GetIndicatorsPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-indicators.tsx`  *(↖1 ↗2 = 3)*
- [[get-market-structure-GetMarketStructurePart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-market-structure.tsx`  *(↖1 ↗2 = 3)*
- [[get-portfolio-snapshot-GetPortfolioSnapshotPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-portfolio-snapshot.tsx`  *(↖1 ↗2 = 3)*
- [[get-price-GetPricePart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-price.tsx`  *(↖1 ↗2 = 3)*
- [[get-social-sentiment-GetSocialSentimentPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/get-social-sentiment.tsx`  *(↖1 ↗2 = 3)*
- [[nav-drawer-NavDrawer]] · `@kestrel/web` · `apps/web/src/components/layout/nav-drawer.tsx`  *(↖0 ↗2 = 2)*
- [[nav-trigger-NavTrigger]] · `@kestrel/web` · `apps/web/src/components/layout/nav-trigger.tsx`  *(↖1 ↗2 = 3)*
- [[top-bar-TopBar]] · `@kestrel/web` · `apps/web/src/components/layout/top-bar.tsx`  *(↖0 ↗2 = 2)*
- [[use-bookmarks-useBookmarks]] · `@kestrel/web` · `apps/web/src/components/news/use-bookmarks.tsx`  *(↖1 ↗2 = 3)*
- [[confirm-drawer-ConfirmDrawer]] · `@kestrel/web` · `apps/web/src/components/ui/confirm-drawer.tsx`  *(↖0 ↗2 = 2)*
- [[stat-card-StatTone]] · `@kestrel/web` · `apps/web/src/components/ui/stat-card.tsx`  *(↖0 ↗2 = 2)*
- [[thread-summary-header-ThreadSummaryHeader]] · `@kestrel/web` · `apps/web/src/components/chat/_components/thread-summary-header.tsx`  *(↖1 ↗1 = 2)*
- [[composer-slash-menu-SlashMenuCommand]] · `@kestrel/web` · `apps/web/src/components/chat/composer-slash-menu.tsx`  *(↖1 ↗1 = 2)*
- [[nav-trigger-NavTrigger]] · `@kestrel/web` · `apps/web/src/components/chat/nav-trigger.tsx`  *(↖0 ↗1 = 1)*
- [[_shared-SharedSkeletonCardProps]] · `@kestrel/web` · `apps/web/src/components/chat/parts/_shared.tsx`  *(↖0 ↗1 = 1)*
- [[agent-deliberation-AgentDeliberation]] · `@kestrel/web` · `apps/web/src/components/chat/parts/agent-deliberation.tsx`  *(↖1 ↗1 = 2)*
- [[fallback-FallbackPartViewProps]] · `@kestrel/web` · `apps/web/src/components/chat/parts/fallback.tsx`  *(↖1 ↗1 = 2)*
- [[text-TextPart]] · `@kestrel/web` · `apps/web/src/components/chat/parts/text.tsx`  *(↖1 ↗1 = 2)*
- [[tool-card-ToolCard]] · `@kestrel/web` · `apps/web/src/components/chat/parts/tool-card.tsx`  *(↖1 ↗1 = 2)*
- [[command-palette-CommandPaletteProps]] · `@kestrel/web` · `apps/web/src/components/layout/command-palette.tsx`  *(↖0 ↗1 = 1)*
- [[install-nudge-InstallNudge]] · `@kestrel/web` · `apps/web/src/components/layout/install-nudge.tsx`  *(↖0 ↗1 = 1)*
- [[lazy-chrome-CommandPalette]] · `@kestrel/web` · `apps/web/src/components/layout/lazy-chrome.tsx`  *(↖0 ↗1 = 1)*
- [[nav-drawer-context-NavDrawerProvider]] · `@kestrel/web` · `apps/web/src/components/layout/nav-drawer-context.tsx`  *(↖2 ↗1 = 3)*
- [[offline-banner-OfflineBanner]] · `@kestrel/web` · `apps/web/src/components/layout/offline-banner.tsx`  *(↖0 ↗1 = 1)*
- [[page-header-PageHeader]] · `@kestrel/web` · `apps/web/src/components/layout/page-header.tsx`  *(↖0 ↗1 = 1)*
- [[skip-to-content-SkipToContent]] · `@kestrel/web` · `apps/web/src/components/layout/skip-to-content.tsx`  *(↖0 ↗1 = 1)*
- [[bookmarks-context-BookmarksProvider]] · `@kestrel/web` · `apps/web/src/components/news/bookmarks-context.tsx`  *(↖1 ↗1 = 2)*
- [[wizard-step-profile-WizardStepProfile]] · `@kestrel/web` · `apps/web/src/components/onboarding/_components/wizard-step-profile.tsx`  *(↖1 ↗1 = 2)*
- [[wizard-stepper-WizardStepper]] · `@kestrel/web` · `apps/web/src/components/onboarding/_components/wizard-stepper.tsx`  *(↖1 ↗1 = 2)*
- [[query-provider-QueryProvider]] · `@kestrel/web` · `apps/web/src/components/providers/query-provider.tsx`  *(↖1 ↗1 = 2)*
- [[sw-register-SwRegister]] · `@kestrel/web` · `apps/web/src/components/providers/sw-register.tsx`  *(↖0 ↗1 = 1)*
- [[time-provider-TimeProvider]] · `@kestrel/web` · `apps/web/src/components/providers/time-provider.tsx`  *(↖1 ↗1 = 2)*
- [[animated-number-AnimatedNumber]] · `@kestrel/web` · `apps/web/src/components/ui/animated-number.tsx`  *(↖0 ↗1 = 1)*
- [[badge-BadgeTone]] · `@kestrel/web` · `apps/web/src/components/ui/badge.tsx`  *(↖0 ↗1 = 1)*
- [[button-ButtonProps]] · `@kestrel/web` · `apps/web/src/components/ui/button.tsx`  *(↖1 ↗1 = 2)*
- [[card-CardProps]] · `@kestrel/web` · `apps/web/src/components/ui/card.tsx`  *(↖0 ↗1 = 1)*
- [[drawer-Drawer]] · `@kestrel/web` · `apps/web/src/components/ui/drawer.tsx`  *(↖0 ↗1 = 1)*
- [[empty-state-EmptyState]] · `@kestrel/web` · `apps/web/src/components/ui/empty-state.tsx`  *(↖0 ↗1 = 1)*
- [[field-Field]] · `@kestrel/web` · `apps/web/src/components/ui/field.tsx`  *(↖0 ↗1 = 1)*
- [[input-InputProps]] · `@kestrel/web` · `apps/web/src/components/ui/input.tsx`  *(↖0 ↗1 = 1)*
- [[leverage-gauge-LeverageGauge]] · `@kestrel/web` · `apps/web/src/components/ui/leverage-gauge.tsx`  *(↖0 ↗1 = 1)*
- [[motion-config-MotionRoot]] · `@kestrel/web` · `apps/web/src/components/ui/motion-config.tsx`  *(↖0 ↗1 = 1)*
- [[segmented-SegmentedVariant]] · `@kestrel/web` · `apps/web/src/components/ui/segmented.tsx`  *(↖0 ↗1 = 1)*
- [[skeleton-Skeleton]] · `@kestrel/web` · `apps/web/src/components/ui/skeleton.tsx`  *(↖0 ↗1 = 1)*
- [[sparkline-canvas-SparklineCanvas]] · `@kestrel/web` · `apps/web/src/components/ui/sparkline-canvas.tsx`  *(↖0 ↗1 = 1)*
- [[sparkline-Sparkline]] · `@kestrel/web` · `apps/web/src/components/ui/sparkline.tsx`  *(↖1 ↗1 = 2)*
- [[stale-indicator-StaleIndicator]] · `@kestrel/web` · `apps/web/src/components/ui/stale-indicator.tsx`  *(↖0 ↗1 = 1)*
- [[switch-Switch]] · `@kestrel/web` · `apps/web/src/components/ui/switch.tsx`  *(↖0 ↗1 = 1)*
- [[tag-input-TagInputProps]] · `@kestrel/web` · `apps/web/src/components/ui/tag-input.tsx`  *(↖0 ↗1 = 1)*
- [[toaster-Toaster]] · `@kestrel/web` · `apps/web/src/components/ui/toaster.tsx`  *(↖0 ↗1 = 1)*
- [[tooltip-Tooltip]] · `@kestrel/web` · `apps/web/src/components/ui/tooltip.tsx`  *(↖0 ↗1 = 1)*
