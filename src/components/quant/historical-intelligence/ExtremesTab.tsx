/**
 * ExtremesTab — current statistical extremes + how the market historically
 * behaved after similar extremes.
 *
 * Renders each metric reading with a magnitude bar and direction; the
 * "after similar extremes" panel computes forward-return distributions from
 * the historical indices where each metric crossed its extremity threshold.
 */

import React, { useMemo, useState } from 'react';
import { Gauge, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { useOHLCV } from '../../../hooks/useMarket';
import {
  computeExtremesSnapshot,
  extremeConditionIndices,
  type ExtremeMetric,
  type ExtremeReading,
  type ExtremesSnapshot,
  buildForwardReturnSamples,
  summariseForwardReturns,
  type ForwardReturnDistribution,
} from '../../../lib/quant';

const HISTORY_BARS = 2520;
const HORIZONS = [5, 20, 60] as const;
const Z_TRIGGER_THRESHOLD = 2;
const PCT_TRIGGER_THRESHOLD = 0.9;   // 90th/10th percentile tails

const METRIC_LABELS: Record<ExtremeMetric, string> = {
  return_z: 'Latest return z-score',
  volatility_pct: 'Realised vol percentile',
  trend_deviation_z: 'Trend deviation z-score',
  drawdown_pct: 'Drawdown percentile',
  volume_z: 'Volume z-score',
  price_z: 'Price z-score',
};

const METRIC_USES_PCT: ExtremeMetric[] = ['volatility_pct', 'drawdown_pct'];

export const ExtremesTab: React.FC<{ symbol: string }> = ({ symbol }) => {
  const ohlcv = useOHLCV(symbol, '1day', HISTORY_BARS);
  const bars = ohlcv.data?.bars ?? [];

  const snapshot = useMemo<ExtremesSnapshot | null>(
    () => (bars.length >= 200 ? computeExtremesSnapshot(bars, { symbol }) : null),
    [bars, symbol],
  );

  const [selected, setSelected] = useState<ExtremeMetric | null>(null);

  const conditional = useMemo(() => {
    if (!selected || !bars.length) return null;
    const threshold = METRIC_USES_PCT.includes(selected) ? PCT_TRIGGER_THRESHOLD : Z_TRIGGER_THRESHOLD;
    const indices = extremeConditionIndices(bars, selected, threshold);
    if (!indices.length) return { indices, distributions: [] as ForwardReturnDistribution[], threshold };
    const distributions = HORIZONS.map(h =>
      summariseForwardReturns(buildForwardReturnSamples(bars, indices, h), h),
    );
    return { indices, distributions, threshold };
  }, [bars, selected]);

  if (ohlcv.loading) return <Card label="Loading multi-year history for extremes scan…" />;
  if (!snapshot) return <Card label={`Need ≥ 200 bars to compute extremes. ${symbol} has ${bars.length}.`} />;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={iconWrap}><Gauge size={14} color="var(--primary)" /></span>
        <div>
          <h2 className="ds-heading" style={{ margin: 0 }}>Statistical extremes · {symbol}</h2>
          <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            Composite extremity score{' '}
            <strong style={{ color: 'var(--foreground)' }}>{(snapshot.composite * 100).toFixed(0)}%</strong>
            {' '}across {snapshot.readings.length} metrics.
          </p>
        </div>
      </header>

      <section style={cardStyle}>
        <h3 className="ds-heading" style={{ margin: 0, fontSize: 13, marginBottom: 8 }}>Current readings</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {snapshot.readings.map((r) => (
            <ReadingRow
              key={r.metric}
              reading={r}
              active={selected === r.metric}
              onClick={() => setSelected((cur) => (cur === r.metric ? null : r.metric))}
            />
          ))}
        </div>
        <p className="ds-caption" style={{ marginTop: 10, marginBottom: 0, color: 'var(--muted-foreground)' }}>
          Click any metric to load the conditional forward-return distribution from historical periods that crossed the same extremity threshold.
        </p>
      </section>

      {selected && conditional && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
            <h3 className="ds-heading" style={{ margin: 0, fontSize: 13 }}>
              What followed when {METRIC_LABELS[selected]} hit similar extremes
            </h3>
            <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
              {conditional.indices.length} historical trigger
              {conditional.indices.length === 1 ? '' : 's'}
              {METRIC_USES_PCT.includes(selected)
                ? ` · percentile tails ≥ ${Math.round(conditional.threshold * 100)}% / ≤ ${Math.round((1 - conditional.threshold) * 100)}%`
                : ` · |z| ≥ ${conditional.threshold}`}
            </span>
          </div>

          {conditional.distributions.length === 0 ? (
            <p className="ds-caption" style={{ marginTop: 8, color: 'var(--muted-foreground)' }}>
              No historical periods crossed this threshold in {symbol}.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
              {conditional.distributions.map((d) => (
                <ForwardTile key={d.horizon} dist={d} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

// ─── Sub-components ─────────────────────────────────────────────────────────

const ReadingRow: React.FC<{ reading: ExtremeReading; active: boolean; onClick: () => void }> = ({ reading, active, onClick }) => {
  const Icon =
    reading.direction === 'positive' ? ArrowUp :
    reading.direction === 'negative' ? ArrowDown : Minus;
  const dirColor =
    reading.direction === 'positive' ? '#4E6040' :
    reading.direction === 'negative' ? 'var(--primary)' : 'var(--muted-foreground)';
  const pct = Math.round(reading.magnitude * 100);
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid',
        borderColor: active ? 'color-mix(in srgb, var(--primary) 40%, transparent)' : 'var(--border)',
        background: active ? 'color-mix(in srgb, var(--primary) 6%, transparent)' : 'var(--muted)',
        cursor: 'pointer',
        display: 'grid', gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon size={13} color={dirColor} />
        <strong style={{ fontSize: 12 }}>{METRIC_LABELS[reading.metric]}</strong>
        <span className="ds-caption" style={{ marginLeft: 'auto', color: 'var(--muted-foreground)', fontSize: 10 }}>
          pct rank {(reading.percentileRank * 100).toFixed(0)}% · score {reading.score.toFixed(2)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, height: 4, background: 'var(--card)', borderRadius: 4, overflow: 'hidden' }}>
          <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: dirColor }} />
        </span>
        <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'var(--muted-foreground)', minWidth: 26, textAlign: 'right' }}>
          {pct}%
        </span>
      </div>

      <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>
        {reading.description}
      </span>
    </button>
  );
};

const ForwardTile: React.FC<{ dist: ForwardReturnDistribution }> = ({ dist }) => {
  const positive = dist.mean >= 0;
  return (
    <div style={{
      padding: 10,
      borderRadius: 10,
      background: 'var(--muted)',
      border: '1px solid var(--border)',
      display: 'grid', gap: 6,
    }}>
      <span className="ds-caption" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-foreground)', fontWeight: 700 }}>
        +{dist.horizon}-bar forward
      </span>
      <span style={{ fontSize: 18, fontWeight: 700, color: positive ? '#4E6040' : 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
        {(dist.mean * 100).toFixed(2)}%
      </span>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted-foreground)' }}>
        <span>n = {dist.n}</span>
        <span>win {(dist.winRate * 100).toFixed(0)}%</span>
        <span>down {(dist.downsideProbability * 100).toFixed(0)}%</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
        p05 / p95: <strong style={{ color: 'var(--foreground)' }}>{(dist.p05 * 100).toFixed(2)}% / {(dist.p95 * 100).toFixed(2)}%</strong>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
        worst MAE <strong style={{ color: 'var(--primary)' }}>{(dist.worstMae * 100).toFixed(1)}%</strong>
      </div>
    </div>
  );
};

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
