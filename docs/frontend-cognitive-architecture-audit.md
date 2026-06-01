# Frontend Cognitive Architecture Audit

> **Status:** Audit only — no redesign implemented.
> **Date:** 2026-05-29
> **Scope:** Page / workspace topology, navigation, naming, embedded-vs-standalone workflow conflicts.
> **Hard constraint:** Preserve existing intelligence systems, portfolio intelligence, historical
> intelligence, copilot direction, and the institutional workflow philosophy. Nothing is removed
> in this document — it classifies and recommends. All implementation is deferred to isolated,
> test-gated PRs (see *Proposed Remediation Workflow*).

---

## 1. Current Surface Inventory

### 1.1 Routes (`src/App.tsx`)

| Route | Page | In sidebar? | Notes |
|---|---|---|---|
| `/` | `MarketHome` | ❌ (logo only) | Post-auth landing; aggregator of embedded panels |
| `/terminal` | `IntelligenceTerminal` | ✅ main | Market discovery terminal |
| `/investigations` | `Investigations` | ❌ | **Orphan** — no nav, no inbound link; panel also embedded in Copilot |
| `/instruments/:symbol` | `InstrumentDetail` | ❌ (deep target) | Single-asset research; reached from embedded contexts |
| `/macro` | `MacroRegimeDesk` | ✅ main | Macro / regime |
| `/relations-map` | `RelationsMap` | ✅ main | Cross-asset graph |
| `/cross-asset` | → `/relations-map` | — | Redirect alias |
| `/research` · `/research/i/:id` | `HistoricalResearch` | ✅ main | Investigation workflow |
| `/positioning` | → `/research` | — | Redirect alias |
| `/backtesting` | `Backtesting` | ✅ main | Strategy backtests |
| `/models` | → `/backtesting` | — | Redirect alias |
| `/lab` | `QuantLab` | ✅ main | Metrics / signals sandbox |
| `/copilot` | `ResearchCopilot` | ❌ (topbar pill) | Standalone copilot; **also embedded ~13 places** |
| `/historical-intelligence` | `HistoricalIntelligenceTerminal` | ✅ main | Historical intelligence terminal |
| `/warehouse` | `WarehouseExplorer` | ✅ main | Dataset registry / data infra |
| `/briefings` · `/briefings/:id` | `Briefings` / `BriefingDetail` | ✅ main | Generated research briefings |
| `/library` | `ResearchLibrary` | ✅ main | Manually saved intelligence |
| `/artifacts/:id` | `ArtifactPage` | ❌ (deep target) | Single artifact view |
| `/settings` | `Settings` | ✅ bottom | — |
| `/market/{world-equity,us-sectors,global-yields,countries,commodities,fx-liquidity}` | 6 dashboards | ✅ group | Market Dashboards collapsible |
| `/portfolio/{overview,holdings,exposure,attribution,risk,scenario}` | 6 pages | ✅ group | Portfolio Intelligence collapsible |
| `/portfolio/:portfolioId/awareness` | `PortfolioAwareness` | ❌ | **Orphan within group** — not in the 6-item Portfolio nav |
| `/portfolio` | → `/portfolio/overview` | — | Redirect alias |

### 1.2 Navigation patterns in play (five coexisting)

1. **Flat main list** — 10 unlike-altitude items in one ungrouped column.
2. **Collapsible groups** — Market Dashboards (6), Portfolio Intelligence (6).
3. **Topbar pill** — Copilot launcher.
4. **Logo-only** — Market Home (the landing has no nav row).
5. **Orphan routes** — `/investigations`, `/artifacts/:id`, `/portfolio/:id/awareness` (and deep targets `/instruments/:symbol`).

---

## 2. Findings by Focus Area

### 2.1 Duplicate workflows
- **Intelligence Terminal vs Historical Intelligence Terminal** — two "intelligence terminal"
  destinations. One is live-market discovery; the other is historical. Same noun, adjacent intent →
  users cannot predict which to open.
