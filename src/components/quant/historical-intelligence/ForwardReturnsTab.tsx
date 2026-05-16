/**
 * ForwardReturnsTab — conditional forward-return distributions across the
 * standard 1 / 5 / 10 / 20 / 60-bar horizons.
 *
 * The user picks a trigger (current vol-percentile regime, extreme z-event,
 * unconditional baseline, or a recently-classified composite regime). For
 * each horizon we render a distribution tile (mean / median / win rate /
 * downside probability / IQR / 5-95 band / worst MAE / sample-size
 * confidence) plus a horizontal histogram of the sorted samples.
 */

import React, { useMemo, useState } from 'react';
import './ForwardReturnsTab.css';
import { BarChart3, Sparkles, MoreHorizontal } from 'lucide-react';
import { useOHLCV } from '../../../hooks/useMarket';
import {
  forwardReturnDistributions,
  unconditionalForwardDistributions,
  buildForwardReturnSamples,
  summariseForwardReturns,
  distributionConfidence,
  extremeConditionIndices,
  DEFAULT_HORIZONS,
  type ForwardReturnDistribution,
  rollingStdev,
  logReturns,
  closes,
  percentileRank,
} from '../../../lib/quant';
import { ConfidenceBadge } from '../ConfidenceBadge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../../ui/dropdown-menu';

type TriggerKey =
  | 'baseline'
  | 'vol_low'           // vol percentile ≤ 0.2
  | 'vol_high'          // vol percentile ≥ 0.8
  | 'positive_return_z' // return z ≥ +2
  | 'negative_return_z' // return z ≤ -2
  | 'trend_stretched'   // |trend deviation z| ≥ 2
  | 'drawdown_deep';    // drawdown percentile ≤ 0.1

const TRIGGERS: Array<{ key: TriggerKey; label: string; description: string }> = [
  { key: 'baseline',          label: 'Baseline',                description: 'All bars — unconditional history.' },
  { key: 'vol_low',           label: 'Vol compression',         description: 'Triggered when 21-bar realised vol is in the bottom 20% of its rolling history.' },
  { key: 'vol_high',          label: 'Vol expansion',           description: 'Triggered when 21-bar realised vol is in the top 20%.' },
  { key: 'positive_return_z', label: 'Positive return shock',   description: 'Triggered when the latest return z-score ≥ +2.' },
  { key: 'negative_return_z', label: 'Negative return shock',   description: 'Triggered when the latest return z-score ≤ −2.' },
  { key: 'trend_stretched',   label: 'Trend stretched',         description: 'Triggered when price-vs-SMA50 z-score exceeds |2|.' },
  { key: 'drawdown_deep',     label: 'Deep drawdown',           description: 'Triggered when running drawdown sits in the historical bottom 10%.' },
];

