/**
 * useHistoricalResearch — agentic state machine for the Historical Research workspace.
 *
 * Exposes a four-step trace (plan → retrieve → compute → reason) with per-step
 * timing, substeps (per-asset retrieval), and micro-narration detail strings.
 * The UI renders the trace verbatim; this hook owns timing and observation
 * generation. Numbers are computed here; the LLM only writes prose at /reason.
 */

import { useCallback, useRef, useState } from 'react';
import { fetchOHLCV } from '../services/marketService';
import {
  planResearch,
  reasonOverObservations,
  type ResearchPlan,
  type ResearchObservation,
} from '../services/historicalResearchService';
import type { OHLCVBar } from '../types';
import { closes, rebase100 } from '../lib/quant/returns';
import { rollingPearson, alignClosesByTs, pearson } from '../lib/quant/correlation';
import { computeRichAnalytics, computeRegimeMetrics, type RichAnalytics, type RegimeMetrics } from '../lib/historicalResearchAnalytics';

// ─── Public types ─────────────────────────────────────────────────────────

export type StepId = 'plan' | 'retrieve' | 'compute' | 'reason';
export type StepState = 'pending' | 'active' | 'done' | 'failed';

export interface ProgressSubstep {
  key: string;
  label: string;
  done: boolean;
  failed?: boolean;
}

export interface ProgressStep {
  id: StepId;
  label: string;
  state: StepState;
  startedAt?: number;
  endedAt?: number;
  detail?: string;
  substeps?: ProgressSubstep[];
  error?: string;
}

export interface AssetSeries {
  symbol: string;
  bars: OHLCVBar[];
  normalized: { ts: number; v: number }[];
}

export interface RollingCorrelation {
  a: string;
  b: string;
  window: number;
  series: { ts: number; r: number }[];
  overall: number;
}

export interface ResearchResult {
  query: string;
  plan: ResearchPlan;
  assets: AssetSeries[];
  rollingCorrelations: RollingCorrelation[];
  drawdowns: { symbol: string; maxDrawdown: number }[];
  totals: { symbol: string; totalReturn: number }[];
  observations: ResearchObservation[];
  narrative: string;
  dataWindow: {
    requestedStart: string | null;
    requestedEnd: string | null;
    actualStart: string;
    actualEnd: string;
    requestedYears: number;
    actualYears: number;
    shortfall: boolean;
  };
  steps: ProgressStep[];          // immortalized trace
  totalElapsedMs: number;
  completedAt: number;
  analytics: RichAnalytics;
  regimeMetrics: RegimeMetrics[];
  /** Mutable follow-up Q&A thread (populated by the page). */
  followups?: { id: string; question: string; answer: string; ts: number }[];
}

const ROLL_WINDOW = 60;
const DEFAULT_BARS_PER_YEAR = 252;
const PROVIDER_MAX_BARS = 5000;

