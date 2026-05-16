/**
 * ScenarioTab — composable scenario builder.
 *
 * Users can add / remove conditions across the seven structural metrics
 * exposed by the scenario engine. Each condition picks a metric, a
 * comparator, and a threshold. The matched indices are evaluated against
 * 5 / 20 / 60-bar forward-return distributions. Resulting summaries can be
 * dropped into the Copilot context (Wave-D context hook already includes
 * scenario summaries) — the artifact-write path is intentionally deferred
 * to the workspace artifact tooling.
 */

import React, { useMemo, useState } from 'react';
import { FlaskConical, Plus, X, Sparkles } from 'lucide-react';
import { useOHLCV } from '../../../hooks/useMarket';
import {
  findScenarioMatches,
  forwardReturnDistributions,
  describeCondition,
  distributionConfidence,
  type ScenarioCondition,
  type ScenarioComparator,
  type ScenarioMetric,
} from '../../../lib/quant';
import { ConfidenceBadge } from '../ConfidenceBadge';

const HORIZONS = [5, 20, 60] as const;

const METRICS: Array<{ key: ScenarioMetric; label: string; hint: string; defaultValue: number; defaultComparator: ScenarioComparator }> = [
  { key: 'volatility_percentile', label: 'Vol percentile (21-bar)', hint: 'fraction 0..1',   defaultValue: 0.10, defaultComparator: 'lte' },
  { key: 'price_vs_sma50',        label: 'Price vs SMA50',          hint: 'fraction',         defaultValue: 0.00, defaultComparator: 'gt' },
  { key: 'price_vs_sma200',       label: 'Price vs SMA200',         hint: 'fraction',         defaultValue: 0.00, defaultComparator: 'gt' },
  { key: 'drawdown',              label: 'Drawdown',                hint: '≤ 0 fraction',    defaultValue: -0.05, defaultComparator: 'gte' },
  { key: 'return_z',              label: 'Return z-score (5-bar)',  hint: 'σ',                defaultValue: -2,   defaultComparator: 'lte' },
  { key: 'trend_deviation_z',     label: 'Trend deviation z',       hint: 'σ',                defaultValue: 2,    defaultComparator: 'gte' },
  { key: 'volume_z',              label: 'Volume z-score',          hint: 'σ',                defaultValue: 2,    defaultComparator: 'gte' },
];

const COMPARATORS: ScenarioComparator[] = ['lt', 'lte', 'gt', 'gte'];

const PRESETS: Array<{ name: string; conditions: ScenarioCondition[] }> = [
  {
    name: 'Vol compression + trend up',
    conditions: [
      { metric: 'volatility_percentile', comparator: 'lte', value: 0.15 },
      { metric: 'price_vs_sma50',        comparator: 'gt',  value: 0 },
    ],
  },
  {
    name: 'Deep drawdown recovery setup',
    conditions: [
      { metric: 'drawdown',              comparator: 'lte', value: -0.10 },
      { metric: 'price_vs_sma50',        comparator: 'lt',  value: 0 },
    ],
  },
  {
    name: 'Trend stretched + vol expansion',
    conditions: [
      { metric: 'trend_deviation_z',     comparator: 'gte', value: 2 },
      { metric: 'volatility_percentile', comparator: 'gte', value: 0.80 },
    ],
  },
];