export const ForwardReturnsTab: React.FC<{ symbol: string; historyBars?: number }> = ({ symbol, historyBars = 2520 }) => {
  const ohlcv = useOHLCV(symbol, '1day', historyBars);
  const bars = ohlcv.data?.bars ?? [];
  const [trigger, setTrigger] = useState<TriggerKey>('baseline');

  const result = useMemo(() => {
    if (bars.length < 250) return null;
    if (trigger === 'baseline') {
      return { indices: null, distributions: unconditionalForwardDistributions(bars) };
    }
    const indices = triggerIndices(bars, trigger);
    if (!indices.length) return { indices, distributions: [] as ForwardReturnDistribution[] };
    return { indices, distributions: forwardReturnDistributions(bars, indices) };
  }, [bars, trigger]);

  if (ohlcv.loading) return <Card label="Loading multi-year history…" />;
  if (!result) return <Card label={`Need ≥ 250 bars for distributional analysis. ${symbol} has ${bars.length}.`} />;

  const triggerMeta = TRIGGERS.find(t => t.key === trigger)!;

  return (
    <div className="frd-root">
      <header className="frd-header">
        <span className="frd-icon-wrap"><BarChart3 size={14} color="var(--primary)" /></span>
        <div>
          <h2 className="ds-heading frd-title">Forward return distributions · {symbol}</h2>
          <p className="ds-caption frd-subtitle">
            Conditional historical outcomes at 1 / 5 / 10 / 20 / 60-bar horizons. Probabilistic, never directional.
          </p>
        </div>
      </header>

      <section className="frd-card">
        <h3 className="ds-heading frd-trigger-heading">Trigger condition</h3>
        <div className="frd-trigger-row">
          {TRIGGERS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTrigger(t.key)}
              className="frd-trigger-pill"
              data-active={t.key === trigger ? '' : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="ds-caption frd-trigger-desc">
          <Sparkles size={10} className="frd-sparkles" />
          {triggerMeta.description}
          {result.indices && (
            <> — <strong className="frd-count">{result.indices.length}</strong> historical occurrences.</>
          )}
        </p>
      </section>

      {result.distributions.length === 0 ? (
        <Card label={`No historical bars matched "${triggerMeta.label}" for ${symbol}.`} />
      ) : (
        <>
          <ReturnFan distributions={result.distributions} trigger={triggerMeta.label} />
          <section className="frd-grid">
            {result.distributions.map((d) => (
              <DistributionCard key={d.horizon} dist={d} />
            ))}
          </section>
        </>
      )}
    </div>
  );
};

function triggerIndices(bars: ReturnType<typeof useOHLCV>['data'] extends infer T ? T extends { bars: infer B } ? B : never : never, trigger: TriggerKey): number[] {
  const arr = bars as Array<{ ts: number; close: number; volume: number }>;
  switch (trigger) {
    case 'positive_return_z':
      return extremeConditionIndices(arr as any, 'return_z', 2).filter(i => true);
    case 'negative_return_z': {
      // extremeConditionIndices returns |z| triggers — keep both tails and filter by sign.
      const cl = (arr as any[]).map(b => b.close);
      const lr = logReturns(cl);
      const out: number[] = [];
      const W = 21;
      for (let i = W; i < lr.length; i++) {
        const win = lr.slice(i - W, i);
        const m = win.reduce((a, x) => a + x, 0) / win.length;
        let v = 0; for (const x of win) v += (x - m) ** 2;
        const s = Math.sqrt(v / Math.max(1, win.length - 1)) || 1e-9;
        const z = (lr[i] - m) / s;
        if (z <= -2) out.push(i + 1);
      }
      return out;
    }
    case 'trend_stretched':
      return extremeConditionIndices(arr as any, 'trend_deviation_z', 2);
    case 'drawdown_deep':
      return extremeConditionIndices(arr as any, 'drawdown_pct', 0.9);
    case 'vol_low':
    case 'vol_high': {
      const cl = (arr as any[]).map(b => b.close);
      const lr = logReturns(cl);
      const rolling = rollingStdev(lr, 21);
      const out: number[] = [];
      for (let k = 30; k < rolling.length; k++) {
        const hist = rolling.slice(0, k);
        const pr = percentileRank(hist, rolling[k]);
        const isLow = pr <= 0.2;
        const isHigh = pr >= 0.8;
        if (trigger === 'vol_low' && isLow) out.push(k + 21);
        if (trigger === 'vol_high' && isHigh) out.push(k + 21);
      }
      return out;
    }
    case 'baseline':
      return [];
  }
}

type VizMode = 'histogram' | 'boxplot' | 'cdf' | 'band';

const VIZ_OPTIONS: { value: VizMode; label: string; description: string }[] = [
  { value: 'histogram', label: 'Histogram + Bell curve',  description: 'Binned frequency bars with normal PDF overlay' },
  { value: 'boxplot',   label: 'Box plot',                description: 'Min / p05 / p25 / median / p75 / p95 / max whiskers' },
  { value: 'cdf',       label: 'Cumulative distribution', description: 'CDF — probability of return ≤ x' },
  { value: 'band',      label: 'Percentile band',         description: 'Compact single-row percentile strip' },
];

const DistributionCard: React.FC<{ dist: ForwardReturnDistribution }> = ({ dist }) => {
  const positive = dist.mean >= 0;
  const conf = distributionConfidence(dist);
  const [vizMode, setVizMode] = useState<VizMode>('histogram');

  return (
    <div className="frd-dist-card">
      {/* header row */}
      <div className="frd-dist-header">
        <h4 className="frd-dist-title">+{dist.horizon}-bar forward</h4>
        <div className="frd-dist-actions">
          <ConfidenceBadge score={conf} />
          <DropdownMenu>
            <DropdownMenuTrigger
              className="frd-viz-btn"
              aria-label="Visualization options"
            >
              <MoreHorizontal size={13} />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" sideOffset={4}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Visualization</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={vizMode} onValueChange={v => setVizMode(v as VizMode)}>
                {VIZ_OPTIONS.map(opt => (
                  <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                    <div className="frd-viz-opt">
                      <span>{opt.label}</span>
                      <span className="frd-viz-opt-desc">{opt.description}</span>
                    </div>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* mean headline */}
      <div className="frd-mean-row">
        <span className="frd-mean-value" data-positive={positive ? '' : undefined}>
          {(dist.mean * 100).toFixed(2)}%
        </span>
        <span className="ds-caption frd-mean-label">mean</span>
        <span className="frd-mean-n">n = {dist.n}</span>
      </div>

      {/* viz switcher */}
      {vizMode === 'histogram' && <HistogramViz dist={dist} />}
      {vizMode === 'boxplot'   && <BoxPlotViz   dist={dist} />}
      {vizMode === 'cdf'       && <CdfViz        dist={dist} />}
      {vizMode === 'band'      && <BandViz        dist={dist} />}

      <div className="frd-stats-grid">
        <Stat label="Median" value={`${(dist.median * 100).toFixed(2)}%`} />
        <Stat label="Win rate" value={`${(dist.winRate * 100).toFixed(0)}%`} />
        <Stat label="Downside" value={`${(dist.downsideProbability * 100).toFixed(0)}%`} />
        <Stat label="Stdev" value={`${(dist.stdev * 100).toFixed(2)}%`} />
        <Stat label="IQR p25/p75" value={`${(dist.p25 * 100).toFixed(2)}% / ${(dist.p75 * 100).toFixed(2)}%`} />
        <Stat label="p05/p95" value={`${(dist.p05 * 100).toFixed(2)}% / ${(dist.p95 * 100).toFixed(2)}%`} />
        <Stat label="Worst MAE" value={`${(dist.worstMae * 100).toFixed(1)}%`} primary />
        <Stat label="Mean |MAE|" value={`${(dist.meanMaeAbs * 100).toFixed(1)}%`} />
      </div>
    </div>
  );
};

// ─── Forward-return fan chart ─────────────────────────────────────────────────

const ReturnFan: React.FC<{ distributions: ForwardReturnDistribution[]; trigger: string }> = ({ distributions, trigger }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (!distributions.length) return null;

  const W = 800, H = 180;
  const PAD = { top: 20, right: 48, bottom: 28, left: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  // x positions: evenly spaced across horizons
  const xs = distributions.map((_, i) => PAD.left + (i / Math.max(1, distributions.length - 1)) * innerW);

  // y scale: span all p05/p95 values + zero
  const allVals = distributions.flatMap(d => [d.p05, d.p95, d.mean, 0]);
  const yMin = Math.min(...allVals) * 1.15;
  const yMax = Math.max(...allVals) * 1.15 || 0.01;
  const ySpan = Math.max(0.001, yMax - yMin);
  const yOf = (v: number) => PAD.top + innerH - ((v - yMin) / ySpan) * innerH;
  const yZero = yOf(0);

  // SVG path helpers
  const pts = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xs[i].toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const band = (lo: number[], hi: number[]) => {
    const fwd = lo.map((v, i) => `${i === 0 ? 'M' : 'L'}${xs[i].toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
    const rev = [...hi].reverse().map((v, i) => `L${xs[hi.length - 1 - i].toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
    return `${fwd} ${rev} Z`;
  };

  const p05s  = distributions.map(d => d.p05);
  const p95s  = distributions.map(d => d.p95);
  const p25s  = distributions.map(d => d.p25);
  const p75s  = distributions.map(d => d.p75);
  const meds  = distributions.map(d => d.median);
  const means = distributions.map(d => d.mean);

  const hov = hoveredIdx !== null ? distributions[hoveredIdx] : null;

  // y-axis ticks: 5 evenly spaced
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = yMin + (i / 4) * ySpan;
    return { v, y: yOf(v), label: `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%` };
  });

  return (
    <div className="frd-card frd-fan-wrap">
      <div className="frd-fan-header">
        <span className="frd-fan-title">Forward-return fan</span>
        <span className="ds-caption frd-fan-caption">
          Outcomes spread across horizons under &ldquo;{trigger}&rdquo;
        </span>
      </div>
      <svg
        width="100%" viewBox={`0 0 ${W} ${H}`}
        className="frd-svg"
        aria-hidden
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {/* zero baseline */}
        {yMin < 0 && yMax > 0 && (
          <line x1={PAD.left} x2={W - PAD.right} y1={yZero} y2={yZero}
            stroke="var(--muted-foreground)" strokeWidth={0.75} strokeOpacity={0.4} strokeDasharray="4 3" />
        )}

        {/* y-axis gridlines */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={t.y} y2={t.y}
              stroke="var(--border)" strokeWidth={0.5} strokeOpacity={0.5} />
            <text x={W - PAD.right + 4} y={t.y + 3} fontSize={8} fill="var(--muted-foreground)"
              fontFamily="var(--font-mono, monospace)">{t.label}</text>
          </g>
        ))}

        {/* p05–p95 outer band */}
        <path d={band(p05s, p95s)}
          fill="color-mix(in srgb, var(--chart-2, #4a90d9) 15%, transparent)" />

        {/* p25–p75 IQR band */}
        <path d={band(p25s, p75s)}
          fill="color-mix(in srgb, var(--chart-2, #4a90d9) 32%, transparent)" />

        {/* median line */}
        <path d={pts(meds)} fill="none"
          stroke="var(--foreground)" strokeWidth={1.5} strokeOpacity={0.6} strokeDasharray="4 2" />

        {/* mean line */}
        <path d={pts(means)} fill="none"
          stroke="var(--chart-2, #4a90d9)" strokeWidth={2} />

        {/* mean dots + hover hit targets */}
        {distributions.map((d, i) => (
          <g key={i}>
            <circle cx={xs[i]} cy={yOf(d.mean)} r={hoveredIdx === i ? 5 : 3.5}
              fill="var(--chart-2, #4a90d9)" />
            {/* invisible hit area */}
            <rect
              x={xs[i] - 18} width={36} y={PAD.top} height={innerH}
              fill="transparent"
              className="frd-hist-bar"
              onMouseEnter={() => setHoveredIdx(i)}
            />
          </g>
        ))}

        {/* x-axis horizon labels */}
        {distributions.map((d, i) => (
          <g key={i}>
            <line x1={xs[i]} x2={xs[i]} y1={H - PAD.bottom} y2={H - PAD.bottom + 3}
              stroke="var(--muted-foreground)" strokeWidth={0.75} />
            <text x={xs[i]} y={H - PAD.bottom + 12} textAnchor="middle" fontSize={8.5}
              fontWeight={600} fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
              +{d.horizon}b
            </text>
            <text x={xs[i]} y={H - PAD.bottom + 22} textAnchor="middle" fontSize={7}
              fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
              n={d.n}
            </text>
          </g>
        ))}

        {/* hover tooltip */}
        {hov && hoveredIdx !== null && (
          <g>
            <line x1={xs[hoveredIdx]} x2={xs[hoveredIdx]} y1={PAD.top} y2={H - PAD.bottom}
              stroke="var(--foreground)" strokeWidth={0.75} strokeOpacity={0.35} />
            <rect
              x={Math.min(xs[hoveredIdx] + 6, W - PAD.right - 100)}
              width={96} y={PAD.top + 2} height={52} rx={5}
              fill="var(--popover)" stroke="var(--border)" strokeWidth={0.75}
            />
            {[
              `+${hov.horizon}-bar forward`,
              `mean  ${(hov.mean * 100).toFixed(2)}%`,
              `median  ${(hov.median * 100).toFixed(2)}%`,
              `p05/p95  ${(hov.p05 * 100).toFixed(1)}% / ${(hov.p95 * 100).toFixed(1)}%`,
            ].map((line, li) => (
              <text key={li}
                x={Math.min(xs[hoveredIdx] + 54, W - PAD.right - 52)}
                y={PAD.top + 13 + li * 11}
                textAnchor="middle" fontSize={li === 0 ? 8 : 7.5}
                fontWeight={li === 0 ? 700 : 400}
                fill={li === 0 ? 'var(--foreground)' : 'var(--muted-foreground)'}
                fontFamily="var(--font-mono, monospace)"
              >{line}</text>
            ))}
          </g>
        )}
      </svg>

      {/* legend */}
      <div className="frd-fan-legend">
        <span className="frd-fan-leg-item frd-fan-leg-mean">mean (μ)</span>
        <span className="frd-fan-leg-item frd-fan-leg-median">median</span>
        <span className="frd-fan-leg-item frd-fan-leg-iqr">p25 → p75 (IQR)</span>
        <span className="frd-fan-leg-item frd-fan-leg-outer">p05 → p95</span>
      </div>
    </div>
  );
};

// ─── shared helpers ──────────────────────────────────────────────────────────

function buildHistogramBins(rets: number[], BINS = 14) {
  const min = Math.min(...rets);
  const max = Math.max(...rets);
  const span = max - min || 1e-9;
  const step = span / BINS;
  const counts = Array(BINS).fill(0) as number[];
  for (const r of rets) counts[Math.min(BINS - 1, Math.floor((r - min) / step))]++;
  return { min, max, span, step, counts };
}

// ─── Histogram + bell curve ───────────────────────────────────────────────────

const HistogramViz: React.FC<{ dist: ForwardReturnDistribution }> = ({ dist }) => {
  const [hoveredBin, setHoveredBin] = useState<number | null>(null);
  if (!dist.samples.length) return null;

  const W = 220, H = 76;
  const rets = dist.samples.map(s => s.ret);
  const { min, max, span, step, counts } = buildHistogramBins(rets);
  const maxCount = Math.max(...counts, 1);

  const m = dist.mean;
  const s = dist.stdev || 1e-9;
  const normY = (x: number) =>
    (rets.length * step * (1 / (s * Math.sqrt(2 * Math.PI)))) *
    Math.exp(-0.5 * ((x - m) / s) ** 2);
  const scaleNorm = maxCount / (normY(m) || 1);

  const xOf = (v: number) => ((v - min) / span) * W;
  const CURVE_PTS = 80;
  const curvePath = Array.from({ length: CURVE_PTS + 1 }, (_, i) => {
    const x = min + (i / CURVE_PTS) * span;
    const y = H - 10 - (normY(x) * scaleNorm / maxCount) * (H - 14);
    return `${i === 0 ? 'M' : 'L'}${xOf(x).toFixed(1)},${Math.max(0, y).toFixed(1)}`;
  }).join(' ');

  const barW = W / counts.length;
  const accent = dist.mean >= 0 ? '#4E6040' : 'var(--primary)';

  const hov = hoveredBin !== null ? hoveredBin : null;
  const tooltip = hov !== null ? {
    lo: (min + hov * step) * 100,
    hi: (min + (hov + 1) * step) * 100,
    n: counts[hov],
    pct: ((counts[hov] / rets.length) * 100).toFixed(1),
    cx: Math.min(Math.max((hov + 0.5) * barW, 30), W - 30),
  } : null;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className="frd-svg"
      aria-hidden
    >
      {/* p05-p95 band */}
      <rect x={xOf(dist.p05)} width={Math.max(0, xOf(dist.p95) - xOf(dist.p05))} y={0} height={H - 10}
        fill={`color-mix(in srgb, ${accent} 8%, transparent)`} />
      {/* IQR band */}
      <rect x={xOf(dist.p25)} width={Math.max(0, xOf(dist.p75) - xOf(dist.p25))} y={0} height={H - 10}
        fill={`color-mix(in srgb, ${accent} 14%, transparent)`} />

      {/* bars */}
      {counts.map((c, i) => {
        const bh = (c / maxCount) * (H - 14);
        const isPos = (min + (i + 0.5) * step) >= 0;
        return (
          <rect
            key={i}
            x={i * barW + 1} width={barW - 2}
            y={H - 10 - bh} height={bh}
            rx={1}
            fill={isPos
              ? `color-mix(in srgb, #4E6040 ${hov === i ? 80 : 55}%, transparent)`
              : `color-mix(in srgb, var(--primary) ${hov === i ? 80 : 55}%, transparent)`}
            className="frd-hist-bar"
            onMouseEnter={() => setHoveredBin(i)}
            onMouseLeave={() => setHoveredBin(null)}
          />
        );
      })}

      {/* zero line */}
      {min < 0 && max > 0 && (
        <line x1={xOf(0)} x2={xOf(0)} y1={0} y2={H - 10}
          stroke="var(--muted-foreground)" strokeWidth={1} strokeOpacity={0.4} strokeDasharray="3 2" />
      )}
      {/* median */}
      <line x1={xOf(dist.median)} x2={xOf(dist.median)} y1={0} y2={H - 10}
        stroke={accent} strokeWidth={1.5} strokeOpacity={0.7} strokeDasharray="3 2" />

      {/* bell curve */}
      <path d={curvePath} fill="none" stroke="var(--foreground)" strokeWidth={1.5} strokeOpacity={0.5} />

      {/* x-axis labels */}
      {[dist.p05, dist.median, dist.p95].map((v, i) => (
        <text key={i} x={xOf(v)} y={H - 1} textAnchor="middle" fontSize={7}
          fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
          {(v * 100).toFixed(1)}%
        </text>
      ))}

      {/* hover tooltip */}
      {tooltip && (
        <g>
          <rect x={tooltip.cx - 28} width={56} y={2} height={22} rx={4}
            fill="var(--popover)" stroke="var(--border)" strokeWidth={0.75} />
          <text x={tooltip.cx} y={11} textAnchor="middle" fontSize={7.5} fontWeight={600}
            fill="var(--foreground)" fontFamily="var(--font-mono, monospace)">
            {tooltip.lo.toFixed(1)}% → {tooltip.hi.toFixed(1)}%
          </text>
          <text x={tooltip.cx} y={21} textAnchor="middle" fontSize={7}
            fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
            {tooltip.n} obs · {tooltip.pct}%
          </text>
        </g>
      )}
    </svg>
  );
};

// ─── Box plot ─────────────────────────────────────────────────────────────────

const BoxPlotViz: React.FC<{ dist: ForwardReturnDistribution }> = ({ dist }) => {
  const [hov, setHov] = useState<string | null>(null);
  if (!dist.samples.length) return null;

  const W = 220, H = 60;
  const rets = dist.samples.map(s => s.ret);
  const rmin = Math.min(...rets);
  const rmax = Math.max(...rets);
  const span = rmax - rmin || 1e-9;
  const xOf = (v: number) => ((v - rmin) / span) * W;
  const accent = dist.mean >= 0 ? '#4E6040' : 'var(--primary)';
  const CY = H / 2;

  const labels: { key: string; v: number; label: string }[] = [
    { key: 'min',    v: rmin,         label: `min ${(rmin * 100).toFixed(2)}%` },
    { key: 'p05',    v: dist.p05,     label: `p05 ${(dist.p05 * 100).toFixed(2)}%` },
    { key: 'p25',    v: dist.p25,     label: `p25 ${(dist.p25 * 100).toFixed(2)}%` },
    { key: 'median', v: dist.median,  label: `med ${(dist.median * 100).toFixed(2)}%` },
    { key: 'p75',    v: dist.p75,     label: `p75 ${(dist.p75 * 100).toFixed(2)}%` },
    { key: 'p95',    v: dist.p95,     label: `p95 ${(dist.p95 * 100).toFixed(2)}%` },
    { key: 'max',    v: rmax,         label: `max ${(rmax * 100).toFixed(2)}%` },
  ];

  const hovLabel = labels.find(l => l.key === hov);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="frd-svg" aria-hidden>
      {/* whisker line p05-p95 */}
      <line x1={xOf(dist.p05)} x2={xOf(dist.p95)} y1={CY} y2={CY}
        stroke="var(--muted-foreground)" strokeWidth={1.5} />
      {/* outer whiskers min-p05 and p95-max */}
      <line x1={xOf(rmin)} x2={xOf(dist.p05)} y1={CY} y2={CY}
        stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="2 2" />
      <line x1={xOf(dist.p95)} x2={xOf(rmax)} y1={CY} y2={CY}
        stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="2 2" />
      {/* IQR box */}
      <rect x={xOf(dist.p25)} width={Math.max(1, xOf(dist.p75) - xOf(dist.p25))}
        y={CY - 9} height={18} rx={3}
        fill={`color-mix(in srgb, ${accent} 20%, transparent)`}
        stroke={accent} strokeWidth={1} />
      {/* median line */}
      <line x1={xOf(dist.median)} x2={xOf(dist.median)} y1={CY - 10} y2={CY + 10}
        stroke={accent} strokeWidth={2} />
      {/* mean dot */}
      <circle cx={xOf(dist.mean)} cy={CY} r={3}
        fill="var(--foreground)" fillOpacity={0.7} />

      {/* zero baseline */}
      {rmin < 0 && rmax > 0 && (
        <line x1={xOf(0)} x2={xOf(0)} y1={CY - 12} y2={CY + 12}
          stroke="var(--muted-foreground)" strokeWidth={1} strokeOpacity={0.4} strokeDasharray="3 2" />
      )}

      {/* hit targets for hover labels */}
      {labels.map(({ key, v }) => (
        <line key={key}
          x1={xOf(v) - 5} x2={xOf(v) + 5} y1={CY - 14} y2={CY + 14}
          stroke="transparent" strokeWidth={10}
          className="frd-hist-bar"
          onMouseEnter={() => setHov(key)}
          onMouseLeave={() => setHov(null)}
        />
      ))}

      {/* tooltip */}
      {hovLabel && (
        <g>
          <rect
            x={Math.min(Math.max(xOf(hovLabel.v) - 30, 0), W - 64)}
            width={64} y={4} height={16} rx={4}
            fill="var(--popover)" stroke="var(--border)" strokeWidth={0.75}
          />
          <text
            x={Math.min(Math.max(xOf(hovLabel.v), 32), W - 32)}
            y={15} textAnchor="middle" fontSize={7.5} fontWeight={600}
            fill="var(--foreground)" fontFamily="var(--font-mono, monospace)"
          >
            {hovLabel.label}
          </text>
        </g>
      )}

      {/* axis labels */}
      {[rmin, dist.median, rmax].map((v, i) => (
        <text key={i} x={xOf(v)} y={H - 1} textAnchor="middle" fontSize={7}
          fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
          {(v * 100).toFixed(1)}%
        </text>
      ))}
    </svg>
  );
};

