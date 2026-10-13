# Page removal report

Branch: `chore/remove-pages`. Base: `e006e16` (main at checkout). Ten page commits; no PR or deployment.

## Scope and decisions

Removed Intelligent Terminal, Relation Maps, World Equity, US Sectors, Countries and Regional, FX and Liquidity, the entire Portfolio section (seven pages), Backtesting, Quant Lab, and both standalone Briefing list/detail pages. Removed `/cross-asset` and `/models` aliases. `/positioning` and the existing Home fallback remain. Historical Intelligence was explicitly retained.

The user confirmed both C items: Rust service source deletion and removal of Home Portfolio launch promotions. A subsequent data-flow check corrected the Awareness backend classification: daily portfolio emails and Copilot portfolio tools read its synthesis table, so its writer/recompute/API/scheduler/tests are shared and retained. The page-only gateway Awareness router and frontend are deleted.

The pre-edit dependency table is preserved in [page-removal-dependencies.md](page-removal-dependencies.md). That snapshot uses pre-removal classifications; this report is authoritative for final decisions. Symbol-level grep identified additional exclusive exports inside shared files and their removal is listed below.

## Verification

| Check | Baseline | Final |
|---|---|---|
| Frontend build | Pass; 3,393.99 kB JS (914.39 kB gzip) | Pass; 2,558.13 kB JS (728.33 kB gzip) |
| Frontend explicit `tsc -b` | Pass | Pass after each page and at completion |
| Existing frontend lint | Pass | Pass |
| Existing frontend tests | 82 passed | 55 surviving tests passed; 27 exclusive diagnosis/trade-ticket tests removed |
| Gateway build / lint | Pass / pass | Pass / pass |
| Gateway existing tests | 16 passed | 16 passed |
| Firebase Functions build | Pass | Pass |
| Firestore security rules tests | 26 passed against emulator | 26 passed against emulator |
| Python existing tests | 36 passed | 26 surviving Awareness recompute tests passed; 10 exclusive backtest tests removed |
| Rust tests | Blocked: cargo unavailable | N/A: entire service/test source removed, as confirmed |
| Browser route checks | No existing repository browser tests; initial exploratory fixture checks exposed a pre-existing warm-cache issue | 30 guest/full-account route loads: zero console errors or HTTP errors; 12 internal link targets match surviving routes |
| Preservation checks | Captured original source | Shared UI/theme/styles unchanged; surviving route elements unchanged; agent arithmetic/schedules unchanged; Hosting/Firestore jobs unchanged |

No new tests or dependencies were added. Existing route/browser tests for critical surviving paths are absent. Local browser verification scripts and tools live outside the repository. Build chunk-size warnings predate removal and remain; no bundling refactor was made.

Browser uses real local Firebase Auth/Firestore emulators and fixture market/warehouse responses. This verifies UI rendering, auth gates, and internal route targets, not live provider/BigQuery behavior. No production credentials are configured. The real local gateway starts with test-only placeholders for mandatory provider configuration; no provider request is made during gateway routing checks. Health and agent registry return 200, and removed backtest/briefing-generation/page-Awareness/headlines endpoints return 404 with a valid emulator account token.

The first emulator controller exited while watching changed rules; Auth was restarted separately and browser verification rerun. An initial guest-to-account Home transition reproduced the same `(data ?? []).slice is not a function` news-cache error observed before removal. The affected HeroIntelligence/useSWR/cache logic was kept unchanged under the preservation constraint. Final route verification enters full accounts through Login and checks cold route loads; the warm-cache upgrade issue remains a pre-existing limitation.

## Removed UI controls and deep links

