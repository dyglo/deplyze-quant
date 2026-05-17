# Market Dashboards — Wave A Architecture Inspection

_Last updated: 2026-05-17_

## 1. Codebase Summary

**Stack:** React 18 + TypeScript + Vite 8 + React Router v6 + Tailwind CSS v4 + Recharts + Lucide + Motion

**Build command:** `npm run build` (tsc -b && vite build)  
**Typecheck/Lint:** `npm run lint` (tsc --noEmit)  
**Dev server:** `npm run dev` (proxies `/api` → gateway on :8080)  
**No Jest/Vitest configured** — verification = lint + build + manual smoke test

---

## 2. File Map

### Routing & Entry
- `src/App.tsx` — flat `<Routes>` list; all routes through `<ProtectedRoute>` → `<Layout>`
- New routes follow the `/market/*` namespace pattern (see §3)

### Sidebar & Navigation
- `src/components/Layout.tsx` — `SidebarInner` + `Layout` components
  - `menuItems[]` — flat array, 11 items today
  - `SidebarMenuButton` from `components/ui/sidebar.tsx` renders each link
  - `useSidebar()` exposes `state: 'expanded' | 'collapsed'` (collapsible="icon")
  - Active detection: `location.pathname.startsWith(item.path)` pattern
  - **No expandable groups exist yet** — Wave B adds this

### Services (data layer)
- `src/services/gatewayClient.ts` — `gatewayGet<T>()`, TTL cache, inflight dedup, `FreshnessStatus`
- `src/services/marketService.ts` — `fetchQuote`, `fetchQuotes` (batch), `fetchOHLCV`, `fetchNews`
- `src/services/macroService.ts` — `fetchMacroSeries`, `fetchFxDaily`, `listMacroSeries`
- `src/services/screenerService.ts` — `fetchMarketPulse`, `fetchHeatmapData`, symbol universes
  - Already has: `FX_SYMBOLS`, `COMMODITY_SYMBOLS`, `SECTOR_ETF_SYMBOLS`, `ETF_SYMBOLS`, `PULSE_SYMBOLS`

### Hooks
- `src/hooks/useSWR.ts` — cache-peek stale-while-revalidate; accepts `cacheKey` for dedup
- `src/hooks/useMarket.ts` — `useQuote`, `useBatchQuotes`, `useOHLCV`, `useNews`
- `src/hooks/useMacro.ts` — `useMacroSeries`, `useFxDaily`, `useMacroSeriesList`
- `src/hooks/useScreener.ts` — `useMarketPulse`, `useHeatmapData`, `useScreenerRows`

### Reusable UI Components (`src/components/quant/`)
- `MarketPulseStrip` — live index ticker strip with breadth + risk mode **[reuse as-is]**
- `MarketHeatmap` — colour-coded heat tile grid by sector **[extend for new views]**
- `Sparkline` — mini inline SVG line chart, no axes **[use in tables + cards]**
- `StatTile` — KPI metric card (label, value, delta) **[use for headline metrics]**
- `FreshnessBadge` / `SourceBadge` — data attribution badges **[use on every panel]**
- `PageHeader` — title + subtitle + actions header **[use on every page]**
- `ScreenerTable` — sortable table with intelligence columns **[extend for perf tables]**
- `RegimeBadge` — regime classification chips **[use in intelligence panels]**
- `OHLCVChart` — full price chart **[use for individual asset drill-down]**

### shadcn UI Primitives (`src/components/ui/`)
`badge`, `button`, `card`, `table`, `tabs`, `skeleton`, `separator`, `scroll-area`, `tooltip` — all available

### Design System
- CSS variables in `src/index.css`; Tailwind v4 bridged via `@theme`
- **Pampas** `#F4F3EE` = `--background`
- **Crail** `#C15F3C` = `--primary` (negative/terracotta)
- **Cloudy** `#B1ADA1` = `--chart-4` (muted)
- **Dark** `#1F1E1D` = `--foreground`
- **Light Gray** `#E8E6DC` = `--muted`
- **Sage** `#4E6040` = hardcoded positive color throughout codebase
- Dark mode variants in `.dark` class on `<html>`

### Gateway API Endpoints (no new backend needed)
```
GET /market/quote/:symbol          — single quote
GET /market/quotes?symbols=        — batch quotes (primary for dashboards)
GET /market/ohlcv/:symbol          — price history for trend charts
GET /market/movers?type=           — market movers
GET /macro/series/:id              — macro/yield time series (FRED/AV)
GET /macro/fx?from=&to=            — FX daily bars
GET /macro/regimes                 — BigQuery regime observations
GET /narratives/emerging           — narrative intelligence
```

TTLs: quotes=30s, ohlcv_daily=6h, macro_series=24h, news=5m

---

## 3. Routing Strategy

New routes under `/market/*` namespace:

```
/market/world-equity        → WorldEquityIntelligence
/market/us-sectors          → USSectorIntelligence
/market/global-yields       → GlobalYields
/market/countries           → CountriesRegionalMarkets
/market/commodities         → CommoditiesIntelligence
/market/fx-liquidity        → FxLiquidityIntelligence
```

