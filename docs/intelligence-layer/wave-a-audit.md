# Wave A — Dashboard Intelligence Audit

> Inventory of every dashboard's interaction surface, with concrete intelligence
> opportunities mapped to existing `src/lib/quant/*` infrastructure. This is the
> implementation map for Waves B–I.

The previous phase shipped six dashboards: **World Equity**, **US Sector**,
**Global Yields**, **FX & Liquidity**, **Commodities**, **Countries & Regional
Markets**. They are structurally complete and data-correct, but most interaction
surfaces still terminate in raw data instead of *interpreted* data.

This audit is opinionated. The recurring problems are:

1. **Two divergent drawer patterns** — World Equity and Countries use bespoke
   inline split-panes; Sector / Yields / FX / Commodities use the fixed-position
   `InstrumentDetailDrawer` wrapping `IntelligenceSidePanel`. Behavior diverges
   per page. Wave B unifies.
2. **Passive KPI cards** — derived aggregates (Offensive/Defensive Avg, Energy
   Avg, 10Y–2Y Spread, BEI, DXY proxy) display a number and stop. Each is a
   first-class intelligence object whose drivers, history, and regime context
   are computable from data we already fetch.
3. **No artifact / narrative / analog surfacing** — `quant/artifacts.ts`,
   `narrativeProducer`, `analog.ts`, `contextualAnalog.ts`, `regimes.ts`, and
   `services/artifactService.ts` exist and are correct, but no dashboard reads
   from them. The intelligence is computed; nothing surfaces it.
4. **Duplicate tabs** — every dashboard has an `Intelligence` tab that renders
   the same `IntelligenceSummaryView` already shown in Overview. Sector
   duplicates Relative Strength; FX duplicates G10; Commodities Energy/Metals
   tabs are filtered tables.
5. **Dead drilldown chains** — clicking gold doesn't surface inflation
   exposure; clicking the 10Y doesn't link FX/liquidity implications; clicking
   a country doesn't expose its FX, commodity, or regional peer context.

---

## Existing infrastructure (reusable, do not rebuild)

| Capability | Module | Status |
|---|---|---|
| Artifact constructors (13 kinds) | `lib/quant/artifacts.ts` | ✅ complete, unused on dashboards |
| Artifact Firestore I/O | `services/artifactService.ts` | ✅ subscribe/write ready, empty until agents run |
| Regime classification | `lib/quant/regimes.ts`, `services/dashboardService.classify*` | ✅ inline only, not artifact-linked |
| Narrative themes | `lib/quant/relations/producers/narrativeProducer.ts` | ✅ produces nodes/edges, never rendered |
| Historical analogs | `lib/quant/analog.ts`, `lib/quant/contextualAnalog.ts` | ✅ unused on dashboards |
| Correlation drift | `lib/quant/correlation.ts` | ✅ unused on dashboards |
| Cross-asset links | `lib/quant/crossAsset.ts` | ✅ unused outside of static notes |
| Volatility / momentum / anomaly | `lib/quant/volatility.ts`, `momentum.ts`, `services/screenerService.ts` | ✅ used in `IntelligenceSidePanel` only |
| Intelligence side panel | `components/quant/IntelligenceSidePanel.tsx` (350 lines) | ✅ rich but invoked only as a screener drawer |
| Persistent split-pane | `pages/market/WorldEquityIntelligence.tsx`, `CountriesRegionalMarkets.tsx` | ⚠ duplicated; should consume the same drawer system |

---

## Page-by-page audit

For each page: **Surfaces** (interaction points), **Dead zones** (passive UI),
**Drilldown opportunities** (what each surface should do), **Cross-links**
(where it should lead).

### 1. World Equity Intelligence — `pages/market/WorldEquityIntelligence.tsx`

**Surfaces**
- Table row click → opens inline `InstrumentPanel` (60-day sparkline + OHLC + news)
- Heatmap cell click → selects symbol, returns to table view
- Intelligence view: regime banner + breadth + signals (`classifyWorldEquity`)