- Entire retired navigation entries/Portfolio group and corresponding breadcrumb registration.
- Home guest build-portfolio promotion, no-portfolio creation promotion, Open workspace button, watchlist add/open controls, and Macro Go to Portfolio button. Existing holdings/watchlist/quote/agent data remains.
- Home snapshot View more links for indices/currencies and linked-dashboard targets for World Equity, US Sectors, Countries, and FX. Snapshot tables and surviving Yields/Commodities links remain.
- Home published briefing card navigation, instrument briefing links, and Historical Intelligence briefing-event detail links. Their data/cards/events remain readable.
- Login/project/library text that directed users toward unavailable pages.
- Email daily brief CTA targets Home; risk/regime alert targets Macro. Personalized briefing risk/agent/fallback CTAs target surviving Macro/Home.

## Kept because shared

| Item | Surviving consumer / reason |
|---|---|
| Theme/tokens/CSS, both UI directories, shared layout/render styles and public reference images | Protected design system; exact file comparison confirms no changes. |
| Portfolio service/workspace state/schemas/ledger/engine/math/default benchmark and 52 portfolio tests | Home holdings/watchlists/agent insights; instrument watchlist controls; Macro vulnerability/holdings; existing service state and transaction flows. |
| Python Awareness API, writer, recompute job/scheduler, synthesis schema/table and 26 tests | Daily portfolio email context and Copilot get_portfolio_context tool read synthesis data. |
| Briefing subscription/storage/types, saved artifact kinds, deterministic generators/job and `/briefings/latest` | Home, Library, Instrument detail, Macro, Copilot and Historical Intelligence still display/use briefing data. Previously saved lab/briefing artifacts remain supported. |
| `/relations/context`, v3p2 service/payloads and warehouse relationship data | InstrumentDetail still fetches this composite. Only graphical relations producers/canvas were exclusive. |
| Dashboard infrastructure, instrument drawers, shared hooks/normalizers, flag URL helper | Global Yields, Commodities and Home still use these components/data. |
| Shared numerical/statistical functions and internal helper types | Historical Intelligence, Instrument detail, Macro, Copilot and shared ledger logic. Internal helper references were checked before retaining exports. |
| Agent infrastructure, narrative exposure/vulnerability/reasoning backends and Copilot tools | Surviving research/intelligence integrations use these capabilities. Only retired placement metadata was filtered. |
| Personalization backend/profile loader/materializer and persisted briefing data | Shared `_profile_for_user` supports feed/Copilot/watchlist; independently scheduled materialization/API integration retained. Frontend retired-page clients were removed. |
| CATEGORICAL semantic palette | Design-system protection, even though its removed chart consumer is gone. |
| Firestore customScenarios storage rule/test and shared schema/migration history | Existing stored data/security and no-drop/no-migration constraints; candidates listed below rather than deleting data. |

## Persisted/infrastructure candidates left for owner decision

- Firestore `workspaces/{wid}/projects/{pid}/labSessions`: persisted records remain; exclusive frontend and client rule removed.
- Firestore `customScenarios`: exclusive UI client removed; existing collection data, owner-only rule and security test retained.
- Previously deployed `deplyze-backtest-engine` Cloud Run service, Artifact Registry images/repository, backtest parquet GCS bucket/objects, and live `backtest-export-nightly` scheduler job: source/configuration removed, deployed resources untouched.
- Remote `BACKTEST_ENGINE_URL` / `BACKTEST_PARQUET_BUCKET` repository secrets and existing deployment backtest environment bindings: source references removed; no remote secret/environment mutation performed.
- No BigQuery table was dropped or migration run. Awareness synthesis, generated/personalized briefings and all shared market/portfolio/artifact tables are retained because surviving consumers exist.

## Deleted files — 136