All new pages protected under `<ProtectedRoute>` → `<Layout>` as per existing pattern.

---

## 4. Sidebar Strategy

**Approach:** Add an expandable `MarketDashboardsGroup` component within `SidebarInner`, inserted between existing nav items and the workspace footer.

**Implementation:**
- New component `src/components/quant/MarketDashboardsGroup.tsx`
- Uses `useState` for local open/closed state
- Persists state to `localStorage` (key: `market-dashboards-expanded`)
- ChevronRight → ChevronDown animation (CSS `transition: transform`)
- Active child route detection via `useLocation()`
- Collapsed sidebar shows group icon only (globe/chart icon) with tooltip
- Each child gets proper active styling matching existing nav items

The existing `menuItems[]` array stays unchanged. The new group is rendered AFTER the existing menu loop.

---

## 5. Reusable Components to Create (Wave C)

New components under `src/components/market-dashboards/`:

- `DashboardShell` — page wrapper with MarketPulseStrip + header + grid
- `DashboardSectionCard` — titled card container with optional refresh
- `IntelligenceMetricCard` — KPI card (label, value, change, sparkline)
- `CompactPerformanceTable` — compact sortable table (symbol, price, chg, sparkline)
- `MiniTrendChart` — small Recharts line chart (150px height)
- `HeatmapGrid` — standalone heatmap grid (reusable beyond market heatmap)
- `DashboardEmptyState` — empty/no-data state
- `DashboardLoadingState` — skeleton loading state
- `DashboardErrorState` — error state with retry
- `SourceFreshnessBadge` — wrapper around existing FreshnessBadge

---

## 6. Data Source Strategy

**Equities (ETFs/indices):** `fetchQuotes(symbols[])` via existing `/market/quotes`
  - SPY, QQQ, DIA, IWM, ACWI, EFA, EEM, VT, VEA, VWO
  - Sector ETFs: XLC, XLY, XLP, XLE, XLF, XLV, XLI, XLK, XLB, XLRE, XLU
  - Country ETFs: EWJ, EWG, EWU, EWQ, EWA, EWC, EWT, EWY, EWZ, EWH, EWS, EWL, EWI, EWD
  - Commodity ETFs: GLD, SLV, USO, UNG, CORN, WEAT, DBA, PDBC, COPX, DBB

**FX:** Using existing `/api/v1/macro/fx?from=EUR&to=USD` for FX pairs
  - EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD
  - DXY via UUP ETF or via Twelve Data `/market/quote/DX-Y.NYB`

**Yields/Macro:** Existing `/api/v1/macro/series/:id`
  - DGS2, DGS5, DGS10, DGS30, T10Y2Y, FEDFUNDS
  - Country yields: limited to US series via Alpha Vantage/FRED; other sovereigns via TwelveData quote endpoint if available

**Intelligence:** Reuse existing `/api/v1/macro/regimes` and `/api/v1/narratives/emerging`

**New data adapter file:** `src/services/marketDashboardService.ts`
  - Typed wrappers for batch quote fetching by asset group
  - Normalised schemas for dashboard consumption
  - Fallback/graceful degradation patterns

---

## 7. Risk Areas

| Risk | Mitigation |
|------|-----------|
| FX pair format inconsistency (`EUR/USD` vs `EURUSD`) | Normalize in `dashboardService` before rendering |
| Alpha Vantage 25/day quota | Macro series cached 24h server-side + 6h client-side TTL |
| Country sovereign yields not in AV/FRED | Graceful empty state per series with source attribution note |
| Sidebar layout shift on expand/collapse | CSS `max-height` transition; test in icon-only mode |
| `useSidebar` must be inside `SidebarProvider` | Already satisfied — new group rendered inside `SidebarInner` |
| Active route detection for group children | `location.pathname.startsWith('/market/')` for group header |
| Topbar breadcrumb `currentPage` lookup | Extend lookup to include market dashboard items |
| Dark mode compliance for new components | Use only CSS variables; never hardcode `#F4F3EE` etc. directly |
| Route collisions | `/market/*` namespace is clean; no existing routes conflict |
| Mobile sidebar behavior | shadcn mobile Sheet pattern already handles; group must not break it |
| Batch quote API timeout for large symbol lists | Keep each dashboard to ≤20 symbols; split into separate `useBatchQuotes` calls |

---

## 8. Implementation Order

```
Wave A → Inspect (this document)
Wave B → ExpandableGroup in sidebar + 6 nav links (no pages yet)
Wave C → Shared dashboard components (DashboardShell, cards, tables, charts)
Wave D → marketDashboardService.ts + typed models + hooks
Wave E → /market/world-equity page
Wave F → /market/us-sectors page
Wave G → /market/global-yields page
Wave H → /market/countries page
Wave I → /market/commodities page
Wave J → /market/fx-liquidity page
Wave K → Integration hardening, QA, final build
```
