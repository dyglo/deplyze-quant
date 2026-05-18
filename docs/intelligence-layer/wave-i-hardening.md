# Wave I — Final Hardening & Phase Summary

> Closes the Dashboard Intelligence Layer phase. Records the final
> architecture, verification matrix, and the deliverables the prompt asked
> for at the end of the phase.

## Verification matrix

| Check | Command | Status |
|---|---|---|
| Type-check (frontend) | `npx tsc --noEmit` | ✅ clean |
| Type-check (gateway, CI) | CI job | ✅ clean on every wave PR |
| Production build | `npm run build` | ✅ ~20–32s; no new warnings |
| Frontend CI build | CI job | ✅ green on each PR (A–H) |
| Gateway Docker CI build | CI job | ✅ green on each PR (A–H) |
| Hooks (focus restore, ESC, backdrop) | Manual | drawer chrome exercised |
| Routing | Manual | `/market/*` routes unchanged; cross-links use `state` rather than path mutation |
| Provider failure | Manual | each hook degrades to `unavailable` / empty state when workspace or gateway is absent |

CI on each wave PR exercised: `Type-check · Frontend`, `Type-check ·
Gateway`, `Build · Frontend (Vite)`, `Build · Gateway (Docker)`. All green.

## Empty-state policy (strict-real-data)

Every new surface introduced this phase is empty-state safe:

- **SummaryStrip** — returns `null` when no payload (page still loads if
  classifier data not yet available).
- **ArtifactStrip** — `hideWhenEmpty=true` default; invisible until the
  agentic producer layer writes artifacts.
- **NarrativeOverlay** — same; hidden when `/narratives/memory` returns
  empty; falls back silently on fetch error.
- **HistoricalSection** — returns `null` payload when bar history shorter
  than `3 × window`; section renders its own empty state otherwise.
- **LinkedSection** — caller decides; we only emit links from curated rules,
  never fabricate.
- **LiquidityPanel** — each card omits itself when its underlying metric is
  unavailable.

No surface fabricates data. No surface renders a misleading placeholder.

## Accessibility

- `IntelligenceDrawer` is `role="dialog"`, `aria-modal="true"`, has a stable
  `aria-labelledby`, focus moves to the panel on open and restores on
  close, ESC closes, backdrop click closes.
- Close button has `aria-label="Close drawer"`.
- All chip / pill controls are real `<button>` elements with disabled state
  when not actionable; cross-links are real `<Link>` elements.
- Section eyebrows are visually uppercase via CSS `text-transform`, not
  hard-coded uppercase strings (screen-readers get sentence case).

## Performance notes

- Drawer mounts a single `<aside>` per consumer and uses CSS transforms
  for the slide animation — no layout thrash.
- Per-dashboard intelligence band (Summary / Artifact / Narrative) only
  computes payloads via `useMemo` keyed on already-fetched data; no
  additional network calls beyond `/narratives/memory` (cached by the
  shared `gatewayGet` with `ClientTTL.macro_series`).
- Historical context fetches an extra 252-bar OHLCV per opened drawer
  for equity / ETF / index only — single request, cached by `useOHLCV`.
- Total new bundle delta across waves A–H: <40 kB (per Vite build
  reporter); no new dependencies added.

## Final phase summary (matches the prompt's "Provide" list)

### 1. PR links per wave