- `cloud-run/gateway/src/routes/backtest.ts`
- `cloud-run/gateway/src/routes/briefings.ts`
- `cloud-run/gateway/src/routes/portfolioAwareness.ts`
- `cloud-run/gateway/src/scripts/generateBriefingSitemap.ts`
- `deplyze-backtest-engine/.dockerignore`
- `deplyze-backtest-engine/.gitignore`
- `deplyze-backtest-engine/Cargo.lock`
- `deplyze-backtest-engine/Cargo.toml`
- `deplyze-backtest-engine/Dockerfile`
- `deplyze-backtest-engine/src/e2e_tests.rs`
- `deplyze-backtest-engine/src/engine.rs`
- `deplyze-backtest-engine/src/loader.rs`
- `deplyze-backtest-engine/src/main.rs`
- `deplyze-backtest-engine/src/metrics.rs`
- `deplyze-backtest-engine/src/models.rs`
- `deplyze-backtest-engine/src/regime.rs`
- `deplyze-backtest-engine/src/strategy.rs`
- `services/quant-engine/app/backtest/__init__.py`
- `services/quant-engine/app/backtest/export.py`
- `services/quant-engine/app/backtest/improvements.py`
- `services/quant-engine/app/backtest/intent.py`
- `services/quant-engine/tests/test_backtest_export.py`
- `services/quant-engine/tests/test_backtest_improvements.py`
- `services/quant-engine/tests/test_backtest_intent.py`
- `src/components/portfolio/AgentPortfolioInsights.tsx`
- `src/components/portfolio/NarrativeExposurePanel.tsx`
- `src/components/portfolio/PortfolioIntelligencePanel.tsx`
- `src/components/portfolio/awareness/AwarenessHero.tsx`
- `src/components/portfolio/awareness/AwarenessSnapshotControl.tsx`
- `src/components/portfolio/awareness/AwarenessToneContext.tsx`
- `src/components/portfolio/awareness/AwarenessToneControl.tsx`
- `src/components/portfolio/awareness/CorrelationProfile.tsx`
- `src/components/portfolio/awareness/MonitorNext.tsx`
- `src/components/portfolio/awareness/PerformanceDistribution.tsx`
- `src/components/portfolio/awareness/PositionActivity.tsx`
- `src/components/portfolio/awareness/ReturnDecomposition.tsx`
- `src/components/portfolio/awareness/RiskDecomposition.tsx`
- `src/components/portfolio/awareness/SectionNarrative.tsx`
- `src/components/portfolio/awareness/SectorDonut.tsx`
- `src/components/quant/AlphaPanel.tsx`
- `src/components/quant/AnalogBrowserPanel.tsx`
- `src/components/quant/BenchmarkIntelligencePanel.tsx`
- `src/components/quant/BenchmarkOverlayPanel.css`
- `src/components/quant/BenchmarkOverlayPanel.tsx`
- `src/components/quant/ContextualReasoningCard.tsx`
- `src/components/quant/HeadlineDrawerBody.tsx`
- `src/components/quant/HistoricalAnalogPanel.tsx`
- `src/components/quant/InstrumentDrawerBody.tsx`
- `src/components/quant/LabSessionCard.tsx`
- `src/components/quant/LabSessionsTab.tsx`
- `src/components/quant/MarketTile.tsx`
- `src/components/quant/PortfolioPanel.tsx`
- `src/components/quant/RelatedIntelligencePanel.tsx`
- `src/components/quant/ResearchTimeline.tsx`
- `src/components/quant/RiskPanel.tsx`
- `src/components/quant/RollingCorrelationPanel.tsx`
- `src/components/quant/relations-map/ClusterBackdrop.tsx`
- `src/components/quant/relations-map/CopilotSummary.tsx`
- `src/components/quant/relations-map/EdgeFilterPopover.tsx`
- `src/components/quant/relations-map/FloatingInsightCard.tsx`
- `src/components/quant/relations-map/IntelligenceRail.tsx`
- `src/components/quant/relations-map/NodeCardOverlay.tsx`
- `src/components/quant/relations-map/OverlayControls.tsx`
- `src/components/quant/relations-map/RelationsFilterBar.tsx`
- `src/components/quant/relations-map/RelationsGraphCanvas.tsx`
- `src/components/quant/relations-map/RelationsNodeDrawerBody.tsx`
- `src/components/quant/relations-map/RelationsSidePanel.tsx`
- `src/components/quant/relations-map/ReplayTimeline.tsx`
- `src/components/quant/relations-map/SpotlightLens.tsx`
- `src/components/quant/relations-map/index.ts`
- `src/components/quant/relations-map/nodePalette.ts`
- `src/components/quant/relations-map/radialLayout.ts`
- `src/components/quant/relations-map/studyPresets.ts`
- `src/hooks/useAwarenessSnapshot.ts`
- `src/hooks/useBacktest.ts`
- `src/hooks/useBenchmarkIntelligence.ts`
- `src/hooks/useBriefingGenerate.ts`
- `src/hooks/useHistoricalAnalogs.ts`
- `src/hooks/useLabSessions.ts`
- `src/hooks/usePortfolioIntelligence.ts`
- `src/hooks/usePortfolioPerformance.ts`
- `src/hooks/useSectorMetadata.ts`
- `src/hooks/useTimeline.ts`
- `src/lib/portfolio/awarenessAttribution.ts`
- `src/lib/portfolio/awarenessFlag.ts`
- `src/lib/portfolio/awarenessNarration.ts`
- `src/lib/portfolio/awarenessTone.ts`
- `src/lib/portfolio/clientStress.ts`
- `src/lib/portfolio/fmt.ts`
- `src/lib/portfolio/holdingAnalytics.ts`
- `src/lib/portfolio/intelligenceEngine.ts`
- `src/lib/portfolio/monitorNext.ts`
- `src/lib/portfolio/positionDiagnosis.test.ts`
- `src/lib/portfolio/positionDiagnosis.ts`
- `src/lib/portfolio/sectionNarratives.ts`
- `src/lib/portfolio/snapshotPayload.ts`
- `src/lib/portfolio/tradeTicket.test.ts`
- `src/lib/portfolio/tradeTicket.ts`
- `src/lib/quant/portfolio.ts`
- `src/lib/quant/relations/compose.ts`
- `src/lib/quant/relations/context.ts`
- `src/lib/quant/relations/index.ts`
- `src/lib/quant/relations/producers/artifactProducer.ts`
- `src/lib/quant/relations/producers/benchmarkProducer.ts`
- `src/lib/quant/relations/producers/correlationProducer.ts`
- `src/lib/quant/relations/producers/filingsProducer.ts`
- `src/lib/quant/relations/producers/macroRegimeProducer.ts`
- `src/lib/quant/relations/producers/narrativeProducer.ts`
- `src/lib/quant/relations/producers/sectorPeerProducer.ts`
- `src/lib/quant/relations/producers/types.ts`
- `src/lib/quant/relations/producers/volTransmissionProducer.ts`
- `src/lib/quant/relations/seed.ts`
- `src/lib/quant/relations/taxonomy.ts`
- `src/lib/quant/relations/types.ts`
- `src/lib/stressScenarios.ts`
- `src/pages/Backtesting.tsx`
- `src/pages/BriefingDetail.tsx`
- `src/pages/Briefings.tsx`
- `src/pages/IntelligenceTerminal.tsx`
- `src/pages/QuantLab.tsx`
- `src/pages/RelationsMap.tsx`
- `src/pages/market/CountriesRegionalMarkets.tsx`
- `src/pages/market/FxLiquidityIntelligence.tsx`
- `src/pages/market/UsSectorIntelligence.tsx`
- `src/pages/market/WorldEquityIntelligence.tsx`
- `src/pages/portfolio/ExposureAnalysis.tsx`
- `src/pages/portfolio/HoldingsWatchlist.tsx`
- `src/pages/portfolio/PerformanceAttribution.tsx`
- `src/pages/portfolio/PortfolioAwareness.tsx`
- `src/pages/portfolio/PortfolioOverview.tsx`
- `src/pages/portfolio/RiskRegimeFit.tsx`
- `src/pages/portfolio/ScenarioStress.tsx`
- `src/services/backtest.ts`
- `src/services/briefingService.ts`
- `src/services/labSessionService.ts`
- `src/services/portfolioAwarenessService.ts`

