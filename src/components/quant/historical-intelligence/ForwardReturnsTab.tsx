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
import { BarChart3, Sparkles } from 'lucide-react';
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

const HISTORY_BARS = 2520;

export const ForwardReturnsTab: React.FC<{ symbol: string }> = ({ symbol }) => {
  const ohlcv = useOHLCV(symbol, '1day', HISTORY_BARS);
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
    <div style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={iconWrap}><BarChart3 size={14} color="var(--primary)" /></span>
        <div>
          <h2 className="ds-heading" style={{ margin: 0 }}>Forward return distributions · {symbol}</h2>
          <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            Conditional historical outcomes at 1 / 5 / 10 / 20 / 60-bar horizons. Probabilistic, never directional.
          </p>
        </div>
      </header>

      <section style={cardStyle}>
        <h3 className="ds-heading" style={{ margin: 0, fontSize: 13, marginBottom: 8 }}>Trigger condition</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TRIGGERS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTrigger(t.key)}
              style={{
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: t.key === trigger ? 700 : 500,
                color: t.key === trigger ? 'var(--foreground)' : 'var(--muted-foreground)',
                background: t.key === trigger ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'var(--muted)',
                border: '1px solid',
                borderColor: t.key === trigger ? 'color-mix(in srgb, var(--primary) 40%, transparent)' : 'var(--border)',
                borderRadius: 999,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="ds-caption" style={{ margin: '8px 0 0', color: 'var(--muted-foreground)', fontSize: 11 }}>
          <Sparkles size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
          {triggerMeta.description}
          {result.indices && (
            <> — <strong style={{ color: 'var(--foreground)' }}>{result.indices.length}</strong> historical occurrences.</>
          )}
        </p>
      </section>

      {result.distributions.length === 0 ? (
        <Card label={`No historical bars matched "${triggerMeta.label}" for ${symbol}.`} />
      ) : (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {result.distributions.map((d) => (
            <DistributionCard key={d.horizon} dist={d} />
          ))}
        </section>
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

const DistributionCard: React.FC<{ dist: ForwardReturnDistribution }> = ({ dist }) => {
  const positive = dist.mean >= 0;
  const conf = distributionConfidence(dist);
  return (
    <div style={{ ...cardStyle, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h4 style={{ margin: 0, fontSize: 13 }}>+{dist.horizon}-bar forward</h4>
        <ConfidenceBadge score={conf} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: positive ? '#4E6040' : 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
          {(dist.mean * 100).toFixed(2)}%
        </span>
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>mean</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted-foreground)' }}>n = {dist.n}</span>
      </div>

      <DistributionBar dist={dist} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4, fontSize: 11 }}>
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

/** Horizontal mini "distribution" showing min / p05 / p25 / median / p75 / p95 / max as a band. */
const DistributionBar: React.FC<{ dist: ForwardReturnDistribution }> = ({ dist }) => {
  if (!dist.samples.length) return null;
  const min = Math.min(...dist.samples.map(s => s.ret));
  const max = Math.max(...dist.samples.map(s => s.ret));
  const span = max - min || 1e-9;
  const norm = (v: number) => ((v - min) / span) * 100;
  return (
    <div style={{ position: 'relative', height: 14, borderRadius: 6, background: 'var(--muted)', border: '1px solid var(--border)' }}>
      {/* p05..p95 band */}
      <span style={{
        position: 'absolute', top: 2, bottom: 2,
        left: `${norm(dist.p05)}%`, width: `${norm(dist.p95) - norm(dist.p05)}%`,
        background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
        borderRadius: 4,
      }} />
      {/* IQR */}
      <span style={{
        position: 'absolute', top: 1, bottom: 1,
        left: `${norm(dist.p25)}%`, width: `${norm(dist.p75) - norm(dist.p25)}%`,
        background: 'color-mix(in srgb, var(--primary) 30%, transparent)',
        borderRadius: 4,
      }} />
      {/* median tick */}
      <span style={{
        position: 'absolute', top: -1, bottom: -1,
        left: `calc(${norm(dist.median)}% - 1px)`, width: 2,
        background: 'var(--primary)',
      }} />
      {/* zero baseline */}
      {min < 0 && max > 0 && (
        <span style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `calc(${norm(0)}% - 1px)`, width: 1,
          background: 'var(--muted-foreground)',
          opacity: 0.5,
        }} />
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; primary?: boolean }> = ({ label, value, primary }) => (
  <div style={{ display: 'grid', gap: 1 }}>
    <span className="ds-caption" style={{ fontSize: 9, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted-foreground)', fontWeight: 700 }}>
      {label}
    </span>
    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: primary ? 'var(--primary)' : 'var(--foreground)' }}>
      {value}
    </span>
  </div>
);

const cardStyle: React.CSSProperties = {
  padding: 14, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)',
};
const iconWrap: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
  border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const Card: React.FC<{ label: string }> = ({ label }) => (
  <div style={cardStyle}><p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>{label}</p></div>
);
