# Production Data Contract Map

This map documents the production data path audited during the June 1, 2026 reliability fix.

## Global Contract

All authenticated frontend API calls must use `src/services/gatewayClient.ts`, which waits for Firebase Auth restoration, attaches `Authorization: Bearer <Firebase ID token>`, parses gateway responses once, sanitizes user-visible errors, and preserves cached data on refresh failure.

Gateway routes are served by Cloud Run `deplyze-gateway` behind Firebase Hosting `/api/**` rewrites. The gateway verifies Firebase ID tokens, returns structured JSON errors, uses Redis/Firestore provider cache through `cloud-run/gateway/src/services/cache.ts`, and calls Cloud Run `deplyze-quant-engine` only from authorized service accounts.

## Page Contracts

| Page/surface | Frontend hook/service | Gateway route | Primary source | Fallback source | Cache key intent |
| --- | --- | --- | --- | --- | --- |
| Home market snapshot, ticker, hero rail | `marketHomeService`, `useSWR` | `/market/quotes`, `/market/movers`, `/market/news`, `/market/headlines` | Polygon/Finnhub/FMP/Serper | Twelve Data, EODHD, cached last-good UI data | route + symbol list + mover/news query |
| World Equity / Sectors / Countries | `useDashboard`, `dashboardService` | `/market/quotes` | Polygon -> Finnhub | Twelve Data -> EODHD + UI stale cache | route + ordered symbol list + dashboard key |
| Commodities Intelligence | `useDashboard`, `dashboardService` | `/market/quotes`, `/market/ohlcv/:symbol` | Finnhub mapped FX/metals, Twelve Data | FRED OHLCV for mapped daily series, CoinGecko for crypto, stale UI cache | route + asset class + symbol + interval + bars |
| FX & Liquidity | `useDashboard`, `dashboardService` | `/market/quotes`, `/macro/fx` | Finnhub OANDA, Twelve Data | FRED daily FX series, stale UI cache | route + pair + interval + bars |
| Global Yields | `useDashboard`, `dashboardService` | `/macro/series/:id` | FRED official yield/macro series | Alpha Vantage compatible macro endpoints | `macro:v2:<series>` |
| Macro Regime Desk | `useMacro`, `v3p2Service`, dashboard artifacts | `/macro/series/:id`, V3P2 routes | FRED/Alpha Vantage, BigQuery artifacts | cached macro series, generated artifacts | macro series id + artifact route params |
| Historical Research | `useHistoricalResearch`, `historicalResearchService` | `/historical-research/*`, `/market/ohlcv/:symbol` | Gemini planner/reasoner + provider OHLCV | deterministic planner, BigQuery OHLCV if coverage satisfies request, provider fallbacks | route + asset class + symbol + interval + bars; planner query body |
| Historical Intelligence | `HistoricalIntelligenceTerminal`, `useMarket` | `/market/ohlcv/:symbol` | provider OHLCV | BigQuery only when coverage satisfies requested depth | route + asset class + symbol + interval + bars |
| Portfolio Overview / holdings / attribution / risk | portfolio hooks + `fetchOHLCV` | `/market/ohlcv/:symbol`, `/market/quote/:symbol` | provider OHLCV and quotes | BigQuery covered windows, stale UI cache | route + symbol + benchmark + interval + window |
| Backtesting | `backtest.ts` | `/backtest/*` | gateway -> `deplyze-backtest-engine` / quant-engine prep | structured gateway errors only | route + request body, no unauthenticated direct fetch |
| Briefings / Library / Agents / Personalization | service-specific hooks | `/briefings`, `/agents`, `/personalization`, V3P2 routes | BigQuery artifacts/model outputs + quant-engine | generated fallback states and cached artifacts | route + user/workspace where applicable |

## BigQuery Tables Audited

Datasets present: `raw_api`, `raw_public`, `raw_documents`, `cleaned`, `features`, `research`, `artifacts`, `model_outputs`, `raw_app`, and `ops`.

Important tables for this incident:

| Dataset | Tables |
| --- | --- |
| `raw_api` | `market_quotes_raw`, `ohlcv_raw`, `fundamentals_raw`, `earnings_raw`, `news_raw`, `provider_responses_raw` |
| `cleaned` | `ohlcv_cleaned`, `macro_cleaned`, `fundamentals_cleaned`, `earnings_cleaned`, `news_cleaned`, `global_indicators_cleaned`, `instruments` |
| `artifacts` | `research_artifacts`, `historical_analog_artifacts`, `macro_artifacts`, `regime_artifacts`, `relationship_artifacts`, `portfolio_awareness_synthesis`, `personalized_briefings`, `agent_runs`, `agent_outputs` |

`cleaned.ohlcv_cleaned` is a fallback only when it covers the requested period. On June 1, 2026, SPY/QQQ warehouse coverage was roughly two years, so long-horizon requests must continue to live providers before using warehouse stale fallback.

## Fixed Reliability Rules

- User-visible errors must never render raw HTML or provider bodies.
- 401/403/404/429/5xx responses are normalized by `GatewayError`.
- Composed dashboard pages preserve last-known successful data in hook-level cache even when their service calls aggregate multiple gateway routes.
- Historical range cache keys include route, asset class, symbol, interval, and requested bar count.
- Weekly/monthly OHLCV requests calculate calendar lookback by interval and aggregate daily fallback sources when providers return daily bars.
- Long historical planning supports explicit 50-year / 5-decade requests and surfaces real data shortfall instead of silently reusing shallow windows.
- Macro/yield routes prefer official FRED-backed series when configured, with Alpha Vantage fallback.