const INITIAL_STEPS: ProgressStep[] = [
  { id: 'plan',     label: 'Resolving intent',          state: 'pending' },
  { id: 'retrieve', label: 'Fetching price history',    state: 'pending' },
  { id: 'compute',  label: 'Computing relationships',   state: 'pending' },
  { id: 'reason',   label: 'Reasoning over evidence',   state: 'pending' },
];

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useHistoricalResearch() {
  const [steps, setSteps] = useState<ProgressStep[]>(INITIAL_STEPS);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const update = useCallback((id: StepId, patch: Partial<ProgressStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const start = useCallback((id: StepId) => {
    update(id, { state: 'active', startedAt: performance.now() });
  }, [update]);

  const finish = useCallback((id: StepId, patch: Partial<ProgressStep> = {}) => {
    setSteps((prev) => prev.map((s) =>
      s.id === id
        ? { ...s, ...patch, state: 'done', endedAt: performance.now() }
        : s,
    ));
  }, []);

  const fail = useCallback((id: StepId, err: string) => {
    setSteps((prev) => prev.map((s) =>
      s.id === id
        ? { ...s, state: 'failed', endedAt: performance.now(), error: err }
        : s,
    ));
  }, []);

  const run = useCallback(async (query: string, opts?: { plan?: ResearchPlan }) => {
    const my = ++seq.current;
    setError(null);
    setResult(null);
    setBusy(true);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s }))); // fresh copies

    try {
      // ── 1. Plan ────────────────────────────────────────────────────────
      let plan: ResearchPlan;
      if (opts?.plan) {
        // User-supplied plan from the Refine panel — skip the LLM call but
        // still annotate the trace so the user sees how the run began.
        if (opts.plan.assets.length === 0) {
          const now = performance.now();
          setSteps((prev) => prev.map((s) =>
            s.id === 'plan' ? { ...s, state: 'failed', startedAt: now, endedAt: now, error: 'no assets supplied' } : s,
          ));
          setError('Refine panel had no assets. Add at least one ticker and re-apply.');
          setBusy(false);
          return;
        }
        plan = {
          ...opts.plan,
          comparisons: ensureComparisons(opts.plan.comparisons, opts.plan.assets.length),
        };
        const now = performance.now();
        setSteps((prev) => prev.map((s) =>
          s.id === 'plan'
            ? { ...s, state: 'done', startedAt: now, endedAt: now, detail: `${planSummary(plan)} · user-refined` }
            : s,
        ));
      } else {
        start('plan');
        const rawPlan = await planResearch(query);
        if (my !== seq.current) return;
        if (rawPlan.assets.length === 0) {
          fail('plan', 'no assets resolved');
          setError('Planner did not resolve any assets. Try naming a ticker or asset class explicitly.');
          setBusy(false);
          return;
        }
        plan = {
          ...rawPlan,
          comparisons: ensureComparisons(rawPlan.comparisons, rawPlan.assets.length),
        };
        finish('plan', { detail: planSummary(plan) });
      }

      // ── 2. Retrieve ────────────────────────────────────────────────────
      const symbols = dedupe([...plan.assets, ...(plan.benchmark ? [plan.benchmark] : [])]);
      const requestedYears = effectiveYears(plan.timeframe);
      const outputsize = Math.min(
        PROVIDER_MAX_BARS,
        Math.max(60, requestedYears * DEFAULT_BARS_PER_YEAR),
      );

      setSteps((prev) => prev.map((s) =>
        s.id === 'retrieve'
          ? {
              ...s,
              state: 'active',
              startedAt: performance.now(),
              substeps: symbols.map((sym) => ({ key: sym, label: sym, done: false })),
            }
          : s,
      ));

      const bars = await Promise.all(symbols.map(async (sym) => {
        try {
          const r = await fetchOHLCV(sym, '1day', outputsize);
          setSteps((prev) => prev.map((s) =>
            s.id === 'retrieve' && s.substeps
              ? {
                  ...s,
                  substeps: s.substeps.map((ss) =>
                    ss.key === sym ? { ...ss, done: true, label: `${sym} · ${r.bars.length.toLocaleString()} bars` } : ss,
                  ),
                }
              : s,
          ));
          return { symbol: sym, bars: r.bars };
        } catch {
          setSteps((prev) => prev.map((s) =>
            s.id === 'retrieve' && s.substeps
              ? {
                  ...s,
                  substeps: s.substeps.map((ss) =>
                    ss.key === sym ? { ...ss, done: true, failed: true, label: `${sym} · unavailable` } : ss,
                  ),
                }
              : s,
          ));
          return { symbol: sym, bars: [] as OHLCVBar[] };
        }
      }));
      if (my !== seq.current) return;

      const usable = bars.filter((b) => b.bars.length > 20);
      if (usable.length === 0) {
        fail('retrieve', 'no usable history');
        setError('No usable historical data returned for the requested assets.');
        setBusy(false);
        return;
      }
      finish('retrieve', {
        detail: `${usable.length}/${symbols.length} assets · up to ${outputsize.toLocaleString()} bars each`,
      });

      // ── 3. Compute ─────────────────────────────────────────────────────
      start('compute');

      const assetSeries: AssetSeries[] = usable.map(({ symbol, bars }) => {
        const c = closes(bars);
        const norm = rebase100(c);
        return {
          symbol,
          bars,
          normalized: bars.map((b, i) => ({ ts: b.ts, v: norm[i] })),
        };
      });

      const rollingCorrelations: RollingCorrelation[] = [];
      if (plan.comparisons.includes('rolling_correlation') && plan.assets.length >= 2) {
        const primary = usable.find((u) => u.symbol === plan.assets[0]);
        for (const other of plan.assets.slice(1)) {
          const right = usable.find((u) => u.symbol === other);
          if (!primary || !right) continue;
          const aligned = alignClosesByTs(primary.bars, right.bars);
          const retA = pctReturns(aligned.a);
          const retB = pctReturns(aligned.b);
          const ts = aligned.ts;
          const r = rollingPearson(retA, retB, ROLL_WINDOW);
          const series = r.map((v, i) => ({
            ts: ts[i + ROLL_WINDOW] ?? ts[ts.length - 1],
            r: v,
          })).filter((p) => Number.isFinite(p.r));
          rollingCorrelations.push({
            a: primary.symbol,
            b: right.symbol,
            window: ROLL_WINDOW,
            series,
            overall: pearson(retA, retB),
          });
        }
      }

      // Rich analytics: performance summary, drawdown series, annual returns,
      // distributions, rolling vol, and correlation matrix (when ≥3 assets).
      const analytics = computeRichAnalytics(
        usable.map((u) => ({ symbol: u.symbol, bars: u.bars })),
      );

      // Regime metrics — sliced per named window the planner extracted.
      const regimeMetrics = computeRegimeMetrics(
        usable.map((u) => ({ symbol: u.symbol, bars: u.bars })),
        plan.regimes ?? [],
      );

      const drawdowns = analytics.drawdowns.map((d) => ({
        symbol: d.symbol,
        maxDrawdown: d.deepest.dd,
      }));
      const totals = assetSeries.map((a) => {
        const c = closes(a.bars);
        return { symbol: a.symbol, totalReturn: c.length > 1 ? c[c.length - 1] / c[0] - 1 : 0 };
      });

      const period = formatPeriod(assetSeries[0].bars);
      const earliestTs = Math.min(...assetSeries.map((a) => a.bars[0]?.ts ?? Infinity));
      const latestTs   = Math.max(...assetSeries.map((a) => a.bars[a.bars.length - 1]?.ts ?? 0));
      const actualYears = Math.max(0, (latestTs - earliestTs) / (365.25 * 86400_000));
      const shortfall = actualYears + 0.5 < requestedYears;
      const dataWindow = {
        requestedStart: plan.timeframe.start,
        requestedEnd:   plan.timeframe.end,
        actualStart:    isoDate(earliestTs),
        actualEnd:      isoDate(latestTs),
        requestedYears,
        actualYears,
        shortfall,
      };

      const dataWindowObs: ResearchObservation[] = shortfall ? [{
        label: 'Data coverage note',
        value: `requested ~${requestedYears}y, actual ${actualYears.toFixed(1)}y (${dataWindow.actualStart} → ${dataWindow.actualEnd})`,
      }] : [];

      // Regime-conditioned observations come FIRST so the reasoning model
      // anchors on them. Each row's `period` carries the regime label so the
      // narrative can address each window by name.
      const regimeObs: ResearchObservation[] = regimeMetrics.flatMap((rm) => {
        if (rm.insufficient) {
          return [{
            label: `${rm.spec.label} · data coverage`,
            value: 'insufficient bars in window',
            period: `${rm.spec.start} → ${rm.spec.end}`,
          }];
        }
        const winLabel = `${rm.spec.label}`;
        const rows: ResearchObservation[] = [];
        for (const a of rm.perAsset) {
          if (a.bars < 5) continue;
          rows.push({ label: `[${winLabel}] ${a.symbol} total return`, value: pct(a.totalReturn), period: `${rm.spec.start} → ${rm.spec.end}` });
          rows.push({ label: `[${winLabel}] ${a.symbol} max drawdown`,  value: pct(a.maxDrawdown), period: `${rm.spec.start} → ${rm.spec.end}` });
          rows.push({ label: `[${winLabel}] ${a.symbol} ann. vol`,       value: pct(a.annVol),       period: `${rm.spec.start} → ${rm.spec.end}` });
        }
        for (const p of rm.pairwiseCorrelations) {
          rows.push({ label: `[${winLabel}] ${p.a}/${p.b} correlation`, value: p.r.toFixed(2), period: `${rm.spec.start} → ${rm.spec.end}` });
        }
        return rows;
      });

      const observations: ResearchObservation[] = [
        ...dataWindowObs,
        ...regimeObs,
        ...totals.map((t) => ({ label: `${t.symbol} total return`, value: pct(t.totalReturn), period })),
        ...drawdowns.map((d) => ({ label: `${d.symbol} max drawdown`, value: pct(d.maxDrawdown), period })),
        ...rollingCorrelations.map((rc) => ({
          label: `${rc.a}/${rc.b} ${rc.window}-bar correlation (full window)`,
          value: rc.overall.toFixed(2),
          period,
        })),
        ...rollingCorrelations.flatMap((rc) => {
          if (rc.series.length === 0) return [];
          const last = rc.series[rc.series.length - 1];
          const min = rc.series.reduce((m, p) => (p.r < m.r ? p : m), rc.series[0]);
          const max = rc.series.reduce((m, p) => (p.r > m.r ? p : m), rc.series[0]);
          return [
            { label: `${rc.a}/${rc.b} latest rolling correlation`, value: last.r.toFixed(2), period: tsLabel(last.ts) },
            { label: `${rc.a}/${rc.b} rolling correlation range`, value: `${min.r.toFixed(2)} → ${max.r.toFixed(2)}`, period },
          ];
        }),
      ];

      const computeDetail = computeSummary({
        assetSeries, rollingCorrelations, observations,
      });
      finish('compute', { detail: computeDetail });

      // ── 4. Reason ──────────────────────────────────────────────────────
      start('reason');
      let narrative = '';
      try {
        narrative = await reasonOverObservations({ query, plan, observations });
        if (my !== seq.current) return;
        finish('reason', { detail: `${observations.length} observations · ${narrative.split(/\s+/).length} words` });
      } catch (e) {
        if (my !== seq.current) return;
        fail('reason', e instanceof Error ? e.message : String(e));
        narrative = 'Narrative unavailable. Inspect the observations directly.';
      }

      // ── Done ────────────────────────────────────────────────────────────
      // Grab the final steps snapshot so the result freezes the trace.
      setSteps((prev) => {
        const totalElapsedMs = totalElapsed(prev);
        setResult({
          query,
          plan,
          assets: assetSeries,
          rollingCorrelations,
          drawdowns,
          totals,
          observations,
          narrative,
          dataWindow,
          steps: prev.map((s) => ({ ...s })),
          totalElapsedMs,
          completedAt: Date.now(),
          analytics,
          regimeMetrics,
          followups: [],
        });
        return prev;
      });
      setBusy(false);
    } catch (e) {
      if (my !== seq.current) return;
      setError(e instanceof Error ? e.message : String(e));
      // Mark the currently-active step as failed for the trace.
      setSteps((prev) => prev.map((s) =>
        s.state === 'active'
          ? { ...s, state: 'failed', endedAt: performance.now(), error: e instanceof Error ? e.message : String(e) }
          : s,
      ));
      setBusy(false);
    }
  }, [start, finish, fail]);

  const reset = useCallback(() => {
    seq.current++;
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    setResult(null);
    setError(null);
    setBusy(false);
  }, []);

  const hydrate = useCallback((r: ResearchResult) => {
    seq.current++;
    setBusy(false);
    setError(null);
    setSteps(r.steps.map((s) => ({ ...s })));
    setResult(r);
  }, []);

  return { steps, busy, result, error, run, reset, hydrate };
}