- **Research-output surfaces are fragmented across four pages**: `Briefings` (generated),
  `ResearchLibrary` (manually saved), `ArtifactPage` (single artifact), and `HistoricalResearch`
  investigations. These are all "where my research lives" with no single index.
- **Investigations workflow exists twice**: orphaned standalone page `/investigations` and the
  embedded `<InvestigationsPanel embedded />` inside Copilot. Only the embedded one is reachable.

### 2.2 Overlapping pages
- **Market Home** aggregates `PortfolioInsights`, `IntelligenceSpotlight`, `MarketDataGrid`,
  `ValuationTable` — summary-level overlaps with Portfolio Overview, Intelligence Terminal, and the
  market dashboards. Acceptable *as a home digest*, but the overlap must be explicitly positioned as
  "summary → drill-down," not parallel destinations.
- **Regime** concept is spread across Macro Regime Desk, Portfolio → Risk & Regime Fit, and
  Relations Map regime overlays — three regime entry points with no cross-link.

### 2.3 Naming collisions
- **"Terminal"** ×2 (Intelligence Terminal, Historical Intelligence Terminal).
- **"Historical"** ×2 page-level (Historical Research, Historical Intelligence Terminal) — plus the
  Historical Intelligence system underneath.
- **"Research"** ×3 (Historical Research, Research Library, Research Copilot).
- **"Intelligence"** appears in ~8 labels (4 market dashboards, the Portfolio group, 2 terminals).
  Word inflation collapses information scent — the word no longer disambiguates anything.

### 2.4 Navigation fragmentation
- The flat 10-item main nav mixes **discovery** (Terminal), **lenses** (Macro, Relations Map),
  **research workflow** (Historical Research, Lab, Backtesting), **outputs** (Briefings, Library),
  and **infra** (Warehouse) in one ungrouped scan. No altitude hierarchy → linear scan cost on every
  navigation.
- **Market Home has no nav row** — the product's landing is reachable only via the logo, an
  undiscoverable affordance for "take me home."
- **PortfolioAwareness** is routed but absent from the Portfolio Intelligence group it belongs to.
- **Five navigation patterns** (§1.2) train the user in five different "how do I get there" models.

### 2.5 Embedded vs standalone conflicts
- **Copilot** has two homes: standalone `/copilot` page *and* embedded across ~13 surfaces
  (IntelligenceSidePanel, drawers, relations-map rails, HIT tabs, etc.). The **embedded copilot is
  the live, context-aware product direction** (per project memory) — the standalone page's role is
  undefined relative to it.
- **InvestigationsPanel** — embedded (live) vs standalone `/investigations` (orphan).
- **IntelligenceDrawer / DataDrawer** — global overlay providers that surface intelligence on top of
  any page, overlapping the standalone intelligence pages without a stated boundary.
- **InstrumentDetail / ArtifactPage** — correctly standalone *deep targets* reached from embedded
  contexts; not a conflict, but should be explicitly labeled as canonical detail destinations.

---

## 3. Classification

Each major surface is classified **core / supporting / embedded / redundant / transitional**.
Redundant ≠ "delete" — it means *consolidation candidate, pending an isolated PR*.

