# Institutional UX Refinement Audit — Visual System, Terminology & Feed Polish

> **Status:** Audit only — no refinement implemented in this document.
> **Date:** 2026-05-29
> **Author role:** Principal Institutional UX Architect / Design Systems Lead
> **Scope:** Visual debt, terminology leakage, shared-component inconsistency, feed/observation
> density, typography rhythm, badge/chip/status systems. Complements (does not duplicate) the
> existing `frontend-cognitive-architecture-audit.md`, which covers navigation/IA/naming topology.
> **Hard constraint:** Preserve every intelligence system, backend integration, API, portfolio
> system, workflow, and reasoning architecture. This is a **presentation + copy** refinement.
> Nothing is removed from the product; surfaces are made calmer and Deplyze-native.

---

## 0. Method

Findings below are evidence-based, drawn from a full sweep of `src/` (240 `.tsx` files), the token
layer (`src/index.css`), the shared primitives (`components/ui/*`), and the shared quant/feed
components. Counts are reproducible via `grep` over `--include="*.tsx"`.

---

## 1. Executive Summary

Deplyze already has a **strong centralized design language** in `src/index.css`: a Claude-inspired
warm palette (Pampas / terracotta / olive), a `ds-*` utility system (`ds-surface`, `ds-panel`,
`ds-title`/`ds-heading`/`ds-body`/`ds-caption`/`ds-label`, `ds-pill-*`, `ds-dot-*`, `ds-table`,
`ds-btn-*`). The problem is **adoption, not absence**: most components bypass the system with
ad-hoc inline styles, hardcoded off-palette colors, and per-component micro-typography.

The headline metrics:

| Signal | Count | Implication |
|---|---|---|
| Raw `border` usages in TSX | **3,068** | Borders are hand-rolled inline, not from one surface system |
| `ds-surface` / `ds-panel` usages | **116** | The shared surface system is barely adopted |
| shadcn `Card` (`components/ui/card.tsx`) imports | **0** | A whole card primitive exists but is dead; every card is bespoke |
| Off-palette hardcoded hex (`#6366f1`, `#ef4444`, `#8b5cf6`, `#06b6d4`…) | **94** across **18 files** | Indigo/red/purple/cyan clash with the warm terracotta/olive identity |
| `borderLeft` / `border-l` accent lines | **19 files** | Directly violates the recorded "no left-accent lines" standard |
| Raw `source_tables` (BigQuery table names) rendered to users | **2 files** | Infrastructure identifiers shown in production UI |
| `V3 Phase 2` / `V3P2` / phase wording in visible text | multiple | V-phase engineering language leaking to users |

**Strategy:** Don't redesign — **converge**. Promote the existing `ds-*` system to a small set of
shared React primitives, route every card/feed/tile/badge through them, neutralize the palette,
and scrub terminology centrally. Typography-led hierarchy and softer separation fall out of that
convergence for free.

---

## 2. Visual Debt

### 2.1 Borders & separation are hand-rolled, not systemic
- **3,068** inline `border` declarations vs **116** `ds-surface`/`ds-panel` and **0** `Card` uses.
  Each component invents `border: '1px solid var(--border)'`, `borderRadius: 8`, its own padding.
  Result: subtly inconsistent radii (3 / 6 / 8 / 0.5rem), inconsistent inset padding, and a
  "boxed-in" feel — every panel fights every other panel for edge contrast.
- **Calm institutional surfaces separate by space and tone, not by drawing a box around everything.**
  The fix is one shared surface scale (flat / inset / ghost) where most internal dividers become
  whitespace or a single hairline, and only top-level panels carry an edge.

### 2.2 Left-accent lines (recorded anti-pattern)
- `borderLeft: '3px solid …'` appears in **19 files**, most visibly in the intelligence feed
  (`IntelligenceObservationCard.tsx:64`). Project memory (`feedback_market_home_flat`) explicitly
  records: **no left-accent lines.** These add chromatic noise and a "ticket/log row" aesthetic
  that reads as engineering tooling, not a research terminal.

### 2.3 Off-palette color leakage
- **94** hardcoded indigo/red/amber/purple/cyan/green hexes across **18** files. Example
  (`IntelligenceObservationCard.tsx:15-33`): severity uses `#ef4444 / #f59e0b / #6366f1`; domain
  accents use `#8b5cf6, #06b6d4, #10b981, #ec4899, #f97316`. None of these exist in the token
  system — the palette is terracotta `#C15F3C`, olive `#788C5D`, slate-blue `#6A9BCC`, plus the
  `--ds-gain/--ds-loss` performance pair and the `ds-sev-*` severity ramp.
- The token layer **already defines** the correct severity ramp (`.ds-sev-critical/high/medium/low`
  and `.ds-pill-*`). Components reinvent it with web-default colors. This is the single biggest
  source of "noise" — the app looks like five different products stacked.