**Dead zones**
- Regime banner is read-only. No "why" — no link to underlying breadth shift,
  no historical analog ("this breadth resembles March 2023"), no narrative.
- Breadth pct bar is a number; no historical percentile, no trend.
- Signal bullets are derived but never link to the symbols that triggered them.
- Per-symbol panel: sparkline + news only. No volatility regime, no peer
  comparison, no benchmark-relative analysis.

**Drilldown opportunities (Waves B–G)**
- **Drawer (Wave B):** swap `InstrumentPanel` for unified `IntelligenceDrawer`
  with sections: Summary · Historical · Related · Narrative · Macro · Linked.
- **Summary (Wave C):** breadth narrative — "advancing 32/45 (71%); leadership
  rotated from EM (was 60%) to DM in last 5 sessions."
- **Artifacts (Wave D):** subscribe to `regime_transition` and
  `correlation_breakdown` artifacts where any participating symbol is in
  `WORLD_EQUITY_SYMBOLS`. Show in drawer + a small "recent observations" strip
  under the regime banner.
- **Narrative (Wave E):** overlay active themes on the regime banner —
  "AI concentration", "EM stress" — sourced from `narrativeProducer` output.
- **Historical (Wave F):** `contextualAnalog` for the current breadth + DXY +
  yield curve state → "this configuration last seen Oct 2022, Mar 2023."
- **Cross-links (Wave G):** regime banner clicks → Yields (if curve-driven) /
  FX (if dollar-driven). Symbol drawer → "Related sectors" if US, "Related
  countries" if regional.

**Clutter to compress (Wave H)**
- Three view-mode buttons (table / heatmap / intelligence) — the
  `intelligence` mode duplicates the regime banner that should be a *persistent
  header strip*, not a tab. Promote to header, remove view button.

---

### 2. US Sector Intelligence — `pages/market/UsSectorIntelligence.tsx`

**Surfaces**
- KPI strip (SPY clickable; Offensive Avg / Defensive Avg unclickable)
- Tabs: Overview / Performance / Relative Strength / Heatmap / Intelligence
- Bar chart, table row, heatmap cell → all open `InstrumentDetailDrawer`

**Dead zones**
- Offensive/Defensive Avg cards: derived numbers with no interpretation. No
  rotation magnitude, no historical position, no "drove the gap" attribution.
- Relative Strength bar chart shows current dispersion; no trend, no 5-day
  rotation signal, no leadership stability.
- `IntelligenceSummaryView` rotation signals don't link to which sectors are
  driving the call.
- "Intelligence" tab is verbatim duplicate of Overview's right panel.
- "Relative Strength" tab duplicates the Overview chart.

**Drilldown opportunities**
- **Drawer (Wave B):** existing `InstrumentDetailDrawer` is on the right path
  but needs the new section structure (Historical / Narrative / Macro / Linked).
- **Summary (Wave C):** rotation narrative grounded in offAvg − defAvg gap and
  multi-day delta. "Defensive +0.8% vs offensive +0.1% — third consecutive day
  of defensive leadership; XLK is the swing factor."
- **Artifacts (Wave D):** surface `regime_transition` (defensive↔offensive),
  `correlation_breakdown` between sector pairs, `momentum_reversion_event` for
  individual sectors.
- **Narrative (Wave E):** AI concentration (XLK / semiconductors) and
  defensive rotation themes from `narrativeProducer`.
- **Historical (Wave F):** "this breadth deterioration pattern preceded a vol
  expansion in 6 of last 10 occurrences (lookback: 5 years)."
- **Cross-links (Wave G):** clicking the rotation banner → Yields (rate-sensitive
  sector check) or FX (if dollar-driven). Per-sector drawer → linked
  commodities (XLE→oil, XLB→copper), linked countries (XLF→banks/EM).