// ─── CDF ─────────────────────────────────────────────────────────────────────

const CdfViz: React.FC<{ dist: ForwardReturnDistribution }> = ({ dist }) => {
  const [mouseX, setMouseX] = useState<number | null>(null);
  if (!dist.samples.length) return null;

  const W = 220, H = 72;
  const rets = [...dist.samples.map(s => s.ret)].sort((a, b) => a - b);
  const rmin = rets[0], rmax = rets[rets.length - 1];
  const span = rmax - rmin || 1e-9;
  const xOf = (v: number) => ((v - rmin) / span) * W;
  const n = rets.length;

  const cdfPath = rets.map((r, i) =>
    `${i === 0 ? 'M' : 'L'}${xOf(r).toFixed(1)},${(H - 10 - ((i + 1) / n) * (H - 14)).toFixed(1)}`
  ).join(' ');

  const accent = dist.mean >= 0 ? '#4E6040' : 'var(--primary)';

  // crosshair tooltip
  let crosshairVal: { ret: number; prob: number } | null = null;
  if (mouseX !== null) {
    const retAtX = rmin + (mouseX / W) * span;
    const count = rets.filter(r => r <= retAtX).length;
    crosshairVal = { ret: retAtX, prob: count / n };
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="frd-svg frd-svg-crosshair" aria-hidden
      onMouseMove={e => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        setMouseX(((e.clientX - rect.left) / rect.width) * W);
      }}
      onMouseLeave={() => setMouseX(null)}
    >
      {/* 50% line */}
      <line x1={0} x2={W} y1={H - 10 - 0.5 * (H - 14)} y2={H - 10 - 0.5 * (H - 14)}
        stroke="var(--muted-foreground)" strokeWidth={0.75} strokeDasharray="4 3" strokeOpacity={0.4} />

      {/* zero line */}
      {rmin < 0 && rmax > 0 && (
        <line x1={xOf(0)} x2={xOf(0)} y1={0} y2={H - 10}
          stroke="var(--muted-foreground)" strokeWidth={1} strokeOpacity={0.35} strokeDasharray="3 2" />
      )}

      {/* CDF area fill */}
      <path
        d={`${cdfPath} L${xOf(rmax).toFixed(1)},${H - 10} L${xOf(rmin).toFixed(1)},${H - 10} Z`}
        fill={`color-mix(in srgb, ${accent} 12%, transparent)`}
      />
      {/* CDF line */}
      <path d={cdfPath} fill="none" stroke={accent} strokeWidth={1.75} />

      {/* axis labels */}
      {[0.0, 0.5, 1.0].map(p => (
        <text key={p} x={2} y={H - 10 - p * (H - 14) + 3} fontSize={7}
          fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
          {(p * 100).toFixed(0)}%
        </text>
      ))}
      {[rmin, dist.median, rmax].map((v, i) => (
        <text key={i} x={xOf(v)} y={H - 1} textAnchor="middle" fontSize={7}
          fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
          {(v * 100).toFixed(1)}%
        </text>
      ))}

      {/* crosshair + tooltip */}
      {crosshairVal && mouseX !== null && (
        <g>
          <line x1={mouseX} x2={mouseX} y1={0} y2={H - 10}
            stroke="var(--foreground)" strokeWidth={0.75} strokeOpacity={0.5} />
          <rect
            x={Math.min(mouseX + 4, W - 64)} width={60} y={4} height={22} rx={4}
            fill="var(--popover)" stroke="var(--border)" strokeWidth={0.75}
          />
          <text x={Math.min(mouseX + 34, W - 34)} y={13} textAnchor="middle" fontSize={7.5} fontWeight={600}
            fill="var(--foreground)" fontFamily="var(--font-mono, monospace)">
            {(crosshairVal.ret * 100).toFixed(2)}%
          </text>
          <text x={Math.min(mouseX + 34, W - 34)} y={23} textAnchor="middle" fontSize={7}
            fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
            P(ret ≤ x) = {(crosshairVal.prob * 100).toFixed(0)}%
          </text>
        </g>
      )}
    </svg>
  );
};

