> Subsequent change: frontend authentication was removed on `chore/vercel-frontend`; all surviving routes are public. This document records the earlier page-removal snapshot. See [current authentication and deployment status](vercel-deployment.md#authentication-removal).

> Pre-edit map recorded during Phase 1. Both C items were explicitly approved by the user. Final decisions and inventories are in [page-removal-report.md](page-removal-report.md). Awareness Python API/writer/recompute/scheduler/tests and its BigQuery table were subsequently reclassified B because daily emails and Copilot tools consume their data; they remain. The following snapshot preserves the original mapping evidence, not a pending approval request.

# Phase 1 removal and dependency map

Repository: dyglo/deplyze-quant. Repository files have not been edited. A = exclusive deletion candidate; B = shared, retain; C = confirmation required.

## Routes and ownership

| Requested page | Routes (including aliases) | Entry files |
|---|---|---|
| Intelligent Terminal | /terminal | `src/pages/IntelligenceTerminal.tsx` |
| Relation Maps | /relations-map; /cross-asset alias | `src/pages/RelationsMap.tsx` |
| World Equity | /market/world-equity | `src/pages/market/WorldEquityIntelligence.tsx` |
| US Sectors | /market/us-sectors | `src/pages/market/UsSectorIntelligence.tsx` |
| Countries and Regional | /market/countries | `src/pages/market/CountriesRegionalMarkets.tsx` |
| FX and Liquidity | /market/fx-liquidity | `src/pages/market/FxLiquidityIntelligence.tsx` |
| Portfolio | /portfolio; /portfolio/overview; /portfolio/holdings; /portfolio/exposure; /portfolio/attribution; /portfolio/risk; /portfolio/scenario; /portfolio/:portfolioId/awareness | `src/pages/portfolio/HoldingsWatchlist.tsx`, `src/pages/portfolio/PortfolioAwareness.tsx`, `src/pages/portfolio/ExposureAnalysis.tsx`, `src/pages/portfolio/PerformanceAttribution.tsx`, `src/pages/portfolio/ScenarioStress.tsx`, `src/pages/portfolio/RiskRegimeFit.tsx`, `src/pages/portfolio/PortfolioOverview.tsx` |
| Backtesting | /backtesting; /models alias | `src/pages/Backtesting.tsx` |
| Quant Lab | /lab | `src/pages/QuantLab.tsx` |
| Briefing | /briefings; /briefings/:id | `src/pages/Briefings.tsx`, `src/pages/BriefingDetail.tsx` |

## Frontend dependency table

The table includes the entire transitive component/hook/service/type/style dependency tree. Every static importer outside the proposed deletion set is listed; None means no such importer. Imports were resolved through relative paths and index barrels. Shared UI files are explicitly retained. The otherwise unreferenced relations barrel and LabSessionCard are included as removal-related orphans.

107 A files; 131 B files.

| Class | File | Every importer outside A |
|---|---|---|
| B | `src/components/AuthProvider.tsx` | `src/App.tsx`; `src/components/Layout.tsx`; `src/components/Settings.tsx`; `src/components/WorkspaceContext.tsx`; `src/components/WorkspaceModals.tsx`; `src/components/auth/AuthGate.tsx`; `src/components/auth/AuthPanel.tsx`; `src/components/market-home/GuestCopilotPreview.tsx`; `src/components/market-home/WatchlistRail.tsx`; `src/components/quant/RegimeIntelligencePanel.tsx`; `src/components/quant/historical-research/RecentRail.tsx`; `src/hooks/useAuth.ts`; `src/hooks/usePins.ts`; `src/hooks/usePortfolioWorkspace.ts`; `src/pages/HistoricalResearch.tsx`; `src/pages/InstrumentDetail.tsx`; `src/pages/MacroRegimeDesk.tsx`; `src/pages/MarketHome.tsx`; `src/pages/ResearchCopilot.tsx` |
| B | `src/components/WorkspaceContext.tsx` | `src/App.tsx`; `src/components/Layout.tsx`; `src/components/Settings.tsx`; `src/components/WorkspaceModals.tsx`; `src/components/market-home/WatchlistRail.tsx`; `src/components/quant/ArtifactDetailDrawerBody.tsx`; `src/components/quant/RegimeIntelligencePanel.tsx`; `src/components/quant/historical-intelligence/TimelineTab.tsx`; `src/hooks/useDashboardArtifacts.ts`; `src/hooks/usePortfolioWorkspace.ts`; `src/hooks/useResearchContext.ts`; `src/pages/ArtifactPage.tsx`; `src/pages/InstrumentDetail.tsx`; `src/pages/MacroRegimeDesk.tsx`; `src/pages/ResearchCopilot.tsx`; `src/pages/ResearchLibrary.tsx` |
| B | `src/components/auth/AuthGate.tsx` | `src/App.tsx`; `src/components/Layout.tsx`; `src/components/market-home/GuestCopilotPreview.tsx`; `src/pages/InstrumentDetail.tsx`; `src/pages/MarketHome.tsx` |
| B | `src/components/auth/AuthPanel.tsx` | `src/components/Login.tsx`; `src/components/auth/AuthGate.tsx` |
| B | `src/components/intelligence-drawer/ArtifactStrip.tsx` | `src/components/intelligence-drawer/index.ts` |
| B | `src/components/intelligence-drawer/IntelligenceDrawer.tsx` | `src/components/intelligence-drawer/index.ts` |
| B | `src/components/intelligence-drawer/NarrativeOverlay.tsx` | `src/components/intelligence-drawer/index.ts` |
| B | `src/components/intelligence-drawer/SummaryStrip.tsx` | `src/components/intelligence-drawer/index.ts` |
| B | `src/components/intelligence-drawer/index.ts` | `src/components/market-dashboards/InstrumentDetailDrawer.tsx`; `src/lib/intelligence/crossLinks.ts`; `src/lib/intelligence/historicalContext.ts`; `src/lib/intelligence/summaries.ts`; `src/pages/market/CommoditiesIntelligence.tsx`; `src/pages/market/GlobalYields.tsx` |
| B | `src/components/intelligence-drawer/sections/HistoricalSection.tsx` | `src/components/intelligence-drawer/IntelligenceDrawer.tsx`; `src/components/intelligence-drawer/index.ts` |
| B | `src/components/intelligence-drawer/sections/LinkedSection.tsx` | `src/components/intelligence-drawer/IntelligenceDrawer.tsx`; `src/components/intelligence-drawer/index.ts` |
| B | `src/components/intelligence-drawer/sections/MacroSection.tsx` | `src/components/intelligence-drawer/IntelligenceDrawer.tsx`; `src/components/intelligence-drawer/index.ts` |
| B | `src/components/intelligence-drawer/sections/NarrativeSection.tsx` | `src/components/intelligence-drawer/IntelligenceDrawer.tsx`; `src/components/intelligence-drawer/index.ts` |
| B | `src/components/intelligence-drawer/sections/RelatedSection.tsx` | `src/components/intelligence-drawer/IntelligenceDrawer.tsx`; `src/components/intelligence-drawer/index.ts` |
| B | `src/components/intelligence-drawer/sections/SectionShell.tsx` | `src/components/intelligence-drawer/sections/HistoricalSection.tsx`; `src/components/intelligence-drawer/sections/LinkedSection.tsx`; `src/components/intelligence-drawer/sections/MacroSection.tsx`; `src/components/intelligence-drawer/sections/NarrativeSection.tsx`; `src/components/intelligence-drawer/sections/RelatedSection.tsx`; `src/components/intelligence-drawer/sections/SummarySection.tsx` |
| B | `src/components/intelligence-drawer/sections/SummarySection.tsx` | `src/components/intelligence-drawer/IntelligenceDrawer.tsx`; `src/components/intelligence-drawer/index.ts` |
| B | `src/components/intelligence-drawer/sections/types.ts` | `src/components/intelligence-drawer/IntelligenceDrawer.tsx`; `src/components/intelligence-drawer/SummaryStrip.tsx`; `src/components/intelligence-drawer/index.ts`; `src/components/intelligence-drawer/sections/HistoricalSection.tsx`; `src/components/intelligence-drawer/sections/LinkedSection.tsx`; `src/components/intelligence-drawer/sections/MacroSection.tsx`; `src/components/intelligence-drawer/sections/NarrativeSection.tsx`; `src/components/intelligence-drawer/sections/RelatedSection.tsx`; `src/components/intelligence-drawer/sections/SummarySection.tsx` |
| B | `src/components/intelligence-drawer/useIntelligenceDrawer.ts` | `src/components/intelligence-drawer/index.ts` |
| B | `src/components/market-dashboards/CompactPerformanceTable.tsx` | `src/components/market-dashboards/index.ts`; `src/pages/market/CommoditiesIntelligence.tsx` |
| B | `src/components/market-dashboards/DashboardFilterBar.tsx` | `src/components/market-dashboards/index.ts`; `src/pages/market/CommoditiesIntelligence.tsx` |
| B | `src/components/market-dashboards/DashboardPageTabs.tsx` | `src/components/market-dashboards/index.ts`; `src/pages/market/CommoditiesIntelligence.tsx`; `src/pages/market/GlobalYields.tsx` |
| B | `src/components/market-dashboards/DashboardSectionCard.tsx` | `src/components/market-dashboards/index.ts`; `src/pages/market/CommoditiesIntelligence.tsx`; `src/pages/market/GlobalYields.tsx` |
| B | `src/components/market-dashboards/DashboardShell.tsx` | `src/components/market-dashboards/index.ts`; `src/pages/market/CommoditiesIntelligence.tsx`; `src/pages/market/GlobalYields.tsx` |
| B | `src/components/market-dashboards/DashboardStates.tsx` | `src/components/market-dashboards/index.ts`; `src/pages/market/CommoditiesIntelligence.tsx`; `src/pages/market/GlobalYields.tsx` |
| B | `src/components/market-dashboards/HeatmapGrid.tsx` | `src/components/market-dashboards/index.ts`; `src/pages/market/CommoditiesIntelligence.tsx` |
| B | `src/components/market-dashboards/InstrumentDetailDrawer.tsx` | `src/components/market-dashboards/index.ts`; `src/pages/market/CommoditiesIntelligence.tsx` |
| B | `src/components/market-dashboards/IntelligenceMetricCard.tsx` | `src/components/market-dashboards/index.ts`; `src/pages/market/CommoditiesIntelligence.tsx`; `src/pages/market/GlobalYields.tsx` |
| A | `src/components/portfolio/AgentPortfolioInsights.tsx` | None |
| A | `src/components/portfolio/NarrativeExposurePanel.tsx` | None |
| A | `src/components/portfolio/PortfolioIntelligencePanel.tsx` | None |
| B | `src/components/portfolio/PortfolioVulnerabilityPanel.tsx` | `src/components/quant/MacroRegimePortfolioPanel.tsx` |
| A | `src/components/portfolio/awareness/AwarenessHero.tsx` | None |
| A | `src/components/portfolio/awareness/AwarenessSnapshotControl.tsx` | None |
| A | `src/components/portfolio/awareness/AwarenessToneContext.tsx` | None |
| A | `src/components/portfolio/awareness/AwarenessToneControl.tsx` | None |
| A | `src/components/portfolio/awareness/CorrelationProfile.tsx` | None |
| A | `src/components/portfolio/awareness/MonitorNext.tsx` | None |
| A | `src/components/portfolio/awareness/PerformanceDistribution.tsx` | None |
| A | `src/components/portfolio/awareness/PositionActivity.tsx` | None |
| A | `src/components/portfolio/awareness/ReturnDecomposition.tsx` | None |
| A | `src/components/portfolio/awareness/RiskDecomposition.tsx` | None |
| A | `src/components/portfolio/awareness/SectionNarrative.tsx` | None |
| A | `src/components/portfolio/awareness/SectorDonut.tsx` | None |
| B | `src/components/quant/AgentIntelligenceFeed.tsx` | `src/pages/MacroRegimeDesk.tsx`; `src/pages/ResearchLibrary.tsx` |
| A | `src/components/quant/AlphaPanel.tsx` | None |
| A | `src/components/quant/AnalogBrowserPanel.tsx` | None |
| B | `src/components/quant/ArtifactCard.tsx` | `src/components/quant/IntelligenceFeed.tsx`; `src/components/quant/index.ts` |
| B | `src/components/quant/ArtifactDetailDrawerBody.tsx` | `src/pages/ArtifactPage.tsx`; `src/pages/MacroRegimeDesk.tsx`; `src/pages/ResearchLibrary.tsx` |
| B | `src/components/quant/AssetIcon.tsx` | `src/components/quant/CorrelationDrawerBody.tsx`; `src/components/quant/IntelligenceSidePanel.tsx`; `src/pages/InstrumentDetail.tsx` |
| A | `src/components/quant/BenchmarkIntelligencePanel.tsx` | None |
| A | `src/components/quant/BenchmarkOverlayPanel.css` | None |
| A | `src/components/quant/BenchmarkOverlayPanel.tsx` | None |
| B | `src/components/quant/ChartDownloadButton.tsx` | `src/components/quant/MacroSeriesChart.tsx`; `src/components/quant/OHLCVChart.tsx`; `src/components/quant/index.ts` |
| B | `src/components/quant/ConfidenceBadge.tsx` | `src/components/portfolio/PortfolioVulnerabilityPanel.tsx`; `src/components/quant/ArtifactCard.tsx`; `src/components/quant/ArtifactDetailDrawerBody.tsx`; `src/components/quant/MacroAnalogPanel.tsx`; `src/components/quant/ObservationShell.tsx`; `src/components/quant/historical-intelligence/AnalogsTab.tsx`; `src/components/quant/historical-intelligence/ForwardReturnsTab.tsx`; `src/components/quant/historical-intelligence/RegimeTab.tsx`; `src/components/quant/historical-intelligence/ReversionTab.tsx`; `src/components/quant/historical-intelligence/ScenarioTab.tsx`; `src/components/quant/historical-intelligence/TimelineTab.tsx`; `src/components/quant/index.ts` |
| A | `src/components/quant/ContextualReasoningCard.tsx` | None |
| B | `src/components/quant/DataDrawer.tsx` | `src/App.tsx`; `src/components/quant/GlobalMacroIndicatorsPanel.tsx`; `src/components/quant/V3P2MacroRegimePanel.tsx`; `src/pages/ArtifactPage.tsx`; `src/pages/MacroRegimeDesk.tsx`; `src/pages/ResearchLibrary.tsx` |
| B | `src/components/quant/Disclaimer.tsx` | `src/components/quant/index.ts`; `src/pages/ArtifactPage.tsx`; `src/pages/HistoricalIntelligenceTerminal.tsx`; `src/pages/HistoricalResearch.tsx`; `src/pages/InstrumentDetail.tsx`; `src/pages/MacroRegimeDesk.tsx`; `src/pages/MarketHome.tsx`; `src/pages/ResearchCopilot.tsx`; `src/pages/ResearchLibrary.tsx` |
| B | `src/components/quant/FreshnessBadge.tsx` | `src/components/market-dashboards/DashboardStates.tsx`; `src/components/market-dashboards/IntelligenceMetricCard.tsx`; `src/components/quant/CorrelationDrawerBody.tsx`; `src/components/quant/InstrumentOHLCVSection.tsx`; `src/pages/InstrumentDetail.tsx`; `src/pages/MacroRegimeDesk.tsx`; `src/pages/ResearchCopilot.tsx` |
| A | `src/components/quant/HeadlineDrawerBody.tsx` | None |
| A | `src/components/quant/HistoricalAnalogPanel.tsx` | None |
| A | `src/components/quant/InstrumentDrawerBody.tsx` | None |
| B | `src/components/quant/InstrumentSelector.tsx` | `src/components/quant/index.ts`; `src/pages/HistoricalIntelligenceTerminal.tsx` |
| B | `src/components/quant/IntelligenceFeed.tsx` | `src/components/quant/index.ts` |
| B | `src/components/quant/IntelligenceObservationCard.tsx` | `src/components/quant/AgentIntelligenceFeed.tsx`; `src/components/quant/InstrumentLayeredNews.tsx`; `src/components/quant/IntelligenceSidePanel.tsx` |
| B | `src/components/quant/IntelligenceSidePanel.tsx` | `src/components/market-dashboards/InstrumentDetailDrawer.tsx` |
| A | `src/components/quant/LabSessionCard.tsx` | None |
| A | `src/components/quant/LabSessionsTab.tsx` | None |
| B | `src/components/quant/MacroAnalogPanel.tsx` | `src/pages/MacroRegimeDesk.tsx` |
| B | `src/components/quant/MarketPulseStrip.tsx` | `src/components/market-dashboards/DashboardShell.tsx` |
| A | `src/components/quant/MarketTile.tsx` | None |
| B | `src/components/quant/NewsList.tsx` | `src/components/quant/InstrumentLayeredNews.tsx`; `src/components/quant/IntelligenceSidePanel.tsx`; `src/components/quant/index.ts` |
| B | `src/components/quant/ObservationShell.tsx` | `src/components/quant/IntelligenceObservationCard.tsx` |
| B | `src/components/quant/PageHeader.tsx` | `src/components/market-dashboards/DashboardShell.tsx`; `src/components/quant/index.ts`; `src/pages/ArtifactPage.tsx`; `src/pages/HistoricalIntelligenceTerminal.tsx`; `src/pages/HistoricalResearch.tsx`; `src/pages/MacroRegimeDesk.tsx`; `src/pages/ResearchCopilot.tsx`; `src/pages/ResearchLibrary.tsx` |
| A | `src/components/quant/PortfolioPanel.tsx` | None |
| B | `src/components/quant/RegimeBadge.tsx` | `src/components/quant/IntelligenceSidePanel.tsx`; `src/components/quant/index.ts` |
| B | `src/components/quant/RegimeIntelligencePanel.tsx` | `src/pages/InstrumentDetail.tsx` |
| A | `src/components/quant/RelatedIntelligencePanel.tsx` | None |
| A | `src/components/quant/ResearchTimeline.tsx` | None |
| A | `src/components/quant/RiskPanel.tsx` | None |
| A | `src/components/quant/RollingCorrelationPanel.tsx` | None |
| B | `src/components/quant/SignificanceMeter.tsx` | `src/components/quant/ArtifactCard.tsx`; `src/components/quant/ArtifactDetailDrawerBody.tsx`; `src/components/quant/index.ts` |
| B | `src/components/quant/Sparkline.tsx` | `src/components/market-dashboards/CompactPerformanceTable.tsx`; `src/components/market-dashboards/IntelligenceMetricCard.tsx`; `src/components/market-home/HeroIntelligence.tsx`; `src/components/quant/CorrelationDrawerBody.tsx`; `src/components/quant/IntelligenceSidePanel.tsx`; `src/components/quant/V3P2MacroRegimePanel.tsx`; `src/pages/MacroRegimeDesk.tsx` |
| B | `src/components/quant/StatTile.tsx` | `src/components/quant/index.ts` |
| B | `src/components/quant/SystemAnalyzingState.tsx` | `src/components/market-home/HeroIntelligence.tsx`; `src/components/market-home/RightRail.tsx`; `src/components/portfolio/PortfolioVulnerabilityPanel.tsx`; `src/components/quant/AgentIntelligenceFeed.tsx`; `src/components/quant/AgentStatusDashboard.tsx`; `src/components/quant/MacroAnalogPanel.tsx`; `src/pages/InstrumentDetail.tsx`; `src/pages/ResearchCopilot.tsx` |
| A | `src/components/quant/relations-map/ClusterBackdrop.tsx` | None |
| A | `src/components/quant/relations-map/CopilotSummary.tsx` | None |
| A | `src/components/quant/relations-map/EdgeFilterPopover.tsx` | None |
| A | `src/components/quant/relations-map/FloatingInsightCard.tsx` | None |
| A | `src/components/quant/relations-map/IntelligenceRail.tsx` | None |
| A | `src/components/quant/relations-map/NodeCardOverlay.tsx` | None |
| A | `src/components/quant/relations-map/OverlayControls.tsx` | None |
| A | `src/components/quant/relations-map/RelationsFilterBar.tsx` | None |
| A | `src/components/quant/relations-map/RelationsGraphCanvas.tsx` | None |
| A | `src/components/quant/relations-map/RelationsNodeDrawerBody.tsx` | None |
| A | `src/components/quant/relations-map/RelationsSidePanel.tsx` | None |
| A | `src/components/quant/relations-map/ReplayTimeline.tsx` | None |
| A | `src/components/quant/relations-map/SpotlightLens.tsx` | None |
| A | `src/components/quant/relations-map/index.ts` | None |
| A | `src/components/quant/relations-map/nodePalette.ts` | None |
| A | `src/components/quant/relations-map/radialLayout.ts` | None |
| A | `src/components/quant/relations-map/studyPresets.ts` | None |
| B | `src/components/ui/progress.tsx` | `src/components/quant/ArtifactDetailDrawerBody.tsx` |
| B | `src/components/ui/surface.tsx` | None |
| B | `src/hooks/useAgentIntelligence.ts` | `src/components/market-home/HeroIntelligence.tsx`; `src/components/market-home/IntelligenceSpotlight.tsx`; `src/components/market-home/PortfolioInsights.tsx`; `src/components/market-home/RightRail.tsx`; `src/components/quant/AgentStatusDashboard.tsx`; `src/components/quant/InstrumentLayeredNews.tsx`; `src/components/quant/IntelligenceSidePanel.tsx`; `src/pages/InstrumentDetail.tsx`; `src/pages/MacroRegimeDesk.tsx`; `src/pages/ResearchCopilot.tsx`; `src/pages/ResearchLibrary.tsx` |
| B | `src/hooks/useAgentReasoning.ts` | `src/components/quant/MacroRegimePortfolioPanel.tsx`; `src/pages/MacroRegimeDesk.tsx` |
| B | `src/hooks/useArtifacts.ts` | `src/components/quant/historical-intelligence/TimelineTab.tsx`; `src/hooks/useDashboardArtifacts.ts`; `src/hooks/useResearchContext.ts`; `src/pages/ArtifactPage.tsx`; `src/pages/InstrumentDetail.tsx`; `src/pages/MacroRegimeDesk.tsx`; `src/pages/ResearchCopilot.tsx`; `src/pages/ResearchLibrary.tsx` |
| A | `src/hooks/useAwarenessSnapshot.ts` | None |
| A | `src/hooks/useBacktest.ts` | None |
| A | `src/hooks/useBenchmarkIntelligence.ts` | None |
| A | `src/hooks/useBriefingGenerate.ts` | None |
| B | `src/hooks/useDashboard.ts` | `src/pages/market/CommoditiesIntelligence.tsx`; `src/pages/market/GlobalYields.tsx` |
| B | `src/hooks/useDashboardArtifacts.ts` | `src/pages/market/CommoditiesIntelligence.tsx`; `src/pages/market/GlobalYields.tsx` |
| B | `src/hooks/useDashboardNarratives.ts` | `src/components/intelligence-drawer/NarrativeOverlay.tsx`; `src/pages/market/CommoditiesIntelligence.tsx`; `src/pages/market/GlobalYields.tsx` |
| A | `src/hooks/useHistoricalAnalogs.ts` | None |
| B | `src/hooks/useInsights.ts` | `src/pages/ResearchCopilot.tsx` |
| B | `src/hooks/useInstrumentRegime.ts` | `src/components/quant/IntelligenceSidePanel.tsx`; `src/components/quant/RegimeIntelligencePanel.tsx` |
| A | `src/hooks/useLabSessions.ts` | None |
| B | `src/hooks/useMarket.ts` | `src/components/market-dashboards/InstrumentDetailDrawer.tsx`; `src/components/market-home/FeaturedChart.tsx`; `src/components/market-home/HeroIntelligence.tsx`; `src/components/quant/CorrelationDrawerBody.tsx`; `src/components/quant/InstrumentAdvancedChart.tsx`; `src/components/quant/InstrumentKeyStatistics.tsx`; `src/components/quant/InstrumentLayeredNews.tsx`; `src/components/quant/InstrumentOHLCVSection.tsx`; `src/components/quant/InstrumentSelector.tsx`; `src/components/quant/InstrumentTechnicalAnalysis.tsx`; `src/components/quant/IntelligenceSidePanel.tsx`; `src/components/quant/historical-intelligence/AnalogsTab.tsx`; `src/components/quant/historical-intelligence/BenchmarkTab.tsx`; `src/components/quant/historical-intelligence/ContextStrip.tsx`; `src/components/quant/historical-intelligence/ExtremesTab.tsx`; `src/components/quant/historical-intelligence/ForwardReturnsTab.tsx`; `src/components/quant/historical-intelligence/RegimeTab.tsx`; `src/components/quant/historical-intelligence/ReversionTab.tsx`; `src/components/quant/historical-intelligence/ScenarioTab.tsx`; `src/hooks/useHistoricalIntelligence.ts`; `src/hooks/useInstrumentRegime.ts`; `src/hooks/useQuantCopilotContext.ts`; `src/pages/InstrumentDetail.tsx`; `src/pages/ResearchCopilot.tsx` |
| B | `src/hooks/usePersonalization.ts` | `src/components/personalization/InvestigationsPanel.tsx`; `src/pages/ResearchCopilot.tsx` |
| B | `src/hooks/usePins.ts` | `src/components/quant/ArtifactDetailDrawerBody.tsx`; `src/hooks/useResearchContext.ts`; `src/pages/ResearchLibrary.tsx` |
| A | `src/hooks/usePortfolioIntelligence.ts` | None |
| A | `src/hooks/usePortfolioPerformance.ts` | None |
| B | `src/hooks/usePortfolioWorkspace.ts` | `src/components/market-home/PortfolioInsights.tsx`; `src/components/market-home/WatchlistRail.tsx`; `src/components/quant/MacroRegimePortfolioPanel.tsx` |
| B | `src/hooks/useSWR.ts` | `src/components/market-home/AnalysisOpinion.tsx`; `src/components/market-home/CalendarSection.tsx`; `src/components/market-home/HeroIntelligence.tsx`; `src/components/market-home/MarketDataGrid.tsx`; `src/components/market-home/MarketSnapshot.tsx`; `src/components/market-home/PortfolioInsights.tsx`; `src/components/market-home/RightRail.tsx`; `src/components/market-home/TickerTape.tsx`; `src/components/market-home/ValuationTable.tsx`; `src/components/market-home/WatchlistRail.tsx`; `src/components/quant/InstrumentEarningsChart.tsx`; `src/hooks/useAnalystRatings.ts`; `src/hooks/useDashboard.ts`; `src/hooks/useInstrument.ts`; `src/hooks/useInstrumentFinancials.ts`; `src/hooks/useMacro.ts`; `src/hooks/useMarket.ts`; `src/hooks/useOwnership.ts`; `src/hooks/usePeers.ts`; `src/hooks/useProviders.ts`; `src/hooks/useResearch.ts` |
| B | `src/hooks/useScreener.ts` | `src/components/quant/MarketPulseStrip.tsx` |
| A | `src/hooks/useSectorMetadata.ts` | None |
| A | `src/hooks/useTimeline.ts` | None |
| B | `src/lib/chartExport.ts` | `src/components/quant/ChartDownloadButton.tsx`; `src/components/quant/CorrelationHeatmap.tsx` |
| B | `src/lib/countryDatabase.ts` | `src/components/market-home/Flag.tsx` |
| B | `src/lib/firebase.ts` | `src/components/AuthProvider.tsx`; `src/components/WorkspaceContext.tsx`; `src/services/artifactService.ts`; `src/services/firestoreService.ts`; `src/services/gatewayClient.ts`; `src/services/insightService.ts`; `src/services/pinService.ts`; `src/services/portfolioService.ts`; `src/services/projectService.ts`; `src/services/savedHistoricalResearchService.ts`; `src/services/workspaceService.ts` |
| B | `src/lib/intelligence/crossLinks.ts` | `src/components/market-dashboards/InstrumentDetailDrawer.tsx` |
| B | `src/lib/intelligence/historicalContext.ts` | `src/components/market-dashboards/InstrumentDetailDrawer.tsx` |
| B | `src/lib/intelligence/predictionSchemas.ts` | `src/lib/quant/artifacts.ts` |
| B | `src/lib/intelligence/summaries.ts` | `src/pages/market/CommoditiesIntelligence.tsx`; `src/pages/market/GlobalYields.tsx` |
| B | `src/lib/market-data/contracts/index.ts` | `src/components/market-home/CalendarSection.tsx`; `src/components/quant/InstrumentEarningsChart.tsx`; `src/components/quant/InstrumentFinancialReport.tsx`; `src/lib/market-data/websocket/PolygonWebSocket.ts`; `src/services/earningsService.ts`; `src/services/edgarService.ts`; `src/services/fundamentalsService.ts`; `src/services/providerService.ts`; `src/services/valuationService.ts` |
| A | `src/lib/portfolio/awarenessAttribution.ts` | None |
| A | `src/lib/portfolio/awarenessFlag.ts` | None |
| A | `src/lib/portfolio/awarenessNarration.ts` | None |
| A | `src/lib/portfolio/awarenessTone.ts` | None |
| B | `src/lib/portfolio/benchmarks.ts` | `src/lib/portfolio/index.ts`; `src/services/portfolioService.ts` |
| A | `src/lib/portfolio/clientStress.ts` | None |
| B | `src/lib/portfolio/engine.ts` | `src/lib/portfolio/engine.test.ts`; `src/services/portfolioService.ts` |
| A | `src/lib/portfolio/fmt.ts` | None |
| A | `src/lib/portfolio/holdingAnalytics.ts` | None |
| B | `src/lib/portfolio/holdingMath.ts` | `src/lib/portfolio/holdingMath.test.ts` |
| A | `src/lib/portfolio/intelligenceEngine.ts` | None |
| B | `src/lib/portfolio/ledger.ts` | `src/lib/portfolio/engine.test.ts`; `src/lib/portfolio/engine.ts`; `src/lib/portfolio/ledger.test.ts`; `src/lib/portfolio/tradeTicket.ts`; `src/services/portfolioService.ts` |
| A | `src/lib/portfolio/monitorNext.ts` | None |
| B | `src/lib/portfolio/positionDiagnosis.ts` | `src/lib/portfolio/positionDiagnosis.test.ts` |
| B | `src/lib/portfolio/schemas.ts` | `src/components/market-home/WatchlistRail.tsx`; `src/hooks/usePortfolioWorkspace.ts`; `src/lib/portfolio/benchmarks.ts`; `src/lib/portfolio/engine.ts`; `src/lib/portfolio/index.ts`; `src/lib/portfolio/ledger.ts`; `src/pages/InstrumentDetail.tsx`; `src/services/portfolioService.ts` |
| A | `src/lib/portfolio/sectionNarratives.ts` | None |
| A | `src/lib/portfolio/snapshotPayload.ts` | None |
| B | `src/lib/portfolio/tradeTicket.ts` | `src/lib/portfolio/tradeTicket.test.ts` |
| B | `src/lib/providerLabels.ts` | `src/components/quant/ArtifactCard.tsx`; `src/components/quant/ArtifactDetailDrawerBody.tsx`; `src/components/quant/FreshnessBadge.tsx`; `src/components/quant/NewsList.tsx`; `src/lib/providerLabels.test.ts` |
| B | `src/lib/quant/analog.ts` | `src/lib/intelligence/historicalContext.ts`; `src/lib/quant/contextualAnalog.ts`; `src/lib/quant/copilotContext.ts`; `src/lib/quant/index.ts` |
| B | `src/lib/quant/anomalies.ts` | `src/lib/quant/copilotContext.ts`; `src/lib/quant/index.ts` |
| B | `src/lib/quant/artifacts.ts` | `src/lib/quant/anomalies.ts`; `src/lib/quant/index.ts` |
| B | `src/lib/quant/benchmark.ts` | `src/lib/quant/benchmarkIntel.ts`; `src/lib/quant/index.ts`; `src/lib/quant/regimes.ts` |
| B | `src/lib/quant/benchmarkIntel.ts` | `src/lib/quant/index.ts` |
| B | `src/lib/quant/contextualAnalog.ts` | `src/lib/quant/index.ts` |
| B | `src/lib/quant/copilotContext.ts` | `src/lib/quant/index.ts` |
| B | `src/lib/quant/correlation.ts` | `src/hooks/useHistoricalResearch.ts`; `src/lib/quant/anomalies.ts`; `src/lib/quant/artifacts.ts`; `src/lib/quant/benchmarkIntel.ts`; `src/lib/quant/crossAsset.ts`; `src/lib/quant/index.ts`; `src/lib/quant/portfolio.ts` |
| B | `src/lib/quant/crossAsset.ts` | `src/lib/quant/index.ts` |
| B | `src/lib/quant/extremes.ts` | `src/lib/quant/index.ts` |
| B | `src/lib/quant/forwardReturns.ts` | `src/lib/quant/index.ts` |
| B | `src/lib/quant/index.ts` | `src/components/quant/CorrelationDrawerBody.tsx`; `src/components/quant/DependencyShiftPanel.tsx`; `src/components/quant/InstrumentAdvancedChart.tsx`; `src/components/quant/InstrumentKeyStatistics.tsx`; `src/components/quant/InstrumentTechnicalAnalysis.tsx`; `src/components/quant/MacroRegimeQuadrant.tsx`; `src/components/quant/RegimeIntelligencePanel.tsx`; `src/components/quant/historical-intelligence/AnalogsTab.tsx`; `src/components/quant/historical-intelligence/BenchmarkTab.tsx`; `src/components/quant/historical-intelligence/ContextStrip.tsx`; `src/components/quant/historical-intelligence/CrossAssetTab.tsx`; `src/components/quant/historical-intelligence/ExtremesTab.tsx`; `src/components/quant/historical-intelligence/ForwardReturnsTab.tsx`; `src/components/quant/historical-intelligence/RegimeTab.tsx`; `src/components/quant/historical-intelligence/ReversionTab.tsx`; `src/components/quant/historical-intelligence/ScenarioTab.tsx`; `src/hooks/useHistoricalIntelligence.ts`; `src/hooks/useInstrumentRegime.ts`; `src/hooks/useQuantCopilotContext.ts`; `src/lib/quant/index.ts`; `src/pages/InstrumentDetail.tsx`; `src/services/quantArtifactService.ts` |
| B | `src/lib/quant/momentum.ts` | `src/lib/quant/analog.ts`; `src/lib/quant/index.ts`; `src/lib/quant/regimes.ts`; `src/lib/quant/reversion.ts` |
| B | `src/lib/quant/portfolio.ts` | `src/lib/quant/index.ts` |
| B | `src/lib/quant/primitives.ts` | `src/lib/quant/analog.ts`; `src/lib/quant/anomalies.ts`; `src/lib/quant/benchmark.ts`; `src/lib/quant/benchmarkIntel.ts`; `src/lib/quant/correlation.ts`; `src/lib/quant/extremes.ts`; `src/lib/quant/forwardReturns.ts`; `src/lib/quant/index.ts`; `src/lib/quant/momentum.ts`; `src/lib/quant/portfolio.ts`; `src/lib/quant/regimes.ts`; `src/lib/quant/reversion.ts`; `src/lib/quant/risk.ts`; `src/lib/quant/scenario.ts`; `src/lib/quant/seasonality.ts`; `src/lib/quant/technicals.ts`; `src/lib/quant/volatility.ts` |
| B | `src/lib/quant/regimes.ts` | `src/lib/quant/copilotContext.ts`; `src/lib/quant/index.ts` |
| A | `src/lib/quant/relations/compose.ts` | None |
| A | `src/lib/quant/relations/context.ts` | None |
| A | `src/lib/quant/relations/index.ts` | None |
| A | `src/lib/quant/relations/producers/artifactProducer.ts` | None |
| A | `src/lib/quant/relations/producers/benchmarkProducer.ts` | None |
| A | `src/lib/quant/relations/producers/correlationProducer.ts` | None |
| A | `src/lib/quant/relations/producers/filingsProducer.ts` | None |
| A | `src/lib/quant/relations/producers/macroRegimeProducer.ts` | None |
| A | `src/lib/quant/relations/producers/narrativeProducer.ts` | None |
| A | `src/lib/quant/relations/producers/sectorPeerProducer.ts` | None |
| A | `src/lib/quant/relations/producers/types.ts` | None |
| A | `src/lib/quant/relations/producers/volTransmissionProducer.ts` | None |
| A | `src/lib/quant/relations/seed.ts` | None |
| A | `src/lib/quant/relations/taxonomy.ts` | None |
| A | `src/lib/quant/relations/types.ts` | None |
| B | `src/lib/quant/returns.ts` | `src/hooks/useHistoricalResearch.ts`; `src/lib/quant/analog.ts`; `src/lib/quant/anomalies.ts`; `src/lib/quant/benchmarkIntel.ts`; `src/lib/quant/crossAsset.ts`; `src/lib/quant/extremes.ts`; `src/lib/quant/forwardReturns.ts`; `src/lib/quant/index.ts`; `src/lib/quant/momentum.ts`; `src/lib/quant/regimes.ts`; `src/lib/quant/reversion.ts`; `src/lib/quant/scenario.ts` |
| B | `src/lib/quant/reversion.ts` | `src/lib/quant/index.ts` |
| B | `src/lib/quant/risk.ts` | `src/lib/quant/benchmarkIntel.ts`; `src/lib/quant/extremes.ts`; `src/lib/quant/index.ts` |
| B | `src/lib/quant/scenario.ts` | `src/lib/quant/index.ts` |
| B | `src/lib/quant/seasonality.ts` | `src/lib/quant/artifacts.ts`; `src/lib/quant/index.ts` |
| B | `src/lib/quant/technicals.ts` | `src/components/quant/InstrumentAdvancedChart.tsx`; `src/components/quant/InstrumentKeyStatistics.tsx`; `src/components/quant/InstrumentTechnicalAnalysis.tsx`; `src/lib/quant/index.ts` |
| B | `src/lib/quant/volatility.ts` | `src/lib/quant/analog.ts`; `src/lib/quant/anomalies.ts`; `src/lib/quant/artifacts.ts`; `src/lib/quant/copilotContext.ts`; `src/lib/quant/index.ts`; `src/lib/quant/regimes.ts` |
| B | `src/lib/semanticPalette.ts` | `src/components/market-home/IntelligenceSpotlight.tsx`; `src/components/quant/IntelligenceObservationCard.tsx`; `src/components/quant/ObservationShell.tsx` |
| B | `src/lib/seo.ts` | `src/pages/HistoricalIntelligenceTerminal.tsx`; `src/pages/InstrumentDetail.tsx`; `src/pages/MacroRegimeDesk.tsx`; `src/pages/MarketHome.tsx`; `src/pages/market/CommoditiesIntelligence.tsx`; `src/pages/market/GlobalYields.tsx` |
| A | `src/lib/stressScenarios.ts` | None |
| B | `src/lib/telemetry/index.ts` | `src/components/personalization/InvestigationsPanel.tsx`; `src/pages/Investigations.tsx` |
| B | `src/lib/telemetry/sessionId.ts` | `src/lib/telemetry/index.ts` |
| B | `src/lib/telemetry/types.ts` | `src/lib/telemetry/index.ts` |
| B | `src/lib/utils.ts` | `components/ui/alert.tsx`; `components/ui/avatar.tsx`; `components/ui/badge.tsx`; `components/ui/button.tsx`; `components/ui/card.tsx`; `components/ui/chart.tsx`; `components/ui/checkbox.tsx`; `components/ui/dialog.tsx`; `components/ui/dropdown-menu.tsx`; `components/ui/input.tsx`; `components/ui/progress.tsx`; `components/ui/scroll-area.tsx`; `components/ui/separator.tsx`; `components/ui/sheet.tsx`; `components/ui/sidebar.tsx`; `components/ui/skeleton.tsx`; `components/ui/switch.tsx`; `components/ui/table.tsx`; `components/ui/tabs.tsx`; `components/ui/tooltip.tsx`; `src/components/ui/badge.tsx`; `src/components/ui/button.tsx`; `src/components/ui/card.tsx`; `src/components/ui/dropdown-menu.tsx`; `src/components/ui/input.tsx`; `src/components/ui/progress.tsx`; `src/components/ui/scroll-area.tsx`; `src/components/ui/separator.tsx`; `src/components/ui/sheet.tsx`; `src/components/ui/sidebar.tsx`; `src/components/ui/skeleton.tsx`; `src/components/ui/surface.tsx`; `src/components/ui/table.tsx`; `src/components/ui/tabs.tsx`; `src/components/ui/tooltip.tsx` |
| A | `src/pages/Backtesting.tsx` | `src/App.tsx` |
| A | `src/pages/BriefingDetail.tsx` | `src/App.tsx` |
| A | `src/pages/Briefings.tsx` | `src/App.tsx` |
| A | `src/pages/IntelligenceTerminal.tsx` | `src/App.tsx` |
| A | `src/pages/QuantLab.tsx` | `src/App.tsx` |
| A | `src/pages/RelationsMap.tsx` | `src/App.tsx` |
| A | `src/pages/market/CountriesRegionalMarkets.tsx` | `src/App.tsx` |
| A | `src/pages/market/FxLiquidityIntelligence.tsx` | `src/App.tsx` |
| A | `src/pages/market/UsSectorIntelligence.tsx` | `src/App.tsx` |
| A | `src/pages/market/WorldEquityIntelligence.tsx` | `src/App.tsx` |
| A | `src/pages/portfolio/ExposureAnalysis.tsx` | `src/App.tsx` |
| A | `src/pages/portfolio/HoldingsWatchlist.tsx` | `src/App.tsx` |
| A | `src/pages/portfolio/PerformanceAttribution.tsx` | `src/App.tsx` |
| A | `src/pages/portfolio/PortfolioAwareness.tsx` | `src/App.tsx` |
| A | `src/pages/portfolio/PortfolioOverview.tsx` | `src/App.tsx` |
| A | `src/pages/portfolio/RiskRegimeFit.tsx` | `src/App.tsx` |
| A | `src/pages/portfolio/ScenarioStress.tsx` | `src/App.tsx` |
| B | `src/services/agentService.ts` | `src/components/market-home/HeroIntelligence.tsx`; `src/components/market-home/RightRail.tsx`; `src/hooks/useAgentIntelligence.ts`; `src/pages/ResearchCopilot.tsx` |
| B | `src/services/artifactService.ts` | `src/components/quant/ArtifactDetailDrawerBody.tsx`; `src/hooks/useArtifacts.ts`; `src/pages/ArtifactPage.tsx`; `src/pages/InstrumentDetail.tsx`; `src/pages/MacroRegimeDesk.tsx`; `src/pages/ResearchCopilot.tsx`; `src/services/quantArtifactService.ts` |
| A | `src/services/backtest.ts` | None |
| A | `src/services/briefingService.ts` | None |
| B | `src/services/dashboardService.ts` | `src/components/market-dashboards/CompactPerformanceTable.tsx`; `src/components/market-dashboards/InstrumentDetailDrawer.tsx`; `src/hooks/useDashboard.ts`; `src/lib/intelligence/summaries.ts`; `src/pages/market/CommoditiesIntelligence.tsx`; `src/pages/market/GlobalYields.tsx` |
| B | `src/services/firestoreService.ts` | `src/components/AuthProvider.tsx`; `src/components/WorkspaceContext.tsx`; `src/hooks/useOrganization.ts` |
| B | `src/services/fundamentalsService.ts` | `src/services/valuationService.ts` |
| B | `src/services/gatewayClient.ts` | `src/components/market-dashboards/DashboardStates.tsx`; `src/components/market-dashboards/IntelligenceMetricCard.tsx`; `src/components/quant/FreshnessBadge.tsx`; `src/hooks/useSWR.ts`; `src/lib/telemetry/index.ts`; `src/pages/MacroRegimeDesk.tsx`; `src/services/agentService.ts`; `src/services/copilotService.ts`; `src/services/dashboardService.ts`; `src/services/earningsService.ts`; `src/services/edgarService.ts`; `src/services/emailPreferencesService.ts`; `src/services/fundamentalsService.ts`; `src/services/historicalResearchService.ts`; `src/services/instrumentService.ts`; `src/services/macroService.ts`; `src/services/marketService.ts`; `src/services/personalizationService.ts`; `src/services/providerService.ts`; `src/services/reasoningService.ts`; `src/services/researchService.ts`; `src/services/screenerService.ts`; `src/services/v3p2Service.ts` |
| B | `src/services/insightService.ts` | `src/hooks/useInsights.ts` |
| A | `src/services/labSessionService.ts` | None |
| B | `src/services/macroService.ts` | `src/hooks/useHistoricalResearch.ts`; `src/hooks/useMacro.ts`; `src/services/dashboardService.ts` |
| B | `src/services/marketService.ts` | `src/components/market-home/HeroIntelligence.tsx`; `src/components/market-home/PortfolioInsights.tsx`; `src/components/market-home/RightRail.tsx`; `src/components/market-home/WatchlistRail.tsx`; `src/components/quant/historical-intelligence/CrossAssetTab.tsx`; `src/hooks/useHistoricalResearch.ts`; `src/hooks/useMarket.ts`; `src/pages/InstrumentDetail.tsx`; `src/services/dashboardService.ts`; `src/services/marketHomeService.ts`; `src/services/screenerService.ts` |
| B | `src/services/personalizationService.ts` | `src/components/personalization/InvestigationsPanel.tsx`; `src/hooks/usePersonalization.ts` |
| B | `src/services/pinService.ts` | `src/hooks/usePins.ts` |
| A | `src/services/portfolioAwarenessService.ts` | None |
| B | `src/services/portfolioService.ts` | `src/components/market-home/WatchlistRail.tsx`; `src/hooks/usePortfolioWorkspace.ts`; `src/pages/InstrumentDetail.tsx` |
| B | `src/services/quantArtifactService.ts` | `src/components/quant/RegimeIntelligencePanel.tsx` |
| B | `src/services/reasoningService.ts` | `src/components/portfolio/PortfolioVulnerabilityPanel.tsx`; `src/components/quant/MacroAnalogPanel.tsx`; `src/components/quant/MacroRegimePortfolioPanel.tsx`; `src/hooks/useAgentReasoning.ts` |
| B | `src/services/screenerService.ts` | `src/components/market-dashboards/InstrumentDetailDrawer.tsx`; `src/components/quant/DiscoveryTabs.tsx`; `src/components/quant/IntelligenceSidePanel.tsx`; `src/components/quant/MarketPulseStrip.tsx`; `src/hooks/useScreener.ts` |
| B | `src/services/v3p2Service.ts` | `src/components/market-home/AnalysisOpinion.tsx`; `src/components/market-home/CalendarSection.tsx`; `src/components/quant/GlobalMacroIndicatorsPanel.tsx`; `src/components/quant/InstrumentLayeredNews.tsx`; `src/components/quant/V3P2LatestBriefingsPanel.tsx`; `src/components/quant/V3P2MacroRegimePanel.tsx`; `src/hooks/useDashboardNarratives.ts`; `src/pages/InstrumentDetail.tsx` |
| B | `src/types.ts` | `src/components/AuthProvider.tsx`; `src/components/WorkspaceContext.tsx`; `src/components/intelligence-drawer/ArtifactStrip.tsx`; `src/components/quant/ArtifactCard.tsx`; `src/components/quant/ArtifactDetailDrawerBody.tsx`; `src/components/quant/AssetIcon.tsx`; `src/components/quant/ConfidenceBadge.tsx`; `src/components/quant/CorrelationHeatmap.tsx`; `src/components/quant/DependencyShiftPanel.tsx`; `src/components/quant/InstrumentKeyStatistics.tsx`; `src/components/quant/InstrumentLayeredNews.tsx`; `src/components/quant/InstrumentStatsStrip.tsx`; `src/components/quant/IntelligenceFeed.tsx`; `src/components/quant/IntelligenceSidePanel.tsx`; `src/components/quant/LibraryCard.tsx`; `src/components/quant/MacroMultiChart.tsx`; `src/components/quant/MacroRealRatesPanel.tsx`; `src/components/quant/MacroRegimeQuadrant.tsx`; `src/components/quant/MacroSeriesChart.tsx`; `src/components/quant/MacroYieldCurvePanel.tsx`; `src/components/quant/OHLCVChart.tsx`; `src/components/quant/RegimeBadge.tsx`; `src/components/quant/historical-intelligence/CrossAssetTab.tsx`; `src/components/quant/historical-intelligence/TimelineTab.tsx`; `src/components/quant/historical-research/CorrelationMatrixWidget.tsx`; `src/hooks/useArtifacts.ts`; `src/hooks/useCopilotSession.ts`; `src/hooks/useDashboardArtifacts.ts`; `src/hooks/useHistoricalResearch.ts`; `src/hooks/useInsights.ts`; `src/hooks/useLibraryStats.ts`; `src/hooks/useMarket.ts`; `src/hooks/useOrganization.ts`; `src/hooks/usePins.ts`; `src/hooks/useResearchContext.ts`; `src/lib/chartExport.ts`; `src/lib/historicalResearchAnalytics.ts`; `src/lib/intelligence/historicalContext.ts`; `src/lib/intelligence/predictionSchemas.ts`; `src/lib/market-data/contracts/index.ts`; `src/lib/portfolio/schemas.ts`; `src/lib/quant/analog.ts`; `src/lib/quant/anomalies.ts`; `src/lib/quant/artifacts.ts`; `src/lib/quant/benchmarkIntel.ts`; `src/lib/quant/copilotContext.ts`; `src/lib/quant/correlation.ts`; `src/lib/quant/crossAsset.ts`; `src/lib/quant/extremes.ts`; `src/lib/quant/forwardReturns.ts`; `src/lib/quant/regimes.ts`; `src/lib/quant/returns.ts`; `src/lib/quant/reversion.ts`; `src/lib/quant/scenario.ts`; `src/lib/quant/seasonality.ts`; `src/lib/quant/technicals.ts`; `src/lib/quant/volatility.ts`; `src/pages/ArtifactPage.tsx`; `src/pages/MacroRegimeDesk.tsx`; `src/pages/ResearchCopilot.tsx`; `src/pages/ResearchLibrary.tsx`; `src/services/artifactService.ts`; `src/services/copilotService.ts`; `src/services/firestoreService.ts`; `src/services/insightService.ts`; `src/services/instrumentService.ts`; `src/services/macroService.ts`; `src/services/marketService.ts`; `src/services/pinService.ts`; `src/services/projectService.ts`; `src/services/providerService.ts`; `src/services/quantArtifactService.ts`; `src/services/workspaceService.ts` |
| B | `src/types/agents.ts` | `src/components/market-home/IntelligenceSpotlight.tsx`; `src/components/quant/AgentIntelligenceFeed.tsx`; `src/components/quant/AgentStatusDashboard.tsx`; `src/components/quant/IntelligenceObservationCard.tsx`; `src/components/quant/ObservationShell.tsx`; `src/hooks/useAgentIntelligence.ts`; `src/hooks/useAgentReasoning.ts`; `src/services/agentService.ts`; `src/services/reasoningService.ts` |

## Per-page direct dependency trees

### Intelligent Terminal

`src/pages/IntelligenceTerminal.tsx`: `src/components/WorkspaceContext.tsx` (B), `src/components/quant/AgentIntelligenceFeed.tsx` (B), `src/components/quant/ArtifactDetailDrawerBody.tsx` (B), `src/components/quant/ContextualReasoningCard.tsx` (A), `src/components/quant/DataDrawer.tsx` (B), `src/components/quant/Disclaimer.tsx` (B), `src/components/quant/FreshnessBadge.tsx` (B), `src/components/quant/HeadlineDrawerBody.tsx` (A), `src/components/quant/InstrumentDrawerBody.tsx` (A), `src/components/quant/IntelligenceFeed.tsx` (B), `src/components/quant/MarketTile.tsx` (A), `src/components/quant/PageHeader.tsx` (B), `src/components/quant/ResearchTimeline.tsx` (A), `src/components/quant/SystemAnalyzingState.tsx` (B), `src/hooks/useAgentIntelligence.ts` (B), `src/hooks/useArtifacts.ts` (B), `src/hooks/useMarket.ts` (B), `src/hooks/usePins.ts` (B), `src/hooks/useTimeline.ts` (A), `src/lib/providerLabels.ts` (B), `src/lib/seo.ts` (B), `src/services/marketService.ts` (B)
### Relation Maps

`src/pages/RelationsMap.tsx`: `src/components/WorkspaceContext.tsx` (B), `src/components/quant/DataDrawer.tsx` (B), `src/components/quant/FreshnessBadge.tsx` (B), `src/components/quant/InstrumentSelector.tsx` (B), `src/components/quant/relations-map/index.ts` (A), `src/hooks/useArtifacts.ts` (B), `src/hooks/useSWR.ts` (B), `src/lib/quant/artifacts.ts` (B), `src/lib/quant/relations/compose.ts` (A), `src/lib/quant/relations/context.ts` (A), `src/lib/quant/relations/seed.ts` (A), `src/lib/quant/relations/types.ts` (A), `src/lib/seo.ts` (B), `src/types.ts` (B)
### World Equity

`src/pages/market/WorldEquityIntelligence.tsx`: `src/components/intelligence-drawer/index.ts` (B), `src/components/market-dashboards/DashboardStates.tsx` (B), `src/components/market-dashboards/HeatmapGrid.tsx` (B), `src/components/quant/FreshnessBadge.tsx` (B), `src/components/quant/MarketPulseStrip.tsx` (B), `src/components/quant/NewsList.tsx` (B), `src/components/quant/Sparkline.tsx` (B), `src/hooks/useDashboard.ts` (B), `src/hooks/useDashboardArtifacts.ts` (B), `src/hooks/useDashboardNarratives.ts` (B), `src/hooks/useMarket.ts` (B), `src/lib/intelligence/summaries.ts` (B), `src/lib/seo.ts` (B), `src/services/dashboardService.ts` (B)
### US Sectors

`src/pages/market/UsSectorIntelligence.tsx`: `src/components/intelligence-drawer/index.ts` (B), `src/components/market-dashboards/CompactPerformanceTable.tsx` (B), `src/components/market-dashboards/DashboardFilterBar.tsx` (B), `src/components/market-dashboards/DashboardPageTabs.tsx` (B), `src/components/market-dashboards/DashboardSectionCard.tsx` (B), `src/components/market-dashboards/DashboardShell.tsx` (B), `src/components/market-dashboards/DashboardStates.tsx` (B), `src/components/market-dashboards/HeatmapGrid.tsx` (B), `src/components/market-dashboards/InstrumentDetailDrawer.tsx` (B), `src/components/market-dashboards/IntelligenceMetricCard.tsx` (B), `src/hooks/useDashboard.ts` (B), `src/hooks/useDashboardArtifacts.ts` (B), `src/hooks/useDashboardNarratives.ts` (B), `src/lib/intelligence/summaries.ts` (B), `src/lib/seo.ts` (B), `src/services/dashboardService.ts` (B)
### Countries and Regional

`src/pages/market/CountriesRegionalMarkets.tsx`: `src/components/intelligence-drawer/index.ts` (B), `src/components/market-dashboards/DashboardStates.tsx` (B), `src/components/quant/FreshnessBadge.tsx` (B), `src/components/quant/MarketPulseStrip.tsx` (B), `src/hooks/useDashboard.ts` (B), `src/hooks/useDashboardArtifacts.ts` (B), `src/hooks/useDashboardNarratives.ts` (B), `src/hooks/useMarket.ts` (B), `src/lib/countryDatabase.ts` (B), `src/lib/intelligence/summaries.ts` (B), `src/lib/providerLabels.ts` (B), `src/lib/seo.ts` (B)
### FX and Liquidity

`src/pages/market/FxLiquidityIntelligence.tsx`: `src/components/intelligence-drawer/index.ts` (B), `src/components/market-dashboards/CompactPerformanceTable.tsx` (B), `src/components/market-dashboards/DashboardFilterBar.tsx` (B), `src/components/market-dashboards/DashboardPageTabs.tsx` (B), `src/components/market-dashboards/DashboardSectionCard.tsx` (B), `src/components/market-dashboards/DashboardShell.tsx` (B), `src/components/market-dashboards/DashboardStates.tsx` (B), `src/components/market-dashboards/HeatmapGrid.tsx` (B), `src/components/market-dashboards/InstrumentDetailDrawer.tsx` (B), `src/components/market-dashboards/IntelligenceMetricCard.tsx` (B), `src/hooks/useDashboard.ts` (B), `src/hooks/useDashboardArtifacts.ts` (B), `src/hooks/useDashboardNarratives.ts` (B), `src/lib/intelligence/summaries.ts` (B), `src/lib/seo.ts` (B), `src/services/dashboardService.ts` (B)
### Portfolio

`src/pages/portfolio/HoldingsWatchlist.tsx`: `src/components/portfolio/PortfolioIntelligencePanel.tsx` (A), `src/components/portfolio/PortfolioVulnerabilityPanel.tsx` (B), `src/components/quant/AgentIntelligenceFeed.tsx` (B), `src/components/ui/surface.tsx` (B), `src/hooks/useAgentIntelligence.ts` (B), `src/hooks/useAgentReasoning.ts` (B), `src/hooks/usePortfolioIntelligence.ts` (A), `src/hooks/usePortfolioWorkspace.ts` (B), `src/lib/portfolio/benchmarks.ts` (B), `src/lib/portfolio/holdingMath.ts` (B), `src/lib/portfolio/positionDiagnosis.ts` (B), `src/lib/portfolio/schemas.ts` (B), `src/lib/portfolio/tradeTicket.ts` (B), `src/lib/providerLabels.ts` (B), `src/lib/quant/momentum.ts` (B), `src/lib/quant/returns.ts` (B), `src/lib/quant/risk.ts` (B), `src/lib/quant/volatility.ts` (B), `src/services/marketService.ts` (B), `src/types.ts` (B)
`src/pages/portfolio/PortfolioAwareness.tsx`: `src/components/portfolio/awareness/AwarenessHero.tsx` (A), `src/components/portfolio/awareness/AwarenessSnapshotControl.tsx` (A), `src/components/portfolio/awareness/AwarenessToneContext.tsx` (A), `src/components/portfolio/awareness/AwarenessToneControl.tsx` (A), `src/components/portfolio/awareness/CorrelationProfile.tsx` (A), `src/components/portfolio/awareness/MonitorNext.tsx` (A), `src/components/portfolio/awareness/PerformanceDistribution.tsx` (A), `src/components/portfolio/awareness/PositionActivity.tsx` (A), `src/components/portfolio/awareness/ReturnDecomposition.tsx` (A), `src/components/portfolio/awareness/RiskDecomposition.tsx` (A), `src/components/quant/Disclaimer.tsx` (B), `src/hooks/useAgentReasoning.ts` (B), `src/hooks/useAwarenessSnapshot.ts` (A), `src/hooks/usePersonalization.ts` (B), `src/hooks/usePortfolioPerformance.ts` (A), `src/hooks/usePortfolioWorkspace.ts` (B), `src/hooks/useSectorMetadata.ts` (A), `src/lib/portfolio/awarenessAttribution.ts` (A), `src/lib/portfolio/awarenessFlag.ts` (A), `src/lib/portfolio/awarenessTone.ts` (A), `src/lib/portfolio/benchmarks.ts` (B), `src/lib/portfolio/clientStress.ts` (A), `src/lib/portfolio/holdingAnalytics.ts` (A), `src/lib/portfolio/monitorNext.ts` (A), `src/lib/portfolio/sectionNarratives.ts` (A), `src/lib/portfolio/snapshotPayload.ts` (A), `src/lib/telemetry/index.ts` (B)
`src/pages/portfolio/ExposureAnalysis.tsx`: `src/components/portfolio/NarrativeExposurePanel.tsx` (A), `src/components/portfolio/PortfolioIntelligencePanel.tsx` (A), `src/components/quant/AgentIntelligenceFeed.tsx` (B), `src/hooks/useAgentIntelligence.ts` (B), `src/hooks/useAgentReasoning.ts` (B), `src/hooks/usePortfolioIntelligence.ts` (A), `src/hooks/usePortfolioWorkspace.ts` (B), `src/lib/quant/correlation.ts` (B), `src/lib/quant/returns.ts` (B), `src/lib/quant/volatility.ts` (B), `src/services/marketService.ts` (B), `src/types.ts` (B)
`src/pages/portfolio/PerformanceAttribution.tsx`: `src/components/portfolio/PortfolioIntelligencePanel.tsx` (A), `src/hooks/usePortfolioIntelligence.ts` (A), `src/hooks/usePortfolioWorkspace.ts` (B), `src/lib/portfolio/fmt.ts` (A), `src/lib/portfolio/positionDiagnosis.ts` (B), `src/lib/quant/portfolio.ts` (B), `src/lib/quant/returns.ts` (B), `src/services/marketService.ts` (B), `src/types.ts` (B)
`src/pages/portfolio/ScenarioStress.tsx`: `src/components/AuthProvider.tsx` (B), `src/components/WorkspaceContext.tsx` (B), `src/components/portfolio/PortfolioIntelligencePanel.tsx` (A), `src/components/quant/AgentIntelligenceFeed.tsx` (B), `src/components/quant/MacroAnalogPanel.tsx` (B), `src/hooks/useAgentIntelligence.ts` (B), `src/hooks/useAgentReasoning.ts` (B), `src/hooks/usePortfolioIntelligence.ts` (A), `src/hooks/usePortfolioWorkspace.ts` (B), `src/lib/portfolio/fmt.ts` (A), `src/lib/quant/returns.ts` (B), `src/lib/stressScenarios.ts` (A), `src/services/marketService.ts` (B), `src/services/portfolioService.ts` (B), `src/types.ts` (B)
`src/pages/portfolio/RiskRegimeFit.tsx`: `src/components/portfolio/AgentPortfolioInsights.tsx` (A), `src/components/portfolio/PortfolioIntelligencePanel.tsx` (A), `src/hooks/usePortfolioIntelligence.ts` (A), `src/hooks/usePortfolioWorkspace.ts` (B), `src/lib/portfolio/fmt.ts` (A), `src/lib/quant/correlation.ts` (B), `src/lib/quant/portfolio.ts` (B), `src/lib/quant/returns.ts` (B), `src/lib/quant/risk.ts` (B), `src/lib/quant/volatility.ts` (B), `src/services/marketService.ts` (B), `src/types.ts` (B)
`src/pages/portfolio/PortfolioOverview.tsx`: `src/components/portfolio/AgentPortfolioInsights.tsx` (A), `src/components/portfolio/PortfolioIntelligencePanel.tsx` (A), `src/components/ui/surface.tsx` (B), `src/hooks/usePortfolioIntelligence.ts` (A), `src/hooks/usePortfolioPerformance.ts` (A), `src/hooks/usePortfolioWorkspace.ts` (B), `src/lib/portfolio/awarenessFlag.ts` (A), `src/lib/portfolio/benchmarks.ts` (B), `src/lib/portfolio/schemas.ts` (B), `src/lib/telemetry/index.ts` (B)
### Backtesting

`src/pages/Backtesting.tsx`: `src/components/quant/Disclaimer.tsx` (B), `src/hooks/useBacktest.ts` (A), `src/services/backtest.ts` (A)
### Quant Lab

`src/pages/QuantLab.tsx`: `src/components/AuthProvider.tsx` (B), `src/components/WorkspaceContext.tsx` (B), `src/components/quant/AlphaPanel.tsx` (A), `src/components/quant/AnalogBrowserPanel.tsx` (A), `src/components/quant/BenchmarkOverlayPanel.tsx` (A), `src/components/quant/Disclaimer.tsx` (B), `src/components/quant/LabSessionsTab.tsx` (A), `src/components/quant/PageHeader.tsx` (B), `src/components/quant/PortfolioPanel.tsx` (A), `src/components/quant/RiskPanel.tsx` (A), `src/components/quant/RollingCorrelationPanel.tsx` (A), `src/hooks/useLabSessions.ts` (A), `src/services/artifactService.ts` (B), `src/types.ts` (B)
### Briefing

`src/pages/Briefings.tsx`: `src/components/WorkspaceContext.tsx` (B), `src/components/auth/AuthGate.tsx` (B), `src/components/quant/AgentIntelligenceFeed.tsx` (B), `src/components/quant/Disclaimer.tsx` (B), `src/components/quant/FreshnessBadge.tsx` (B), `src/components/quant/PageHeader.tsx` (B), `src/hooks/useAgentIntelligence.ts` (B), `src/hooks/useArtifacts.ts` (B), `src/hooks/useBriefingGenerate.ts` (A), `src/lib/seo.ts` (B), `src/services/briefingService.ts` (A), `src/types.ts` (B)
`src/pages/BriefingDetail.tsx`: `src/components/AuthProvider.tsx` (B), `src/components/WorkspaceContext.tsx` (B), `src/components/auth/AuthGate.tsx` (B), `src/components/quant/ArtifactDetailDrawerBody.tsx` (B), `src/components/quant/DataDrawer.tsx` (B), `src/components/quant/Disclaimer.tsx` (B), `src/components/quant/FreshnessBadge.tsx` (B), `src/components/quant/PageHeader.tsx` (B), `src/components/quant/RelatedIntelligencePanel.tsx` (A), `src/hooks/useArtifacts.ts` (B), `src/hooks/useBriefingGenerate.ts` (A), `src/lib/firebase.ts` (B), `src/lib/seo.ts` (B), `src/services/artifactService.ts` (B), `src/services/briefingService.ts` (A), `src/types.ts` (B)

## Backend, jobs, tests, integrations

| Class | File | Outside-set registrations/importers/references |
|---|---|---|
| A | `cloud-run/gateway/src/routes/backtest.ts` | `.github/workflows/deploy.yml`; `cloud-run/gateway/src/index.ts`; `public/robots.txt`; `services/quant-engine/app/api/pipelines.py`; `services/quant-engine/app/core/config.py`; `src/App.tsx`; `src/components/Layout.tsx`; `src/components/Login.tsx`; `src/components/WorkspaceModals.tsx` |
| A | `cloud-run/gateway/src/routes/briefings.ts` | `cloud-run/gateway/src/index.ts`; `cloud-run/gateway/src/routes/v3p2.ts`; `cloud-run/gateway/src/services/firestoreAdmin.ts`; `firebase-blueprint.json`; `firestore.rules`; `index.html`; `public/sitemap.xml`; `scripts/generate-sitemap.mjs`; `services/quant-engine/app/api/pipelines.py`; `services/quant-engine/app/bigquery/provisioner.py`; `services/quant-engine/app/bigquery/v5_schemas.py`; `services/quant-engine/app/briefings/__init__.py`; `services/quant-engine/app/briefings/generators.py`; `services/quant-engine/app/personalization/__init__.py`; `services/quant-engine/app/personalization/briefing_builder.py`; `services/quant-engine/deploy/v3p2/schedulers.sh`; `src/App.tsx`; `src/components/Layout.tsx`; `src/components/Login.tsx`; `src/components/market-home/AnalysisOpinion.tsx`; `src/components/quant/InstrumentLayeredNews.tsx`; `src/components/quant/V3P2LatestBriefingsPanel.tsx`; `src/components/quant/historical-intelligence/TimelineTab.tsx`; `src/hooks/useResearchContext.ts`; `src/lib/access.ts`; `src/lib/quant/artifacts.ts`; `src/lib/seo.ts`; `src/pages/InstrumentDetail.tsx`; `src/pages/MacroRegimeDesk.tsx`; `src/pages/MarketHome.tsx`; `src/pages/ResearchCopilot.tsx`; `src/pages/ResearchLibrary.tsx`; `src/services/artifactService.ts`; `src/services/firestoreService.ts`; `src/services/v3p2Service.ts` |
| A | `cloud-run/gateway/src/routes/portfolioAwareness.ts` | `cloud-run/gateway/src/index.ts` |
| A | `cloud-run/gateway/src/scripts/generateBriefingSitemap.ts` | No outside source importer found |
| C | `deplyze-backtest-engine/.dockerignore` | No outside source importer found |
| C | `deplyze-backtest-engine/.gitignore` | `services/quant-engine/.dockerignore` |
| C | `deplyze-backtest-engine/Cargo.lock` | No outside source importer found |
| C | `deplyze-backtest-engine/Cargo.toml` | No outside source importer found |
| C | `deplyze-backtest-engine/Dockerfile` | No outside source importer found |
| C | `deplyze-backtest-engine/src/e2e_tests.rs` | No outside source importer found |
| C | `deplyze-backtest-engine/src/engine.rs` | No outside source importer found |
| C | `deplyze-backtest-engine/src/loader.rs` | No outside source importer found |
| C | `deplyze-backtest-engine/src/main.rs` | No outside source importer found |
| C | `deplyze-backtest-engine/src/metrics.rs` | No outside source importer found |
| C | `deplyze-backtest-engine/src/models.rs` | No outside source importer found |
| C | `deplyze-backtest-engine/src/regime.rs` | No outside source importer found |
| C | `deplyze-backtest-engine/src/strategy.rs` | No outside source importer found |
| A | `services/quant-engine/app/api/portfolio_awareness.py` | `services/quant-engine/app/main.py` |
| A | `services/quant-engine/app/backtest/__init__.py` | No outside source importer found |
| A | `services/quant-engine/app/backtest/export.py` | `services/quant-engine/app/api/pipelines.py` |
| A | `services/quant-engine/app/backtest/improvements.py` | `services/quant-engine/app/api/pipelines.py` |
| A | `services/quant-engine/app/backtest/intent.py` | `services/quant-engine/app/api/pipelines.py` |
| A | `services/quant-engine/app/portfolio_awareness/__init__.py` | No outside source importer found |
| A | `services/quant-engine/app/portfolio_awareness/recompute.py` | No outside source importer found |
| A | `services/quant-engine/app/portfolio_awareness/writer.py` | No outside source importer found |
| A | `services/quant-engine/deploy/v5/awareness_scheduler.sh` | No outside source importer found |
| A | `services/quant-engine/tests/test_backtest_export.py` | No outside source importer found |
| A | `services/quant-engine/tests/test_backtest_improvements.py` | No outside source importer found |
| A | `services/quant-engine/tests/test_backtest_intent.py` | No outside source importer found |
| A | `services/quant-engine/tests/test_portfolio_awareness_recompute.py` | No outside source importer found |

These backend A candidates have only removed-page clients in this repository. The backtest proxy also calls the separate Rust integration (C). Shared gateway/quant-engine entrypoints need only corresponding registration removal. Shared pipelines.py needs only its four backtest endpoint/request sections removed, retaining all other pipelines.

| B — keep | Evidence |
|---|---|
| `/v1/relations/context` and `v3p2Service.ts` | InstrumentDetail fetches this endpoint; retain payload types and API. |
| `/v1/briefings/latest`, Python `app/briefings/*`, generated-briefings scheduler | Home AnalysisOpinion and ResearchLibrary V3P2LatestBriefingsPanel display this data. |
| Personalization briefing builder, routes, storage, email integration | Surviving personalization, Copilot, investigations, and notifications consume this infrastructure. Remove only dead destination CTAs. |
| Portfolio service, workspace hook, schemas, ledger/engine/math/benchmarks, portfolio tests | Home watchlists/insights, instrument watchlist controls, MacroRegimePortfolioPanel still consume portfolio data. |
| Portfolio agents, vulnerability panel, macro portfolio panel | Macro Regime Desk consumes vulnerability data; shared agent infrastructure remains. |
| Firestore artifact/briefing services and types | InstrumentDetail, MacroRegimeDesk, Copilot, Historical Intelligence timeline, Library, research context still consume saved briefings and artifacts. |
| Market dashboard service/hook/types, dashboard components | Global Yields and Commodities still use the dashboard infrastructure; remove exclusive exports only after symbol grep. |
| Quant index/statistical primitives | Historical Intelligence, InstrumentDetail, Macro, Copilot use the barrel; symbol-level analysis required before deleting exclusive exports. |
| Theme, src/index.css, UI components, layout styling, image/favicon assets | Protected design system/shared assets; keep. Layout changes limited to removed navigation and breadcrumb registration. |

## C — requires confirmation before editing

1. **Separate Rust backtest integration:** `deplyze-backtest-engine/**` is a separately deployed service, not imported by frontend code. Its repository-visible caller is the removal-exclusive backtest gateway, but repository analysis cannot establish whether there are external consumers. Confirm whether to delete the entire Rust service source, Dockerfile, manifest, lockfile, and tests, or retain the integration while deleting its UI/client/proxy. No deployed service will be deleted.
2. **Portfolio empty-state promotions on surviving Home:** Home renders a guest portfolio promotion, PortfolioInsights renders a clickable no-portfolio promotion, and WatchlistRail renders an empty-portfolio prompt. Their purpose is to start the removed Portfolio flow. Proposed minimal resolution: remove those promotions and the dead open-portfolio buttons while retaining existing portfolio insights, watchlist/holdings data, instrument watchlist controls, and Macro portfolio analysis. Confirm this treatment; removing the underlying data features would violate the preservation constraint.

## Surviving references requiring minimal edits

- App.tsx routes/imports and aliases; Layout.tsx nav group/items, portfolio expansion state, awareness deep-link lookup, breadcrumb entries. Preserve all other layout/render styles. Market public-gating check must use surviving Global Yields instead of removed World Equity.
- access.ts public matchers; generated sitemap script and XML; standalone briefing-detail sitemap generator.
- Dashboard tabs and intelligence crossLinks: remove links targeting four removed market dashboards.
- Home snapshot view-more links: remove World Equity and FX links, keep snapshots/data.
- Home/WatchlistRail/PortfolioInsights: remove removed-page launch controls, retain shared holdings/watchlist/insight data.
- Home AnalysisOpinion: remove briefing-detail navigation, retain the published briefing cards and data.
- Investigations/personalization CTAs and backend-generated deep links: remove dead destinations with no new destination feature.
- Library onboarding text: stop suggesting removed Quant Lab/Briefings pages; preserve access to previously saved research.
- Shared types/exports/services/env/dependency manifests: remove only exclusive unused symbols after rg proves no surviving consumer. No data/table deletion.

## Database candidates (no migrations or drops)

- `artifacts.portfolio_awareness_synthesis`: only Awareness snapshot/recompute readers and writers found; leave persisted table and list for owner decision.
- Firestore `labSessions`: Quant Lab and removed terminal timeline use subscription/writes; old saved library artifacts must stay readable. Keep persisted collections and rules unless exclusive rules are confirmed separately.
- `research.generated_briefings`, saved workspace `briefings`, portfolios/holdings/watchlists and related shared schemas: keep, surviving consumers exist.
- Existing SQL migration history: keep; no migration execution or table removal.

## Documentation and baseline inventory

All tracked README/Markdown documentation will be checked for removed routes, features, operational commands, and deployment references. Historical audit documents must clearly identify removed features as historical; shared backend descriptions remain accurate. No documentation has been edited.

Existing checks: root build (`tsc -b && vite build`), explicit root typecheck (`tsc -b`), lint (`tsc --noEmit`), frontend node tests; gateway build/lint and existing .test.mjs suites; Functions build; Python existing unittest/pytest tests; Rust existing tests (subject to C decision); Firestore rules tests require emulator. Baseline has not started, following requested phase order. There are no existing route/browser tests for the surviving critical paths (authentication, Home, research, instrument detail, Macro, Library, settings, dashboards). No tests will be added.

No branch, source edits, commits, push, migration, or deployed-service changes have occurred.