| Surface | Class | Rationale |
|---|---|---|
| Market Home (`/`) | **Core** | Post-auth landing / daily digest |
| Intelligence Terminal (`/terminal`) | **Core** | Primary market-discovery entry |
| Portfolio Overview (`/portfolio/overview`) | **Core** | Portfolio Intelligence hub |
| Backtesting (`/backtesting`) | **Core** | Primary strategy-validation workflow |
| Research Copilot (embedded) | **Core** | Context-aware copilot = product direction |
| Macro Regime Desk (`/macro`) | **Supporting** | Macro lens under discovery |
| Relations Map (`/relations-map`) | **Supporting** | Cross-asset lens |
| Quant Lab (`/lab`) | **Supporting** | Metrics/signal sandbox |
| Historical Intelligence Terminal (`/historical-intelligence`) | **Supporting** | Historical intelligence system surface |
| Market Dashboards ×6 (`/market/*`) | **Supporting** | Asset-class lenses (already grouped) |
| Portfolio sub-pages ×5 (holdings/exposure/attribution/risk/scenario) | **Supporting** | Portfolio lenses (already grouped) |
| Portfolio Awareness (`/portfolio/:id/awareness`) | **Supporting** | Belongs in the Portfolio group; currently orphaned |
| Instrument Detail (`/instruments/:symbol`) | **Embedded** | Canonical single-asset deep target |
| Artifact Page (`/artifacts/:id`) | **Embedded** | Canonical single-artifact deep target |
| Intelligence/Data Drawers | **Embedded** | Global overlay intelligence |
| Investigations Panel (in Copilot) | **Embedded** | Live investigation UI |
| Warehouse Explorer (`/warehouse`) | **Supporting** (infra) | Dataset registry; admin/infra altitude, not daily research |
| Investigations standalone (`/investigations`) | **Redundant** | Orphaned duplicate of embedded panel |
| Research Library vs Briefings vs Artifact index | **Redundant** | Fragmented "my research" surfaces → one index |
| Historical Research (`/research`) | **Transitional** | Overlaps Historical Intelligence Terminal; naming collision |
| Research Copilot standalone page (`/copilot`) | **Transitional** | Role to be redefined relative to embedded copilot |
| `/cross-asset`, `/models`, `/positioning` redirects | **Transitional** | Legacy aliases; keep until link audit confirms zero external refs |

---

## 4. Recommended Navigation Hierarchy

Goal: replace the flat 10-item list + ad-hoc patterns with **one grouped model at consistent
altitude**. No routes are renamed/moved in this document — this is the target IA for the staged PRs.

```
Home                         /                     (add explicit nav row; keep logo link)
Copilot                      (topbar pill — keep; this is the embedded-first entry)

DISCOVER
  Intelligence Terminal      /terminal
  Macro Regime Desk          /macro
  Relations Map              /relations-map
  Market Dashboards ▸        /market/*             (existing collapsible group)

RESEARCH
  Historical Intelligence    /historical-intelligence
  Historical Research        /research             (consolidation candidate — §5.2)
  Quant Lab                  /lab
  Backtesting                /backtesting

PORTFOLIO ▸                  /portfolio/*          (existing group + add Awareness)
  Overview · Holdings · Exposure · Attribution · Risk · Scenario · Awareness

LIBRARY
  Research Library           /library              (becomes the single "my research" index — §5.1)
  Briefings                  /briefings

DATA
  Data Warehouse             /warehouse

Settings                     /settings             (bottom)
```

Key moves (each its own PR):
- Introduce **section labels** (Discover / Research / Portfolio / Library / Data). Pure presentation.
- Add a **Home** nav row.
- Fold **Portfolio Awareness** into the Portfolio group.
- Keep the Copilot pill as the canonical embedded-first entry.

---

## 5. Recommended Consolidations (candidates — not executed here)

### 5.1 Unify "my research" surfaces under one index
`ResearchLibrary` becomes the single index; `Briefings` and `ArtifactPage` become **typed views**
within it (briefing / artifact / saved-snapshot / lab-session) rather than parallel destinations.
*Preserve:* every existing artifact kind and the briefings pipeline — this is an index/IA change,
not a data change.

### 5.2 Resolve the Historical Research ↔ Historical Intelligence Terminal overlap
Decide one canonical "historical" workflow surface and make the other a typed entry into it. Likely:
Historical Intelligence Terminal is the system; Historical Research is the investigation workflow on
top of it → cross-link, then evaluate merge. *Do not merge blindly* — confirm distinct user intents
first via the workflow-reasoning review (Stage 1 below).