// ─── helpers ──────────────────────────────────────────────────────────────

function dedupe(xs: string[]): string[] { return Array.from(new Set(xs.filter(Boolean))); }

function pctReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    out.push(prev > 0 ? values[i] / prev - 1 : 0);
  }
  return out;
}

function pct(x: number): string { return `${(x * 100).toFixed(1)}%`; }

function formatPeriod(bars: OHLCVBar[]): string {
  if (!bars.length) return '';
  return `${tsLabel(bars[0].ts)} → ${tsLabel(bars[bars.length - 1].ts)}`;
}

function tsLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isoDate(ts: number): string {
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toISOString().slice(0, 10);
}

function ensureComparisons(c: ResearchPlan['comparisons'], assetCount: number): ResearchPlan['comparisons'] {
  const set = new Set(c);
  if (assetCount >= 2) {
    set.add('normalized');
    set.add('rolling_correlation');
  } else {
    set.add('normalized');
  }
  return Array.from(set);
}

function effectiveYears(tf: ResearchPlan['timeframe']): number {
  if (tf.start && tf.end) {
    const a = Date.parse(tf.start);
    const b = Date.parse(tf.end);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      const y = (b - a) / (365.25 * 86400_000);
      return Math.max(1, Math.round(y));
    }
  }
  return Math.max(1, tf.lookbackYears || 10);
}

