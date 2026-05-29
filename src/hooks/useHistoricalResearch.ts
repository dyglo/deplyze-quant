/**
 * useHistoricalResearch — agentic state machine for the Historical Research workspace.
 *
 * Exposes a four-step trace (plan → retrieve → compute → reason) with per-step
 * timing and a streaming log of action + narrative entries that drives the
 * reasoning trace UI.
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

/** A single entry in a step's live reasoning log. */
export interface LogEntry {
  /** action = structured log line with a prefix glyph; narrative = inner monologue prose. */
  type: 'action' | 'narrative';
  text: string;
  /** Only for type='action'. */
  prefix?: '→' | '✓' | '✗';
}

export interface ProgressStep {
  id: StepId;
  label: string;
  state: StepState;
  startedAt?: number;
  endedAt?: number;
  detail?: string;
  log?: LogEntry[];
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
  steps: ProgressStep[];
  totalElapsedMs: number;
  completedAt: number;
  analytics: RichAnalytics;
  regimeMetrics: RegimeMetrics[];
  followups?: { id: string; question: string; answer: string; ts: number }[];
}

const PROVIDER_MAX_BARS = 5000;
// Switch to weekly bars when the range exceeds this many years so we stay
// within the gateway's 5 000-bar cap (5000 ÷ 252 ≈ 19.8 years daily).
const WEEKLY_THRESHOLD_YEARS = 15;
const BARS_PER_YEAR_DAILY  = 252;
const BARS_PER_YEAR_WEEKLY =  52;
const ROLL_WINDOW_DAILY    =  60;   // ~3 months of trading days
const ROLL_WINDOW_WEEKLY   =  26;   // ~6 months of weeks