## Modified surviving files — 89

| File | Reason |
|---|---|
| `.github/CICD.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `.github/SECRETS.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `.github/workflows/deploy.yml` | Remove dedicated Rust deployment, backtest path filter/skip flag, export scheduler configuration, and unused backtest env bindings. |
| `README.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `cloud-run/gateway/src/email/recipients.ts` | Change removed Portfolio destinations to Home/Macro; preserve email context data and delivery. |
| `cloud-run/gateway/src/index.ts` | Remove only backtest, on-demand briefing, and page-only Awareness router registrations. |
| `cloud-run/gateway/src/routes/agents.ts` | Remove retired page names from static affected_pages metadata; preserve agent routes and computations. |
| `cloud-run/gateway/src/routes/market.ts` | Remove Terminal-only headlines handler; keep news, search, movers, quote and OHLCV routes. |
| `docs/ci-usage.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/deep-research-report.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/deplyzequant-prd.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/frontend-cognitive-architecture-audit.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/glossary.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/infra.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/institutional-ux-refinement-audit.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/intelligence-layer/wave-a-audit.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/intelligence-layer/wave-i-hardening.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/market-dashboards-architecture.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/production-data-contract-map.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/resend-email-infrastructure.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/v3p2-deploy-agent-prompt.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/v3p2-deploy.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/v4-deploy.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/v5-event-taxonomy.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/v5-phase1-data-flow.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `docs/v5-privacy-notice.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `firestore.rules` | Remove exclusive labSessions client rule; keep persisted records and all shared tenancy/security rules. |
| `package-lock.json` | Remove those graph-only packages and their orphaned transitive dependencies; retain surviving package versions. |
| `package.json` | Remove graphology, graphology-layout, graphology-layout-forceatlas2, and sigma only. |
| `public/robots.txt` | Remove retired protected-route crawl entries. |
| `public/sitemap.xml` | Remove retired public URLs; preserve surviving URLs and priorities. |
| `scripts/generate-sitemap.mjs` | Remove retired public routes and standalone briefing-detail sitemap guidance. |
| `services/quant-engine/app/agents/cross_asset_agent.py` | Remove retired affected_pages/recommended_placements entries and unused placement constants/imports; preserve all calculations, inputs and schedules. |
| `services/quant-engine/app/agents/earnings_agent.py` | Remove retired affected_pages/recommended_placements entries and unused placement constants/imports; preserve all calculations, inputs and schedules. |
| `services/quant-engine/app/agents/liquidity_agent.py` | Remove retired affected_pages/recommended_placements entries and unused placement constants/imports; preserve all calculations, inputs and schedules. |
| `services/quant-engine/app/agents/macro_agent.py` | Remove retired affected_pages/recommended_placements entries and unused placement constants/imports; preserve all calculations, inputs and schedules. |
| `services/quant-engine/app/agents/opportunity_agent.py` | Remove retired affected_pages/recommended_placements entries and unused placement constants/imports; preserve all calculations, inputs and schedules. |
| `services/quant-engine/app/agents/reasoning.py` | Remove retired affected_pages/recommended_placements entries and unused placement constants/imports; preserve all calculations, inputs and schedules. |
| `services/quant-engine/app/agents/regime_agent.py` | Remove retired affected_pages/recommended_placements entries and unused placement constants/imports; preserve all calculations, inputs and schedules. |
| `services/quant-engine/app/agents/registry.py` | Remove retired affected_pages/recommended_placements entries and unused placement constants/imports; preserve all calculations, inputs and schedules. |
| `services/quant-engine/app/agents/risk_agent.py` | Remove retired affected_pages/recommended_placements entries and unused placement constants/imports; preserve all calculations, inputs and schedules. |
| `services/quant-engine/app/agents/schemas.py` | Remove retired affected_pages/recommended_placements entries and unused placement constants/imports; preserve all calculations, inputs and schedules. |
| `services/quant-engine/app/agents/sentiment_agent.py` | Remove retired affected_pages/recommended_placements entries and unused placement constants/imports; preserve all calculations, inputs and schedules. |
| `services/quant-engine/app/agents/volatility_agent.py` | Remove retired affected_pages/recommended_placements entries and unused placement constants/imports; preserve all calculations, inputs and schedules. |
| `services/quant-engine/app/api/pipelines.py` | Remove four dedicated backtest endpoints and request models; preserve all other pipelines. |
| `services/quant-engine/app/core/config.py` | Remove five exclusive backtest export settings; preserve surviving defaults. |
| `services/quant-engine/app/personalization/briefing_builder.py` | Change removed risk/briefing CTA destinations to Macro/Home; preserve materialization and profile loaders. |
| `services/quant-engine/deploy/v3p2/cost-controls.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `services/quant-engine/deploy/v3p2/runbook.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `services/quant-engine/migrations/v3p2/README.md` | Update current route scope and mark retired UI/source references historical; keep shared infrastructure guidance. |
| `services/quant-engine/requirements.txt` | Remove google-cloud-storage pin, whose only direct source importer was deleted backtest/export.py. |
| `src/App.tsx` | Remove ten requested page groups and their aliases/imports; preserve every surviving route element and Home fallback. |
| `src/components/Layout.tsx` | Remove retired navigation/breadcrumb entries, Portfolio group state/deep links, and now-unused icons; retain layout/theme/styles. |
| `src/components/Login.tsx` | Remove promotion of unavailable backtesting. |
| `src/components/WorkspaceModals.tsx` | Remove reference to unavailable backtesting from the project description placeholder. |
| `src/components/market-home/AnalysisOpinion.tsx` | Retain published briefing data/cards; remove standalone briefing navigation and its button affordance. |
| `src/components/market-home/PortfolioInsights.tsx` | Remove create/open-Portfolio promotions; keep existing holdings, quotes, agent insight and artifact links. |
| `src/components/market-home/WatchlistRail.tsx` | Remove Portfolio launch/empty-create controls; retain watchlist/holdings subscriptions and instrument links. |
| `src/components/quant/InstrumentLayeredNews.tsx` | Retain briefing rows, summaries and timestamps; remove links to the deleted detail page. |
| `src/components/quant/MacroRegimePortfolioPanel.tsx` | Remove Go to Portfolio button and obsolete create prompt; retain vulnerability analysis for existing holdings. |
| `src/components/quant/historical-intelligence/TimelineTab.tsx` | Retain saved briefing events; render their titles without deleted detail links, preserving artifact links. |
| `src/hooks/useAgentReasoning.ts` | Remove exclusive Narrative Exposure page hook and imports; retain reasoning/analog/vulnerability hooks. |
| `src/hooks/useDashboard.ts` | Remove four page-only dashboard hooks; keep Commodities and Global Yields hooks. |
| `src/hooks/useMarket.ts` | Remove Terminal-only headlines hook and import; preserve market hooks. |
| `src/hooks/usePersonalization.ts` | Remove Awareness profile and retired Morning Terminal briefing hooks; preserve feed/watchlist/Copilot/investigation hooks. |
| `src/lib/access.ts` | Remove retired public matchers; limit market matchers to the two surviving dashboards. |
| `src/lib/countryDatabase.ts` | Remove Countries-only database/search/labels/types; preserve shared countryFlagUrl. |
| `src/lib/intelligence/crossLinks.ts` | Remove retired dashboard destinations and exclusive link descriptions; preserve surviving cross-asset branches. |
| `src/lib/intelligence/summaries.ts` | Remove retired dashboard summary adapters/imports; preserve Yields/Commodities summary logic. |
| `src/lib/portfolio/benchmarks.ts` | Remove exclusive benchmark selection registry/helpers; preserve shared default benchmark ID. |
| `src/lib/portfolio/schemas.ts` | Remove unused BenchmarkDefinition type; preserve shared persisted portfolio/holding/watchlist contracts. |
| `src/lib/quant/correlation.ts` | Remove unused Lab covarianceMatrix; preserve correlation and dependency-shift calculations. |
| `src/lib/quant/index.ts` | Remove exclusive numerical portfolio export and its module description. |
| `src/lib/quant/momentum.ts` | Remove exclusive Lab SMA-cross type/function/import; preserve trend/momentum calculations. |
| `src/lib/quant/primitives.ts` | Remove exclusive Lab rollingZScore; preserve shared statistical primitives. |
| `src/lib/quant/returns.ts` | Remove exclusive Portfolio/Lab cumulative-log/equity-curve exports; preserve surviving return transformations. |
| `src/lib/quant/risk.ts` | Remove exclusive Lab historical/parametric VaR and rolling Sharpe; retain drawdown, Sortino and shared risk functions. |
| `src/lib/quant/volatility.ts` | Remove exclusive Portfolio/Lab rollingAnnualisedVol; retain shared volatility/regime functions. |
| `src/lib/telemetry/index.ts` | Remove page-only logOpen wrapper; preserve telemetry transport/events and surviving logging. |
| `src/pages/MarketHome.tsx` | Remove guest Portfolio promotion; preserve signed-in portfolio insights and every other Home section. |
| `src/pages/ResearchLibrary.tsx` | Stop directing users to removed saving surfaces; preserve previously saved lab/briefing artifacts and all library behavior. |
| `src/services/artifactService.ts` | Remove page-only briefing/lab-to-artifact creation wrappers; preserve existing artifact storage/read/update behavior. |
| `src/services/dashboardService.ts` | Remove four page-only universes/fetchers/classifiers; retain Commodities/Yields normalization and calculations. |
| `src/services/marketHomeService.ts` | Remove World Equity/FX View more destinations; retain all snapshot data. |
| `src/services/marketService.ts` | Remove Terminal-only fetchHeadlines; preserve quotes/OHLCV/news/search/movers clients. |
| `src/services/personalizationService.ts` | Remove retired profile/briefing client types/getters/normalizers; preserve shared feed/watchlist/Copilot/investigation clients. |
| `src/services/portfolioService.ts` | Remove exclusive custom-stress scenario client CRUD/type and observation acknowledgment; preserve shared portfolio/holding/watchlist/ledger flows. |
| `src/services/reasoningService.ts` | Remove exclusive frontend Narrative Exposure wrapper/types; retain shared reasoning/analog/vulnerability clients and backend capability. |
| `src/types.ts` | Remove exclusive terminal timeline and Lab session types; retain saved-artifact/briefing compatibility types. |

## Additional documentation artifacts

- `docs/page-removal-dependencies.md`: preserved pre-edit dependency map and final classification corrections.
- `docs/page-removal-report.md`: final inventory, retained dependencies, decisions and verification evidence.

## Per-page commits

- chore: remove Intelligent Terminal and exclusive dependencies
- chore: remove Relation Maps and graph-only dependencies
- chore: remove World Equity and exclusive dashboard code
- chore: remove US Sectors and exclusive dashboard code
- chore: remove Countries and Regional and exclusive dashboard code
- chore: remove FX and Liquidity and exclusive dashboard code
- chore: remove Portfolio pages and page-only analysis code
- chore: remove Backtesting and its dedicated engines
- chore: remove Quant Lab and its exclusive session and analysis code
- chore: remove Briefing pages and finish scoped cleanup/documentation (tenth commit).