function planSummary(p: ResearchPlan): string {
  const win = p.timeframe.start && p.timeframe.end
    ? `${p.timeframe.start} → ${p.timeframe.end}`
    : `${p.timeframe.lookbackYears}Y`;
  return `${prettyIntent(p.intent)} · ${p.assets.join(' ')} · ${win}`;
}

function prettyIntent(i: ResearchPlan['intent']): string {
  switch (i) {
    case 'compare':              return 'compare';
    case 'regime_behavior':      return 'regime behavior';
    case 'relationship':         return 'relationship';
    case 'single_asset_history': return 'single asset';
    case 'anomaly_search':       return 'anomaly search';
    default:                     return String(i);
  }
}

function computeSummary(input: {
  assetSeries: AssetSeries[];
  rollingCorrelations: RollingCorrelation[];
  observations: ResearchObservation[];
}): string {
  const parts: string[] = [];
  if (input.assetSeries.length) parts.push(`${input.assetSeries.length} series · perf, DD, dist, vol`);
  if (input.rollingCorrelations.length) {
    const overlaps = input.rollingCorrelations
      .map((rc) => rc.series.length)
      .filter((n) => n > 0);
    if (overlaps.length) {
      const min = Math.min(...overlaps);
      parts.push(`rolling ${ROLL_WINDOW}-bar corr · ${min.toLocaleString()} bars`);
    }
  }
  parts.push(`${input.observations.length} observations`);
  return parts.join(' · ');
}

function totalElapsed(steps: ProgressStep[]): number {
  let total = 0;
  for (const s of steps) {
    if (s.startedAt != null && s.endedAt != null) total += s.endedAt - s.startedAt;
  }
  return total;
}