const INITIAL_STEPS: ProgressStep[] = [
  { id: 'plan',     label: 'Resolving intent',          state: 'pending', log: [] },
  { id: 'retrieve', label: 'Fetching price history',    state: 'pending', log: [] },
  { id: 'compute',  label: 'Computing relationships',   state: 'pending', log: [] },
  { id: 'reason',   label: 'Reasoning over evidence',   state: 'pending', log: [] },
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

  const appendLog = useCallback((id: StepId, entry: LogEntry) => {
    setSteps((prev) => prev.map((s) =>
      s.id === id ? { ...s, log: [...(s.log ?? []), entry] } : s,
    ));
  }, []);

  const run = useCallback(async (query: string, opts?: { plan?: ResearchPlan }) => {
    const my = ++seq.current;
    setError(null);
    setResult(null);
    setBusy(true);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, log: [] })));

    try {
      // ── 1. Plan ────────────────────────────────────────────────────────
      let plan: ResearchPlan;
      if (opts?.plan) {
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
        const win = planWindow(plan);
        const now = performance.now();
        setSteps((prev) => prev.map((s) =>
          s.id === 'plan'
            ? { ...s, state: 'done', startedAt: now, endedAt: now, detail: `${planSummary(plan)} · user-refined` }
            : s,
        ));
        appendLog('plan', { type: 'action', prefix: '✓', text: `${plan.assets.join(', ')} · ${prettyIntent(plan.intent)} · ${win} · user-defined` });
      } else {
        start('plan');
        appendLog('plan', { type: 'narrative', text: 'Parsing your query to identify assets and intent…' });
        const { plan: rawPlan, degraded: planDegraded } = await planResearch(query);
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
        finish('plan', { detail: planDegraded ? `${planSummary(plan)} · degraded` : planSummary(plan) });
        if (planDegraded) {
          // Institutional transparency: the LLM planner was unavailable, so we
          // derived the plan locally. The investigation still proceeds.
          appendLog('plan', { type: 'action', prefix: '✓', text: 'planner offline — derived plan locally from your query' });
        }
        appendLog('plan', { type: 'narrative', text: `Resolved ${plan.assets.join(', ')} — ${prettyIntent(plan.intent)} over ${planWindow(plan)}.` });
      }

      // ── 2. Retrieve ────────────────────────────────────────────────────
      const symbols = dedupe([...plan.assets, ...(plan.benchmark ? [plan.benchmark] : [])]);
      const requestedYears = effectiveYears(plan.timeframe);

      // Long ranges (> 15 Y) switch to weekly bars so we stay within the
      // gateway's 5 000-bar hard cap (5 000 daily ≈ 19.8 Y; 5 000 weekly ≈ 96 Y).
      const useWeekly  = requestedYears > WEEKLY_THRESHOLD_YEARS;
      const interval   = useWeekly ? '1week' : '1day' as const;
      const barsPerYear = useWeekly ? BARS_PER_YEAR_WEEKLY : BARS_PER_YEAR_DAILY;
      const rollWindow  = useWeekly ? ROLL_WINDOW_WEEKLY   : ROLL_WINDOW_DAILY;
      const outputsize = Math.min(
        PROVIDER_MAX_BARS,
        Math.max(60, Math.ceil(requestedYears * barsPerYear)),
      );

      start('retrieve');
      appendLog('retrieve', { type: 'narrative', text: `Let me fetch OHLCV price history for ${symbols.join(', ')}.` });

      const barLabel = useWeekly ? 'weekly' : 'daily';

      // Pre-emit all "→ requesting" entries before any fetch starts (sync).
      for (const sym of symbols) {
        appendLog('retrieve', { type: 'action', prefix: '→', text: `${sym}: requesting ${requestedYears}Y ${barLabel} bars` });
      }

      let fetchedCount = 0;
      const bars = await Promise.all(symbols.map(async (sym) => {
        try {
          const r = await fetchOHLCV(sym, interval, outputsize);
          fetchedCount++;
          appendLog('retrieve', { type: 'action', prefix: '✓', text: `${sym}: ${r.bars.length.toLocaleString()} bars received` });
          if (fetchedCount < symbols.length) {
            const remaining = symbols.length - fetchedCount;
            appendLog('retrieve', { type: 'narrative', text: `${sym} complete — ${remaining} more ${remaining === 1 ? 'asset' : 'assets'} to go…` });
          } else {
            appendLog('retrieve', { type: 'narrative', text: `All ${symbols.length} assets retrieved. Moving to analytics.` });
          }
          return { symbol: sym, bars: r.bars };
        } catch {
          appendLog('retrieve', { type: 'action', prefix: '✗', text: `${sym}: unavailable — skipping` });
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
      appendLog('compute', { type: 'narrative', text: `Running analytics on ${usable.length} asset${usable.length === 1 ? '' : 's'}…` });

      const assetSeries: AssetSeries[] = usable.map(({ symbol, bars }) => {
        const c = closes(bars);
        const norm = rebase100(c);
        return {
          symbol,
          bars,
          normalized: bars.map((b, i) => ({ ts: b.ts, v: norm[i] })),
        };
      });
      appendLog('compute', { type: 'action', prefix: '✓', text: `normalized price series · ${assetSeries.length} asset${assetSeries.length === 1 ? '' : 's'}` });

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
          const r = rollingPearson(retA, retB, rollWindow);
          const series = r.map((v, i) => ({
            ts: ts[i + rollWindow] ?? ts[ts.length - 1],
            r: v,
          })).filter((p) => Number.isFinite(p.r));
          const overall = pearson(retA, retB);
          rollingCorrelations.push({
            a: primary.symbol,
            b: right.symbol,
            window: rollWindow,
            series,
            overall,
          });
          appendLog('compute', { type: 'action', prefix: '✓', text: `${primary.symbol}/${right.symbol} rolling correlation · r=${overall.toFixed(2)}` });
          const corrDesc = overall > 0.6 ? 'strong positive' : overall > 0.3 ? 'moderate positive' : overall < -0.3 ? 'negative' : 'low';
          appendLog('compute', { type: 'narrative', text: `${primary.symbol} and ${right.symbol} show ${corrDesc} correlation (${overall.toFixed(2)}) over the full window.` });
        }
      }

      const analytics = computeRichAnalytics(
        usable.map((u) => ({ symbol: u.symbol, bars: u.bars })),
      );
      appendLog('compute', { type: 'action', prefix: '✓', text: `performance metrics · drawdowns · annual returns · distributions` });

      const regimeMetrics = computeRegimeMetrics(
        usable.map((u) => ({ symbol: u.symbol, bars: u.bars })),
        plan.regimes ?? [],
      );
      if (regimeMetrics.length > 0) {
        appendLog('compute', { type: 'action', prefix: '✓', text: `${regimeMetrics.length} regime window${regimeMetrics.length === 1 ? '' : 's'} analyzed` });
      }

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

      // ── Performance rows (CAGR, Sharpe, Sortino, Calmar, vol, skew, kurtosis)
      const perfObs: ResearchObservation[] = analytics.performance.flatMap((p) => [
        { label: `${p.symbol} CAGR`,          value: pct(p.cagr),          period },
        { label: `${p.symbol} ann. vol`,       value: pct(p.annVol),        period },
        { label: `${p.symbol} Sharpe`,         value: p.sharpe.toFixed(2),  period },
        { label: `${p.symbol} Sortino`,        value: p.sortino.toFixed(2), period },
        { label: `${p.symbol} Calmar`,         value: p.calmar.toFixed(2),  period },
        { label: `${p.symbol} skewness`,       value: p.skew.toFixed(2),    period },
        { label: `${p.symbol} excess kurtosis`, value: p.kurtosis.toFixed(2), period },
        { label: `${p.symbol} data window`,    value: `${isoDate(p.startTs)} → ${isoDate(p.endTs)}`, period },
        { label: `${p.symbol} bar count`,      value: p.bars,               period },
      ]);

      // ── Drawdown details — magnitude + dates + duration for every asset
      const drawdownObs: ResearchObservation[] = analytics.drawdowns.flatMap((d) => {
        const rows: ResearchObservation[] = [
          { label: `${d.symbol} max drawdown`,          value: pct(d.deepest.dd),       period },
          { label: `${d.symbol} drawdown peak date`,    value: isoDate(d.deepest.peakTs),  period },
          { label: `${d.symbol} drawdown trough date`,  value: isoDate(d.deepest.troughTs), period },
          { label: `${d.symbol} drawdown duration`,     value: `${d.deepest.durationDays} days`, period },
          { label: `${d.symbol} drawdown days peak→trough`, value: `${d.deepest.drawdownDays} days`, period },
          { label: `${d.symbol} current drawdown`,      value: pct(d.current),          period },
        ];
        if (d.deepest.recoveredTs != null) {
          rows.push({ label: `${d.symbol} drawdown recovery date`, value: isoDate(d.deepest.recoveredTs), period });
        } else {
          rows.push({ label: `${d.symbol} drawdown recovery`, value: 'not yet recovered', period });
        }
        return rows;
      });

      // ── Annual returns — one row per year × symbol
      const annualObs: ResearchObservation[] = analytics.annualReturns.flatMap((row) =>
        Object.entries(row.perAsset)
          .filter(([, v]) => v != null)
          .map(([sym, v]) => ({ label: `${sym} ${row.year} annual return`, value: pct(v as number), period: String(row.year) })),
      );

      // ── Return distribution — mean, std, min, max daily return
      const distObs: ResearchObservation[] = analytics.distributions.flatMap((d) => [
        { label: `${d.symbol} mean daily return`, value: pct(d.mean),  period },
        { label: `${d.symbol} daily return std`,  value: pct(d.std),   period },
        { label: `${d.symbol} best daily return`, value: pct(d.max),   period },
        { label: `${d.symbol} worst daily return`, value: pct(d.min),  period },
      ]);

      // ── Rolling vol — current, min, max
      const volObs: ResearchObservation[] = analytics.rollingVols.flatMap((rv) => {
        if (rv.series.length === 0) return [];
        const vols = rv.series.map((p) => p.vol);
        const minV = Math.min(...vols);
        const maxV = Math.max(...vols);
        const curV = vols[vols.length - 1];
        return [
          { label: `${rv.symbol} current rolling vol`, value: pct(curV), period },
          { label: `${rv.symbol} rolling vol range`,   value: `${pct(minV)} → ${pct(maxV)}`, period },
        ];
      });

      // ── Correlation matrix
      const corrMatrixObs: ResearchObservation[] = (() => {
        const cm = analytics.corrMatrix;
        if (!cm) return [];
        const rows: ResearchObservation[] = [];
        for (let i = 0; i < cm.symbols.length; i++) {
          for (let j = i + 1; j < cm.symbols.length; j++) {
            rows.push({
              label: `${cm.symbols[i]}/${cm.symbols[j]} full-period correlation`,
              value: cm.matrix[i][j].toFixed(2),
              period,
            });
          }
        }
        return rows;
      })();

      const observations: ResearchObservation[] = [
        ...dataWindowObs,
        ...regimeObs,
        ...perfObs,
        ...drawdownObs,
        ...annualObs,
        ...distObs,
        ...volObs,
        ...corrMatrixObs,
        ...totals.map((t) => ({ label: `${t.symbol} total return`, value: pct(t.totalReturn), period })),
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

      if (shortfall) {
        appendLog('compute', { type: 'narrative', text: `Note: only ${actualYears.toFixed(1)}Y of data available — ${requestedYears}Y was requested.` });
      }
      appendLog('compute', { type: 'narrative', text: `Compiled ${observations.length} observation${observations.length === 1 ? '' : 's'}. Handing off to reasoning.` });

      const computeDetail = computeSummary({ assetSeries, rollingCorrelations, observations, rollWindow });
      finish('compute', { detail: computeDetail });

      // ── 4. Reason ──────────────────────────────────────────────────────
      start('reason');
      appendLog('reason', { type: 'narrative', text: `Reviewing ${observations.length} observation${observations.length === 1 ? '' : 's'} to write a grounded narrative…` });

      let narrative = '';
      try {
        narrative = await reasonOverObservations({ query, plan, observations });
        if (my !== seq.current) return;
        const wordCount = narrative.split(/\s+/).filter(Boolean).length;
        finish('reason', { detail: `${observations.length} observations · ${wordCount} words` });
        appendLog('reason', { type: 'action', prefix: '✓', text: `${observations.length} observations synthesized · ${wordCount} words written` });
        appendLog('reason', { type: 'narrative', text: 'Investigation complete.' });
      } catch (e) {
        if (my !== seq.current) return;
        fail('reason', e instanceof Error ? e.message : String(e));
        narrative = 'Narrative unavailable. Inspect the observations directly.';
      }

      // ── Done ────────────────────────────────────────────────────────────
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
      setSteps((prev) => prev.map((s) =>
        s.state === 'active'
          ? { ...s, state: 'failed', endedAt: performance.now(), error: e instanceof Error ? e.message : String(e) }
          : s,
      ));
      setBusy(false);
    }
  }, [start, finish, fail, appendLog]);

  const reset = useCallback(() => {
    seq.current++;
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, log: [] })));
    setResult(null);
    setError(null);
    setBusy(false);
  }, []);

  const hydrate = useCallback((r: ResearchResult) => {
    seq.current++;
    setBusy(false);
    setError(null);
    setSteps(r.steps.length > 0 ? r.steps.map((s) => ({ ...s })) : INITIAL_STEPS.map((s) => ({ ...s, log: [] })));
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
  return `${prettyIntent(p.intent)} · ${p.assets.join(' ')} · ${planWindow(p)}`;
}

function planWindow(p: ResearchPlan): string {
  return p.timeframe.start && p.timeframe.end
    ? `${p.timeframe.start} → ${p.timeframe.end}`
    : `${p.timeframe.lookbackYears}Y`;
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
  rollWindow: number;
}): string {
  const parts: string[] = [];
  if (input.assetSeries.length) parts.push(`${input.assetSeries.length} series · perf, DD, dist, vol`);
  if (input.rollingCorrelations.length) {
    const overlaps = input.rollingCorrelations.map((rc) => rc.series.length).filter((n) => n > 0);
    if (overlaps.length) parts.push(`rolling ${input.rollWindow}-bar corr · ${Math.min(...overlaps).toLocaleString()} bars`);
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