export const ScenarioTab: React.FC<{ symbol: string; historyBars?: number }> = ({ symbol, historyBars = 2520 }) => {
  const ohlcv = useOHLCV(symbol, '1day', historyBars);
  const bars = ohlcv.data?.bars ?? [];

  const [conditions, setConditions] = useState<ScenarioCondition[]>(PRESETS[0].conditions);

  const run = useMemo(() => {
    if (bars.length < 280) return null;
    const matches = findScenarioMatches(bars, conditions);
    const distributions = forwardReturnDistributions(bars, matches.indices, HORIZONS);
    return { matches, distributions };
  }, [bars, conditions]);

  if (ohlcv.loading) return <Card label="Loading multi-year history…" />;
  if (!run) return <Card label={`Need ≥ 280 bars to run scenarios. ${symbol} has ${bars.length}.`} />;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={iconWrap}><FlaskConical size={14} color="var(--primary)" /></span>
        <div>
          <h2 className="ds-heading" style={{ margin: 0 }}>Scenario builder · {symbol}</h2>
          <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            AND-combine structural conditions; inspect historical match count and forward outcome distributions.
          </p>
        </div>
      </header>

      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
          <h3 className="ds-heading" style={{ margin: 0, fontSize: 13 }}>Conditions</h3>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => setConditions(p.conditions)}
                style={presetButtonStyle}
              >
                <Sparkles size={10} style={{ marginRight: 4, verticalAlign: -1 }} />
                {p.name}
              </button>
            ))}
            <button onClick={() => setConditions([])} style={{ ...presetButtonStyle, color: 'var(--primary)' }}>Clear</button>
          </div>
        </div>

        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 6 }}>
          {conditions.map((c, idx) => (
            <li key={idx} style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 0.6fr 0.7fr auto',
              gap: 6,
              alignItems: 'center',
              padding: 8,
              borderRadius: 8,
              background: 'var(--muted)',
              border: '1px solid var(--border)',
            }}>
              <select
                value={c.metric}
                onChange={(e) => {
                  const next = [...conditions];
                  const meta = METRICS.find(m => m.key === e.target.value as ScenarioMetric)!;
                  next[idx] = { ...next[idx], metric: meta.key, comparator: meta.defaultComparator, value: meta.defaultValue };
                  setConditions(next);
                }}
                style={inputStyle}
              >
                {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <select
                value={c.comparator}
                onChange={(e) => {
                  const next = [...conditions];
                  next[idx] = { ...next[idx], comparator: e.target.value as ScenarioComparator };
                  setConditions(next);
                }}
                style={inputStyle}
              >
                {COMPARATORS.map(o => <option key={o} value={o}>{o === 'lt' ? '<' : o === 'lte' ? '≤' : o === 'gt' ? '>' : '≥'}</option>)}
              </select>
              <input
                type="number"
                step="0.01"
                value={c.value}
                onChange={(e) => {
                  const next = [...conditions];
                  next[idx] = { ...next[idx], value: parseFloat(e.target.value) };
                  setConditions(next);
                }}
                style={inputStyle}
              />
              <button onClick={() => setConditions(conditions.filter((_, i) => i !== idx))} style={iconButton} title="Remove">
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>

        <button
          onClick={() => {
            const m = METRICS[0];
            setConditions([...conditions, { metric: m.key, comparator: m.defaultComparator, value: m.defaultValue }]);
          }}
          style={{
            marginTop: 8,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600,
            background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
            color: 'var(--primary)',
            border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
            cursor: 'pointer',
          }}
        >
          <Plus size={11} /> Add condition
        </button>

        <p className="ds-caption" style={{ margin: '10px 0 0', color: 'var(--muted-foreground)', fontSize: 11 }}>
          Conditions are AND-combined. Translated: <strong style={{ color: 'var(--foreground)' }}>{conditions.length ? conditions.map(describeCondition).join(' AND ') : '— no conditions —'}</strong>
        </p>
      </section>

      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
          <h3 className="ds-heading" style={{ margin: 0, fontSize: 13 }}>Outcome distributions</h3>
          <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
            <strong style={{ color: 'var(--foreground)' }}>{run.matches.indices.length}</strong> historical matches across {bars.length} bars
          </span>
        </div>
        {run.matches.indices.length === 0 ? (
          <p className="ds-caption" style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>
            No historical bars satisfied the joint condition. Try loosening thresholds or removing a condition.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
            {run.distributions.map((d) => {
              const positive = d.mean >= 0;
              const conf = distributionConfidence(d);
              return (
                <div key={d.horizon} style={{
                  padding: 12, borderRadius: 10,
                  background: 'var(--muted)', border: '1px solid var(--border)',
                  display: 'grid', gap: 6,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="ds-caption" style={{ fontSize: 10, color: 'var(--muted-foreground)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>+{d.horizon}-bar forward</span>
                    <ConfidenceBadge score={conf} />
                  </div>
                  <span style={{ fontSize: 22, fontWeight: 700, color: positive ? '#4E6040' : 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {(d.mean * 100).toFixed(2)}%
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted-foreground)' }}>
                    <span>n = {d.n}</span>
                    <span>win {(d.winRate * 100).toFixed(0)}%</span>
                    <span>down {(d.downsideProbability * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                    p25 / p75: <strong style={{ color: 'var(--foreground)' }}>{(d.p25 * 100).toFixed(2)}% / {(d.p75 * 100).toFixed(2)}%</strong>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                    Worst MAE: <strong style={{ color: 'var(--primary)' }}>{(d.worstMae * 100).toFixed(1)}%</strong>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

const cardStyle: React.CSSProperties = { padding: 14, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)' };
const iconWrap: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
  border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const inputStyle: React.CSSProperties = {
  padding: '6px 8px', fontSize: 12, borderRadius: 6,
  background: 'var(--card)', color: 'var(--foreground)',
  border: '1px solid var(--border)',
  fontVariantNumeric: 'tabular-nums',
};
const iconButton: React.CSSProperties = {
  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0, borderRadius: 6, background: 'transparent',
  color: 'var(--muted-foreground)', border: '1px solid var(--border)',
  cursor: 'pointer',
};
const presetButtonStyle: React.CSSProperties = {
  padding: '4px 10px', fontSize: 10, fontWeight: 600,
  background: 'var(--muted)',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  cursor: 'pointer',
};

const Card: React.FC<{ label: string }> = ({ label }) => (
  <div style={cardStyle}><p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>{label}</p></div>
);