**Clutter to compress**
- Drop the `relative-strength` standalone tab (in Overview).
- Drop the `intelligence` standalone tab (promote to persistent header strip).

---

### 3. Global Yields — `pages/market/GlobalYields.tsx`

**Surfaces**
- KPI strip: 10Y / 2Y clickable → opens history; Spread / BEI unclickable
- Yield curve chart points → opens history tab
- Sovereign yield table row → opens history tab
- Tabs: Curve / Table / Spread / History / Intelligence

**Dead zones**
- 10Y–2Y Spread card: shows "INVERTED" warning but no inversion duration, no
  historical depth percentile, no analog episodes.
- 5Y BEI: number only — no inflation regime context, no analog ("BEI at this
  level last preceded X").
- Inverted-curve banner is binary; doesn't quantify *how* inverted vs history.
- Spread History bar chart is a 60-month series with no annotation of prior
  recession-preceded inversions.
- `IntelligenceView.signals` list contains rich text never linked to anything.

**Drilldown opportunities**
- **Drawer (Wave B):** clicking any tenor or spread should open the universal
  drawer with: current value, percentile vs 5y/20y, historical analog episodes,
  related macro (FX/equity/commodity correlations during similar curve states),
  narrative overlay (liquidity / recession).
- **Summary (Wave C):** curve narrative — "curve has been inverted 14 months;
  88th percentile depth vs 1990–present; historically preceded vol expansion."
- **Artifacts (Wave D):** `regime_transition` for curve state, `macro_alignment_change`
  for BEI vs realized inflation, `historical_analog` for inversion episodes.
- **Narrative (Wave E):** "recession narrative" overlay when curve inverted
  + breadth deteriorating; "inflation narrative" overlay tied to BEI level.
- **Historical (Wave F):** mark recession start dates on Spread History chart;
  list comparable inversion episodes in drawer.
- **Cross-links (Wave G):** curve regime → FX (dollar/liquidity), → Sectors
  (XLU/XLF/XLRE rate sensitivity), → Commodities (gold real-rate link).

**Clutter to compress**
- Drop `intelligence` tab. Merge curve + table into a single Overview tab with
  curve left, table right.

---

### 4. FX & Liquidity — `pages/market/FxLiquidityIntelligence.tsx`

**Surfaces**
- KPI strip: DXY / EUR-USD / USD-JPY / GBP-USD — all clickable
- G10 bar chart click → drawer
- All Pairs table row → drawer
- Heatmap cell → drawer
- Liquidity tab: 4 hard-coded text cards
- Tabs: Overview / G10 / All Pairs / Heatmap / Liquidity / Intelligence

**Dead zones**
- **`LiquidityPanel` is the worst offender on the platform** — four static
  paragraphs with no data linkage. "EM Currency Risk" displays the same text
  whether DXY is at all-time highs or lows.
- Carry Trade card is a literal definition, not a measurement.
- Central Bank Divergence card has no live rate-differential.
- DXY proxy card shows %; no regime classification, no historical context.

**Drilldown opportunities**
- **Drawer (Wave B):** opens for any pair; Macro section shows the curve
  + breakeven snapshot relevant to that pair's central bank divergence.
- **Summary (Wave C):** dollar narrative — "DXY +0.4% (5d), strengthening
  regime; carry pairs (USDJPY, USDCNH) confirming; EM FX under pressure."
- **Artifacts (Wave D):** `regime_transition` for dollar regime, `correlation_breakdown`
  for cross-FX, `macro_alignment_change` for rate differentials.
- **Narrative (Wave E):** liquidity / central-bank-divergence narratives.
- **Historical (Wave F):** "this DXY regime historically correlated with weaker
  commodities and EM equity drawdowns."
- **Cross-links (Wave G):** dollar regime → Yields (rate-diff driver) →
  Commodities (inverse) → Countries (EM impact).

**Clutter to compress — high priority**
- **Rewrite `LiquidityPanel`** entirely (Wave H). Replace the 4 static cards
  with: rate-differential bar, DXY 60d percentile, EM FX dispersion, carry
  proxy (USDJPY × yield-diff). Each clickable.
- Drop `intelligence` tab; drop `g10` tab (it's overview chart).

---

### 5. Commodities — `pages/market/CommoditiesIntelligence.tsx`

**Surfaces**
- KPI strip: Gold / Oil / Copper clickable; Energy/Metals Avg unclickable
- Overview table row → drawer
- Heatmap → drawer
- Cross-Asset tab: 6 static notes
- Tabs: Overview / Energy / Metals / Heatmap / Cross-Asset / Intelligence

**Dead zones**
- Energy/Metals Avg KPIs: no momentum, no regime tag.
- Cross-Asset notes are static text plus current pct. No correlation magnitude,
  no historical regime context, no narrative.
- `IntelligenceSummaryView` regime (inflationary/deflationary/neutral) is never
  tied to BEI from Yields or to DXY from FX.

**Drilldown opportunities**
- **Drawer (Wave B):** drawer includes a Macro section showing inflation
  regime (from BEI), dollar regime (from DXY), and real-rate (10Y − BEI) — the
  three actual drivers of gold/oil/copper.
- **Summary (Wave C):** inflation narrative — "energy +2.1%, metals +0.3%,
  gold +0.8%; aligned with BEI rising 5bps and DXY flat — inflationary regime
  intact."
- **Artifacts (Wave D):** `regime_transition` for inflation, `correlation_breakdown`
  for gold-USD link, `seasonal_signal` for energy/natural gas.
- **Narrative (Wave E):** inflation / energy narratives.
- **Historical (Wave F):** for gold: "this real-rate level historically
  preceded gold ±X% over 60 days."
- **Cross-links (Wave G):** gold → Yields (real rates) + FX (DXY); oil → Sector
  (XLE) + Countries (energy-exporters); copper → Countries (China-proxy),
  Sector (XLB).

**Clutter to compress**
- Drop Energy / Metals tabs (filters). Drop `intelligence` tab.
- Replace static Cross-Asset notes with live cross-asset cards driven by
  `quant/crossAsset.ts` + correlation engine.

---

### 6. Countries & Regional Markets — `pages/market/CountriesRegionalMarkets.tsx`

**Surfaces**
- Table row click → inline `CountryDetailPanel` (price + OHLCV chart + news)

**Dead zones**
- Detail panel has price, chart, news, ETF metadata — but **zero macro
  context**. A country is a sovereign economy with rates, FX, commodity
  dependencies, and peer dynamics; this drawer treats it as a ticker.
- No regional peer comparison ("Brazil vs EM Latam peers"), no commodity
  exposure tag (Saudi → oil; Australia → copper; Chile → copper).
- No regional regime context (e.g. EM stress regime when DXY strengthening).

**Drilldown opportunities**
- **Drawer (Wave B):** unify with universal drawer. Country drawer includes
  peer mini-leaderboard (same region), commodity-exposure callout, FX context,
  related ETF risk note.
- **Summary (Wave C):** regional narrative — "EM Latam −1.2% today, third
  down-day; correlated with copper −2.3% and BRL/USD softening 0.6%."
- **Artifacts (Wave D):** `regime_transition` for EM-stress, `correlation_breakdown`
  vs region.
- **Narrative (Wave E):** EM-stress / China-slowdown narratives.
- **Historical (Wave F):** peer-relative percentile, drawdown context.
- **Cross-links (Wave G):** country drawer → FX (its local currency), →
  Commodities (its dominant export), → Yields (developed only). Region pills
  → cross-dashboard chains (EM filter → FX → Commodities).

---

## Component impact map

| Wave | New / changed files | Type |
|---|---|---|
| B | `components/intelligence-drawer/IntelligenceDrawer.tsx` (new) | new system |
| B | `components/intelligence-drawer/sections/{Summary,Historical,Related,Narrative,Macro,Linked}Section.tsx` (new) | new system |
| B | `components/intelligence-drawer/useIntelligenceDrawer.ts` (new) | new hook |
| B | `components/market-dashboards/InstrumentDetailDrawer.tsx` (refactor → adapter onto new drawer) | refactor |
| B | `pages/market/WorldEquityIntelligence.tsx`, `CountriesRegionalMarkets.tsx` (replace inline panels) | refactor |
| C | `lib/intelligence/summaries/{worldEquity,sector,yields,fx,commodities,countries}.ts` (new) | new logic |
| C | Section banners on each dashboard | edit |
| D | `hooks/useArtifactsForSymbols.ts` (new) | new hook on `artifactService` |
| D | `components/intelligence-drawer/sections/ArtifactStrip.tsx` (new) | new component |
| E | `lib/intelligence/narrativeOverlays.ts` (new) — bind `narrativeProducer` output to dashboards | new logic |
| E | Inline narrative chips on regime banners | edit |
| F | `lib/intelligence/historicalContext.ts` (new) — wraps `contextualAnalog` for dashboards | new logic |
| F | Historical section in drawer + analog markers on charts (Yields spread, FX dollar) | edit |
| G | `lib/intelligence/crossLinks.ts` (new) — maps symbols/regimes → target dashboards | new logic |
| G | Banner links + per-drawer "Linked dashboards" section | edit |
| H | All 6 dashboard pages — drop duplicate tabs, compress KPIs, rewrite `LiquidityPanel` | refactor |
| I | QA pass; no new code | tests / hardening |

---

## Data dependency map

| Drawer section | Reads from | Notes |
|---|---|---|
| Summary | `dashboardService.classify*`, page-local aggregates | already exists per-page; lift into `lib/intelligence/summaries/` |
| Historical | `lib/quant/analog`, `contextualAnalog`, `forwardReturns` | requires OHLCV history per symbol (have via `useOHLCV`) |
| Related | `lib/quant/crossAsset`, `correlation`, `benchmarkIntel` | needs benchmark series; reuse SPY/DXY/BEI |
| Narrative | `narrativeProducer` output | requires `narrative_memory` Firestore collection — Phase 5 agent feeds it; Wave E renders empty-state safely |
| Macro | `useYieldCurve`, `useFXDashboard` cross-reads | already fetched on each respective page; add lightweight shared selector |
| Artifacts | `artifactService.subscribeToArtifacts` filtered by symbol set | empty-state graceful (warehouse Phase 5 populates) |
| Linked | `lib/intelligence/crossLinks.ts` rules + react-router | static rule table per asset class |

---

## UX enhancement roadmap

| Wave | Title | Deliverable |
|---|---|---|
| A | Audit | this document |
| B | Drawer system | unified `IntelligenceDrawer` with 6 sections; replaces 2 divergent patterns |
| C | Summaries | data-grounded narrative banners on every section |
| D | Artifacts | live artifact strips in drawers + dashboards; empty-state safe |
| E | Narrative overlays | subtle theme chips on regime banners; persistent narrative drawer section |
| F | Historical context | analog references + percentile annotations + chart markers |
| G | Cross-dashboard linking | banner cross-links + per-drawer "Linked dashboards" |
| H | Density refinement | drop ~6 duplicate tabs; rewrite `LiquidityPanel`; compress KPI strip |
| I | Hardening | full QA, a11y, build green, no regressions |

---

## Non-goals (will not do in this phase)

- No new dashboard pages.
- No new market data providers; no new ingestion pipelines.
- No backend artifact-producer logic (agent layer is Phase 5).
- No design-system overhaul; reuse existing tokens.
- No charting library swap.

---

## Acceptance signal at end of Wave I

A user clicking *any* element on any dashboard should see — at minimum — an
interpretation, a historical comparison, and a link to a related dashboard.
No click should terminate in raw numeric data alone.