### 2.4 Card system fragmentation
- Three parallel "card" idioms coexist: the dead shadcn `Card` (ring-based,
  `ring-1 ring-foreground/10`), the `ds-surface`/`ds-panel` CSS classes, and thousands of inline
  `style={{ background, border, borderRadius }}` blocks. No single source of truth for elevation,
  radius, header rhythm, or padding.

---

## 3. Terminology Leakage (engineering → production)

The brief's top priority. Confirmed user-facing leaks:

| Location | Leaked text | Class |
|---|---|---|
| `IntelligenceObservationCard.tsx:187`, `ContextualReasoningCard.tsx:140` | renders **`source_tables`** (raw BigQuery table names) | infra identifier |
| `V3P2MacroRegimePanel.tsx:76`, `V3P2LatestBriefingsPanel.tsx:51` | **"V3 Phase 2 · deterministic"** | V-phase + impl detail |
| `NarrativeExposurePanel.tsx:150` | **"Run the V3P2 narrative pipeline first."** | V-phase + pipeline |
| `PortfolioVulnerabilityPanel.tsx:148` | "…once the **regime intelligence pipeline** has run." | pipeline wording |
| `AwarenessSnapshotControl.tsx:64-74` | **"backend unreachable" / "No backend snapshot" / "Persist … to the backend store"** | backend wording |
| `MockBanner.tsx` | "the backing system (**BigQuery features, agentic runs**) … **ships in a later phase**" | infra + phase |
| `FreshnessBadge.tsx:31-33` | raw **`CACHED` / `STALE` / `ERROR`** status text | cache/infra status |
| `Settings.tsx:9-20` | a **second** provider list duplicating `lib/providerLabels.ts` (drift risk; vendor IDs as keys) | vendor exposure |
| `providerLabels.ts:30`, `AgentStatusDashboard.tsx:2` | **"Model Observatory"** (a surface already replaced by Backtesting) | stale infra name |
| component names | `V3P2MacroRegimePanel`, `V3P2LatestBriefingsPanel`, `services/v3p2Service` | V-phase in code (non-visible, lower priority) |

**Borderline — keep as product nouns, scrub the engineering edges:** "Agent" / "agent
observations" is a legitimate Deplyze product concept (the background intelligence agents). Keep
the noun; remove the *operational* surfacing — `Agent ID`, run-status dashboards framed as ops,
`source_tables` provenance, "pipeline/recompute/cron" verbs.

**Single source of truth already exists** (`lib/providerLabels.ts` → neutral capability labels). The
fix is to *route everything through it* and delete the duplicate list in `Settings.tsx`, not to
write new mappings.

---

## 4. Feed & Observation Problems

The intelligence feed is the most-seen surface and the noisiest. `IntelligenceObservationCard`
(the canonical row) carries, per item: a colored left border, a domain tag, a severity pip, a
title, a confidence badge, a chevron, then on expand — a symbol-chip row, a tag-chip row, a
`source_tables` line, and a timestamp. That is **up to 6 competing chip/badge systems in one card**,
each with its own font size (8/9/10/10.5/11px) and its own off-palette color.

Problems:
- **Chip overload** — symbols, tags, domain, severity, confidence, source all rendered as discrete
  pills. Institutional feeds lead with *one* line of meaning; metadata is demoted, not stacked.
- **Micro-typography chaos** — five font sizes in one component, none from `ds-*`.
- **Color noise** — every domain a different saturated hue; severity in web-default red/amber.
- **Provenance leak** — `source_tables` in the footer.
- **Density without rhythm** — separation by borders, not by a consistent vertical scale.

The fix is a **single shared feed-row + observation primitive**: title-led, one tone-mapped
severity cue (from `ds-sev-*`), confidence demoted to one badge, symbols as quiet inline links,
tags collapsed/hidden by default, no left border, no source tables. `ContextualReasoningCard`,
`AgentIntelligenceFeed`, `IntelligenceFeed`, `IntelligenceSpotlight` all converge on it.

---

## 5. Typography Issues

- The scale **exists and is good** (`ds-title` 20 / `ds-heading` 13 / `ds-body` 13 / `ds-caption`
  11 / `ds-label` 11-caps / `ds-badge` 10). It is **under-used**: components set `fontSize: 9/10/
  10.5/11/11.5` inline instead. This produces ragged hierarchy across pages that should feel
  identical.
- Heading weight/casing is inconsistent (some `font-heading` via Card, some inline 600, some
  uppercase letter-spaced labels, some not).
- **Refinement:** make `ds-*` typography the *only* sanctioned text styling; convert inline
  `fontSize` to the nearest token. Hierarchy becomes typographic (size/weight/color), not boxed.

---

## 6. Component Inconsistency Map