// ─── Compact percentile band ──────────────────────────────────────────────────

const BandViz: React.FC<{ dist: ForwardReturnDistribution }> = ({ dist }) => {
  const [hov, setHov] = useState<string | null>(null);
  if (!dist.samples.length) return null;

  const W = 220, H = 40;
  const rets = dist.samples.map(s => s.ret);
  const rmin = Math.min(...rets), rmax = Math.max(...rets);
  const span = rmax - rmin || 1e-9;
  const xOf = (v: number) => ((v - rmin) / span) * W;
  const accent = dist.mean >= 0 ? '#4E6040' : 'var(--primary)';
  const CY = 16, BH = 12;

  const regions = [
    { key: 'outer', x: xOf(dist.p05), w: xOf(dist.p95) - xOf(dist.p05), label: `p05–p95  ${(dist.p05*100).toFixed(2)}% → ${(dist.p95*100).toFixed(2)}%` },
    { key: 'iqr',   x: xOf(dist.p25), w: xOf(dist.p75) - xOf(dist.p25), label: `IQR  ${(dist.p25*100).toFixed(2)}% → ${(dist.p75*100).toFixed(2)}%` },
  ];

  const tooltip = hov === 'median'
    ? `Median  ${(dist.median * 100).toFixed(2)}%`
    : regions.find(r => r.key === hov)?.label ?? null;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="frd-svg" aria-hidden
      onMouseLeave={() => setHov(null)}>
      {/* track */}
      <rect x={0} width={W} y={CY - BH / 2} height={BH} rx={4}
        fill="var(--muted)" stroke="var(--border)" strokeWidth={0.75} />

      {/* p05–p95 band */}
      <rect x={regions[0].x} width={Math.max(0, regions[0].w)} y={CY - BH / 2 + 2} height={BH - 4} rx={3}
        fill={`color-mix(in srgb, ${accent} 18%, transparent)`}
        onMouseEnter={() => setHov('outer')} className="frd-band-region" />

      {/* IQR */}
      <rect x={regions[1].x} width={Math.max(0, regions[1].w)} y={CY - BH / 2 + 1} height={BH - 2} rx={3}
        fill={`color-mix(in srgb, ${accent} 35%, transparent)`}
        onMouseEnter={() => setHov('iqr')} className="frd-band-region" />

      {/* zero */}
      {rmin < 0 && rmax > 0 && (
        <line x1={xOf(0)} x2={xOf(0)} y1={CY - BH / 2 - 2} y2={CY + BH / 2 + 2}
          stroke="var(--muted-foreground)" strokeWidth={1} strokeOpacity={0.45} strokeDasharray="2 2" />
      )}

      {/* median tick */}
      <line x1={xOf(dist.median)} x2={xOf(dist.median)} y1={CY - BH / 2 - 1} y2={CY + BH / 2 + 1}
        stroke={accent} strokeWidth={2}
        onMouseEnter={() => setHov('median')} className="frd-band-region" />

      {/* axis labels */}
      {[rmin, dist.median, rmax].map((v, i) => (
        <text key={i} x={xOf(v)} y={H - 1} textAnchor="middle" fontSize={7}
          fill="var(--muted-foreground)" fontFamily="var(--font-mono, monospace)">
          {(v * 100).toFixed(1)}%
        </text>
      ))}

      {/* tooltip */}
      {tooltip && (
        <g>
          <rect x={2} width={W - 4} y={0} height={12} rx={3}
            fill="var(--popover)" stroke="var(--border)" strokeWidth={0.75} />
          <text x={W / 2} y={9} textAnchor="middle" fontSize={7.5} fontWeight={600}
            fill="var(--foreground)" fontFamily="var(--font-mono, monospace)">
            {tooltip}
          </text>
        </g>
      )}
    </svg>
  );
};

const Stat: React.FC<{ label: string; value: string; primary?: boolean }> = ({ label, value, primary }) => (
  <div className="frd-stat">
    <span className="ds-caption frd-stat-label">{label}</span>
    <span className="frd-stat-value" data-primary={primary ? '' : undefined}>{value}</span>
  </div>
);

const Card: React.FC<{ label: string }> = ({ label }) => (
  <div className="frd-card"><p className="ds-caption frd-card-msg">{label}</p></div>
);