### 5.3 Retire the orphaned `/investigations` standalone
The embedded `InvestigationsPanel` is the live surface. The standalone is unreachable. Candidate for
removal *after* confirming no deep links — but per the "preserve" constraint, this is flagged, not
deleted here.

### 5.4 De-inflate "Intelligence" / "Terminal" naming
Reduce the word "Intelligence" where the section label already carries it (e.g. under a "Discover"
group, market dashboards need not each repeat "Intelligence"). Pure copy change; highest ROI, lowest
risk.

---

## 6. Workflow Reasoning

- **Altitude separation.** Discovery, research workflow, portfolio, outputs, and infra are different
  cognitive modes. A flat list forces mode-switching cost onto every click. Grouping encodes the
  desk metaphor an institutional user already holds.
- **One entry per workflow.** Duplicate homes (Copilot ×2, Investigations ×2) create "which one is
  real?" hesitation. The rule: **embedded = in-context action; standalone = canonical deep target
  or full-screen workspace.** Every surface must declare which it is.
- **Information scent.** When eight labels share a word, the word stops disambiguating. Section
  labels should carry the category so leaf labels can carry the *distinction*.
- **Reversibility first.** Presentation-only changes (grouping, labels, a Home row) are reversible
  and ship first. Structural consolidations (merging research surfaces) require intent confirmation
  and ship last, isolated.

## 7. Institutional UX Rationale

Institutional research tools (Bloomberg, FactSet, internal quant desks) optimize for **muscle-memory
navigation and zero ambiguity under time pressure**, not for discovery-by-browsing. That implies:

- **Stable, grouped, predictable IA** — the analyst memorizes paths; fragmentation taxes recall.
- **Context-first intelligence** (the embedded copilot/drawers) is correct and should be reinforced,
  not replaced by forcing users to a standalone page.
- **A single research-of-record index** matches how desks file work; scattered output pages lose
  provenance.
- **Lenses, not destinations** — Macro/Relations/Market/Portfolio views are *lenses* on the same
  instruments; the IA should make that hierarchy legible (Discover → lens; Portfolio → lens).

---

## 8. Proposed Remediation Workflow (isolated, test-gated PRs)

> No giant PRs. No speculative refactors. No architecture rewrites. Each stage is one PR, must pass
> tests/lint before the next begins, and preserves current product direction. Stages 1–3 are
> presentation-only and reversible; structural stages come last and require intent confirmation.

| Stage | PR scope | Type | Risk | Gate |
|---|---|---|---|---|
| **0** | This audit document | docs | none | merge first |
| **1** | Add sidebar **section labels** (Discover/Research/Portfolio/Library/Data); no route changes | presentation | low | lint + `npm test` |
| **2** | Add **Home** nav row; fold **Portfolio Awareness** into the Portfolio group | presentation | low | lint + test |
| **3** | **Naming de-inflation** — copy-only label changes (§5.4) | presentation | low | lint + test |
| **4** | **Research Library as single index** — Briefings/Artifacts become typed views (§5.1) | structural | med | lint + test + manual click-through |
| **5** | **Historical Research ↔ HIT** cross-link + intent confirmation (§5.2) | structural | med | lint + test + UX sign-off |
| **6** | Resolve **Copilot standalone vs embedded** role; redefine `/copilot` | structural | med | lint + test + UX sign-off |
| **7** | Audit deep links, then retire orphan `/investigations` & stale redirect aliases | cleanup | low | lint + test + grep-confirm zero refs |

Each PR is committed and opened separately per stage. Stage N does not start until Stage N-1 is
green and merged.

---

## 9. Preservation Checklist (must remain intact across all stages)

- [ ] Intelligence systems (Intelligence Terminal, drawers, side panels, artifact kinds)
- [ ] Portfolio intelligence (all 6 sub-pages + Awareness + simulated portfolio system)
- [ ] Historical intelligence (HIT engines + artifact kinds)
- [ ] Copilot direction (embedded-first, context-aware)
- [ ] Institutional workflow philosophy (lenses, provenance, muscle-memory IA)