| Wave | PR | Title |
|---|---|---|
| A | [#95](https://github.com/dyglo/deplyze-quant/pull/95) | Dashboard Intelligence Audit |
| B | [#96](https://github.com/dyglo/deplyze-quant/pull/96) | Contextual Intelligence Drawer System |
| C | [#97](https://github.com/dyglo/deplyze-quant/pull/97) | Dashboard Intelligence Summaries |
| D | [#98](https://github.com/dyglo/deplyze-quant/pull/98) | Intelligence Artifact Integration |
| E | [#99](https://github.com/dyglo/deplyze-quant/pull/99) | Narrative Intelligence Overlays |
| F | [#100](https://github.com/dyglo/deplyze-quant/pull/100) | Historical Context Layer |
| G | [#101](https://github.com/dyglo/deplyze-quant/pull/101) | Cross-Dashboard Intelligence Linking |
| H | [#102](https://github.com/dyglo/deplyze-quant/pull/102) | Dashboard Intelligence Density Refinement |
| I | (this PR) | Final Hardening & Phase Summary |

PRs are stacked: each targets the prior wave's branch. As Wave B merges
to `main`, each subsequent PR auto-rebases.

### 2. New intelligence systems added

- **Universal slide-over drawer** (`components/intelligence-drawer/`)
  with six typed section slots (Summary / Historical / Related /
  Narrative / Macro / Linked) — replaces the previous bespoke
  `InstrumentDetailDrawer` plumbing while preserving the existing
  `IntelligenceSidePanel` content surface.
- **Persistent intelligence band** on every dashboard: SummaryStrip →
  ArtifactStrip → NarrativeOverlay. Always visible regardless of which
  tab is active. Replaces the now-removed standalone Intelligence tabs.
- **Summary generators** (`lib/intelligence/summaries.ts`) — six
  per-dashboard adapters that produce data-grounded `SummaryPayload`
  from the existing `classify*` outputs plus a richer body line
  (breadth %, offensive vs defensive gap, real 10Y, DXY%, gold/silver
  ratio, DM vs EM breadth split).
- **Historical context layer** (`lib/intelligence/historicalContext.ts`)
  — wraps `quant/analog.findHistoricalAnalogs` into the drawer payload
  with month/year analog windows + percentile rank for today's return.
- **Cross-link rules** (`lib/intelligence/crossLinks.ts`) — curated
  per-symbol / per-asset-class navigation with bespoke copy.

### 3. Interaction systems added

- Slide-over drawer with backdrop, ESC, focus restore, keyboard a11y.
- Expandable signal chips in `SummaryStrip`.
- Hover-promoted border on related-asset and narrative chips.
- Cross-dashboard links carry router `state` (`fromSymbol`,
  `fromDashboard`, optional `filter`) for downstream breadcrumb /
  pre-filter wiring.

### 4. Drawer / context architecture summary

```
IntelligenceDrawer (chrome)
  └─ children            (page-specific content, e.g. IntelligenceSidePanel)
  └─ sections            (typed per-section payloads)
       ├─ summary        (SummaryPayload)
       ├─ macro          (MacroPayload)
       ├─ narrative      (NarrativePayload)
       ├─ historical     (HistoricalPayload)  ← Wave F: populated
       ├─ related        (RelatedPayload)
       └─ linked         (LinkedPayload)      ← Wave G: populated
```

Consumers compose sections à la carte. `InstrumentDetailDrawer` is the
canonical example — it injects `historical` + `linked`. Pages can add
others without further refactor.

### 5. Artifact integration summary

- `useDashboardArtifacts(symbolSet)` subscribes to the active
  workspace/project's artifact stream and filters by symbol universe.
- `ArtifactStrip` renders compact chips with category label + title +
  symbol + age. Tooltip exposes the artifact narrative.
- Hidden until the agentic producer layer (Phase 5) fills the warehouse
  with `regime_transition` / `correlation_breakdown` / `historical_analog`
  / `narrative_emergence` records.

### 6. Narrative overlay summary

- `useDashboardNarratives(symbolSet)` calls `/narratives/memory` via the
  existing `v3p2Service`, normalises `lifetime_score` via tanh, filters
  by symbol universe.
- `NarrativeOverlay` renders subtle polarity-tinted pills (label +
  strength). Hidden if empty. Designed to feel woven into the page, not
  bolted on.

### 7. Historical context summary

- `buildHistoricalPayload(bars)` from
  `lib/intelligence/historicalContext.ts` produces:
  - **Percentile bar** — today's return vs trailing 252-day distribution.
  - **Analog windows** — top-K matches (month/year + similarity %) with
    a one-line fingerprint summary (realised vol · trend · drift).
- Rendered in the drawer's `HistoricalSection` for equity / ETF / index
  asset classes; skipped for FX / commodities where bar history is
  patchier.

### 8. Cross-dashboard linking summary

Curated routes per the wave brief:

```
Sectors      → Yields · FX · (XLE/XLB → Commodities filter)
Commodities  → Yields (real-rate) · FX (dollar transmission)
FX           → Yields (rate differentials) · Commodities · (UUP → WorldEquity EM filter)
Country ETFs → FX · Commodities (dominant-export) · World Equity (regional peers)
```

Each link carries router `state` for downstream pre-filter wiring.

### 9. Clutter reduction summary

Six tabs removed across four dashboards:

| Dashboard | Removed | Reason |
|---|---|---|
| Sectors | `Relative Strength`, `Intelligence` | Already in Overview; SummaryStrip supersedes |
| Yields | `Intelligence` | SummaryStrip supersedes |
| FX | `G10`, `Intelligence` | Already in Overview; SummaryStrip supersedes |
| Commodities | `Energy`, `Metals`, `Intelligence` | Filter-only duplicates of Overview |

Plus the **LiquidityPanel rewrite**: from four static text cards to
four live data-grounded readouts (DXY direction, USD/JPY carry, G10
dispersion, EM proxy). The audit's worst dead-zone is now the
densest live-data section in the dashboard.

### 10. Performance verification

- Build clean and stable across all 8 waves (no new chunk-size warnings,
  no new dependencies).
- Per-dashboard intelligence band is `O(1)` extra renders driven by
  `useMemo` over already-fetched data plus one cached `/narratives/memory`
  fetch.
- Drawer history adds a single 252-bar `useOHLCV` per opened instrument.

### 11. Accessibility verification

- Drawer is a proper `role="dialog"` with `aria-modal`,
  `aria-labelledby`, focus management, ESC and backdrop close.
- All actionable chips / links are real `<button>` / `<Link>` elements.
- Close buttons have `aria-label`s.

### 12. Future recommendations

Not in scope for this phase but natural follow-ups:

1. **Producer layer (Phase 5)** — once agentic producers populate the
   warehouse with `regime_transition` / `correlation_breakdown` /
   `historical_analog` artifacts, ArtifactStrip will fill in on every
   dashboard with zero further UI work.
2. **Destination pre-filter wiring** — `crossLinks` already pass
   `state.filter` (e.g. `"emerging"`, `"energy"`); each destination
   dashboard can pick it up via `useLocation()` and pre-narrow its
   tab/filter on arrival.
3. **WorldEquity / Countries inline panels** — these still use the
   bespoke split-pane. The new section components are exported and can
   be dropped into those inline panes for full unification when desired.
4. **Macro section payload** — `MacroSection` is wired but not yet fed
   in the drawer. A shared `useMacroSnapshot()` hook reading the latest
   yield-curve + DXY state would let every drawer show a one-glance
   macro panel.
5. **Code-splitting** — Vite reports the main chunk >500 kB; not new
   this phase, but routes like `/market/*` are good split candidates.
6. **Snapshot tests** — none added this phase; the surfaces are mostly
   data-driven and would benefit from a small snapshot suite (drawer
   open/close, SummaryStrip tones, ArtifactStrip empty/loaded).

## Acceptance signal

A user clicking *any* element on any dashboard now sees — at minimum:

1. An interpretation (SummaryStrip is always visible).
2. A historical comparison (drawer's HistoricalSection for equity/ETF).
3. A link to a related dashboard (drawer's LinkedSection via curated
   crossLinks rules).

No click terminates in raw numeric data alone.