| Concern | Sanctioned primitive (target) | Current reality |
|---|---|---|
| Surface / card | one shared `Surface`/`Panel` over `ds-surface`/`ds-panel` | 3,068 inline borders, 0 `Card`, 116 `ds-*` |
| Badge / chip | `ds-badge` + `ds-pill-*` (+ `ConfidenceBadge`, which is *correct*) | 94 off-palette inline pills |
| Severity color | `ds-sev-*` / `ds-pill-*` ramp | per-component `#ef4444/#f59e0b/#6366f1` |
| Status / freshness | tone-mapped, human-worded badge | raw `CACHED/STALE/ERROR` |
| Feed row / observation | one shared observation primitive | bespoke per feed, chip overload, left borders |
| Provider/source label | `lib/providerLabels.ts` | duplicated in `Settings.tsx`; `source_tables` leak |
| Typography | `ds-title/heading/body/caption/label` | inline `fontSize` 8–11.5 |

`ConfidenceBadge` is the model citizen (it uses `ds-pill-*`); the refinement makes everything else
look like it.

---

## 7. Refinement Strategy

**Principle: converge on the system that already exists; neutralize, then quiet.**

1. **Centralize, don't re-skin.** Every fix lands in a shared primitive or the token layer, never as
   a per-page patch. Touch `ds-*` / shared components once; the whole app inherits.
2. **Tone over chrome.** Replace borders with space + a single hairline; remove left-accent lines;
   demote chips; lead with typography.
3. **One palette.** All semantic color flows from tokens (`ds-sev-*`, `ds-pill-*`, gain/loss). Zero
   raw hex in components.
4. **Deplyze-native copy.** All vendor/infra/V-phase/cache/backend wording routed through neutral
   labels or removed. The user sees research language, never operations language.
5. **Preserve everything underneath.** No data contract, hook, route, API, or artifact kind changes.

---

## 8. Staged Remediation Plan (isolated, test-gated PRs)

Each stage is one PR, lint + tests green before push, presentation/copy only, fully reversible,
ordered lowest-risk-first. No data/route/API changes in any stage.

| Stage | PR scope | Type | Risk | Gate |
|---|---|---|---|---|
| **0** | This audit document | docs | none | merge first |
| **1** | **Terminology scrub** — route all source/provider strings through `providerLabels`; remove `source_tables` from UI; humanize `FreshnessBadge` (CACHED→"Updated", STALE→"Refreshing", ERROR→"Unavailable"); de-phase `V3 Phase 2`/pipeline/backend copy; retire "Model Observatory"; delete the duplicate provider list in `Settings.tsx` | copy | low | lint + `npm test` |
| **2** | **Palette neutralization** — replace the 94 off-palette hexes with `ds-sev-*` / token colors via a shared `severityTone()`/`domainTone()` helper; remove the 19 `borderLeft` accent lines | presentation | low | lint + test |
| **3** | **Shared Surface/Panel primitive** — wrap `ds-surface`/`ds-panel` in `<Surface>`/`<Panel>`; adopt in the highest-border pages first (Backtesting, Portfolio Overview, Holdings); soften internal dividers to whitespace | presentation | low-med | lint + test + visual pass |
| **4** | **Unified feed/observation primitive** — one `ObservationRow`; converge `IntelligenceObservationCard`, `ContextualReasoningCard`, `AgentIntelligenceFeed`, `IntelligenceFeed`, `IntelligenceSpotlight`; demote chips, kill micro-typography | presentation | med | lint + test + visual pass |
| **5** | **Typography rhythm** — convert remaining inline `fontSize` to `ds-*`; normalize heading weight/casing in shared headers | presentation | low | lint + test |
| **6** | **Badge/chip + status consolidation** — single badge surface (`ds-badge`+`ds-pill-*`); rename V-phase component files (`V3P2*`→neutral) with no behavior change | presentation/refactor | low | lint + test |

Stage N does not begin until N-1 is green and merged. Stages 1–2 are pure scrub/neutralize (highest
ROI, lowest risk) and ship first.

---

## 9. Preservation Checklist (must hold across all stages)

- [ ] All intelligence systems (terminal, drawers, side panels, feeds, artifact kinds)
- [ ] All backend integrations, gateway routes, hooks, SWR cache keys, data contracts
- [ ] Portfolio systems (6 sub-pages + Awareness + simulated portfolio engine)
- [ ] Historical intelligence engines + artifact kinds
- [ ] Copilot direction (embedded-first, context-aware, tone-aware)
- [ ] Agentic layer (background agents as a *product* concept retained; ops framing removed)
- [ ] Every route, redirect, and deep target

> Environment note: this WSL sandbox cannot run vite/build/tsx/vitest. Test gate per stage is
> `npm run lint` + `tsc` typecheck (+ `node --test` where unit tests exist), per the recorded
> `env_dev_server` constraint.
