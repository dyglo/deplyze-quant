import React, { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import { Play, Plus, X, AlertTriangle, CheckCircle2, Loader2, FlaskConical } from 'lucide-react';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import {
  getSignalLibrary,
  validateStrategy,
  runBacktest,
  regimeColor,
  REGIME_LABELS,
  type SignalLibrary,
  type SignalMeta,
  type StrategySpec,
  type SignalConfig,
  type Direction,
  type Operator,
  type PositionSizing,
  type BacktestResults,
  type ValidationResult,
  type AggregateMetrics,
  type PartitionMetrics,
} from '../services/backtest';

// ─── Spec helpers ───────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

function invert(d: Direction): Direction {
  switch (d) {
    case 'Above':
      return 'Below';
    case 'Below':
      return 'Above';
    case 'CrossUp':
      return 'CrossDown';
    case 'CrossDown':
      return 'CrossUp';
  }
}

/** Entry/exit logic derive from the signal set so the spec is always valid. */
function buildSpec(
  base: Partial<StrategySpec>,
  signals: SignalConfig[],
  entryOp: Operator,
  exitOp: Operator,
  sizing: PositionSizing,
  comparison: boolean,
): StrategySpec {
  return {
    id: base.id ?? `strat_${Date.now()}`,
    name: base.name ?? 'Untitled strategy',
    date_range: base.date_range ?? { start_date: '2015-01-01', end_date: TODAY },
    signals,
    entry_logic: {
      operator: entryOp,
      conditions: signals.map((s) => ({ signal_id: s.signal_id, direction: s.direction, threshold: s.threshold })),
    },
    exit_logic: {
      operator: exitOp,
      conditions: signals.map((s) => ({ signal_id: s.signal_id, direction: invert(s.direction), threshold: s.threshold })),
    },
    position_sizing: sizing,
    risk_params: base.risk_params ?? {
      max_drawdown_pct: 25,
      position_cap_pct: 100,
      rebalance_freq: 'Daily',
      risk_per_trade_pct: 1,
      min_rr: 2,
    },
    comparison_mode: comparison,
    cost_model: base.cost_model ?? { commission_bps: 1, slippage_bps: 2 },
  };
}

interface Template {
  key: string;
  name: string;
  blurb: string;
  signals: SignalConfig[];
  sizing: PositionSizing;
  entryOp: Operator;
  exitOp: Operator;
}

const TEMPLATES: Template[] = [
  {
    key: 'risk_on_trend',
    name: 'Risk-On Regime Trend',
    blurb: 'Long while the HMM filtered probability of the risk-on regime is dominant. Vol-targeted.',
    signals: [
      { signal_id: 'macro_regime_risk_on', signal_type: 'MacroRegime', threshold: 0.5, direction: 'Above', weight: 1 },
    ],
    sizing: { method: 'VolTarget', target_annual_vol: 0.1 },
    entryOp: 'AND',
    exitOp: 'OR',
  },
  {
    key: 'curve_defensive',
    name: 'Yield-Curve Defensive',
    blurb: 'Risk-off bias: reduce exposure when the 10y-2y term spread inverts. Half-Kelly sizing.',
    signals: [
      { signal_id: 'yield_curve_10y2y', signal_type: 'YieldSpread', threshold: 0, direction: 'Above', weight: 1 },
    ],
    sizing: { method: 'Kelly', kelly_fraction: 0.5 },
    entryOp: 'AND',
    exitOp: 'OR',
  },
  {
    key: 'liquidity_macro',
    name: 'Liquidity + Regime',
    blurb: 'Long when net liquidity is expanding AND the macro regime is risk-on. Equal-weight gate.',
    signals: [
      { signal_id: 'liquidity_composite', signal_type: 'MacroRegime', threshold: 0, direction: 'Above', weight: 0.5 },
      { signal_id: 'macro_regime_risk_on', signal_type: 'MacroRegime', threshold: 0.5, direction: 'Above', weight: 0.5 },
    ],
    sizing: { method: 'VolTarget', target_annual_vol: 0.12 },
    entryOp: 'AND',
    exitOp: 'OR',
  },
];

// ─── Formatting ─────────────────────────────────────────────────────────────────

const f2 = (x: number | undefined) => (x === undefined || !isFinite(x) ? '—' : x.toFixed(2));
const fPct = (x: number | undefined) => (x === undefined || !isFinite(x) ? '—' : `${(x * 100).toFixed(1)}%`);
const fProb = (x: number | undefined) => (x === undefined || !isFinite(x) ? '—' : `${(x * 100).toFixed(0)}%`);

// ─── Small UI atoms ─────────────────────────────────────────────────────────────

const TierBadge: React.FC<{ tier: string }> = ({ tier }) => (
  <span
    style={{
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      padding: '2px 6px',
      borderRadius: 4,
      color: 'var(--primary)',
      background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
    }}
  >
    {tier}
  </span>
);

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 6,
  border: '1px solid ' + (active ? 'var(--primary)' : 'var(--border)'),
  background: active ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
  color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
  cursor: 'pointer',
});

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: 12,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--muted-foreground)',
  marginBottom: 4,
  display: 'block',
};

// ─── Signal Library ─────────────────────────────────────────────────────────────

const SignalLibraryPanel: React.FC<{
  library: SignalLibrary | null;
  onAdd: (s: SignalMeta) => void;
  activeIds: Set<string>;
}> = ({ library, onAdd, activeIds }) => (
  <section className="ds-panel">
    <div className="ds-panel-header">
      <span style={{ fontWeight: 600, fontSize: 13 }}>Signal Library</span>
      <span className="ds-caption">{library?.signals.length ?? 0} signals</span>
    </div>
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
      {!library && <p className="ds-caption">Loading signals…</p>}
      {library?.signals.map((s) => {
        const active = activeIds.has(s.signal_id);
        return (
          <div
            key={s.signal_id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 10,
              background: 'var(--card)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 12.5 }}>{s.label}</span>
              <TierBadge tier={s.min_tier} />
            </div>
            <p className="ds-caption" style={{ margin: '6px 0', lineHeight: 1.4 }}>{s.description}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <code style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{s.source_columns.join(', ')}</code>
              <button
                onClick={() => onAdd(s)}
                disabled={active}
                style={{
                  ...tabBtn(false),
                  padding: '3px 8px',
                  opacity: active ? 0.5 : 1,
                  cursor: active ? 'default' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Plus size={12} /> {active ? 'Added' : 'Add'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  </section>
);

// ─── Strategy Builder ───────────────────────────────────────────────────────────

type BuilderTab = 'templates' | 'composer' | 'advanced';

const StrategyBuilder: React.FC<{
  tab: BuilderTab;
  setTab: (t: BuilderTab) => void;
  name: string;
  setName: (s: string) => void;
  dateRange: { start_date: string; end_date: string };
  setDateRange: (r: { start_date: string; end_date: string }) => void;
  signals: SignalConfig[];
  setSignals: (s: SignalConfig[]) => void;
  entryOp: Operator;
  setEntryOp: (o: Operator) => void;
  exitOp: Operator;
  setExitOp: (o: Operator) => void;
  sizing: PositionSizing;
  setSizing: (s: PositionSizing) => void;
  comparison: boolean;
  setComparison: (b: boolean) => void;
  maxDD: number;
  setMaxDD: (n: number) => void;
  onApplyTemplate: (t: Template) => void;
  advancedJson: string;
  setAdvancedJson: (s: string) => void;
}> = (p) => {
  const updateSignal = (i: number, patch: Partial<SignalConfig>) => {
    const next = p.signals.slice();
    next[i] = { ...next[i], ...patch };
    p.setSignals(next);
  };
  const removeSignal = (i: number) => p.setSignals(p.signals.filter((_, j) => j !== i));

  return (
    <section className="ds-panel">
      <div className="ds-panel-header">
        <span style={{ fontWeight: 600, fontSize: 13 }}>Strategy Builder</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['templates', 'composer', 'advanced'] as BuilderTab[]).map((t) => (
            <button key={t} style={tabBtn(p.tab === t)} onClick={() => p.setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {p.tab === 'templates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => p.onApplyTemplate(t)}
                style={{
                  textAlign: 'left',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 12,
                  background: 'var(--card)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                <p className="ds-caption" style={{ margin: '6px 0 0', lineHeight: 1.4 }}>{t.blurb}</p>
              </button>
            ))}
          </div>
        )}

        {p.tab === 'composer' && (
          <>
            <div>
              <label style={labelStyle}>Strategy name</label>
              <input style={inputStyle} value={p.name} onChange={(e) => p.setName(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Start</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={p.dateRange.start_date}
                  onChange={(e) => p.setDateRange({ ...p.dateRange, start_date: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>End</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={p.dateRange.end_date}
                  onChange={(e) => p.setDateRange({ ...p.dateRange, end_date: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Signals ({p.signals.length})</label>
              {p.signals.length === 0 && (
                <p className="ds-caption">Add signals from the library on the left.</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.signals.map((s, i) => (
                  <div key={s.signal_id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <code style={{ fontSize: 11.5, fontWeight: 600 }}>{s.signal_id}</code>
                      <button onClick={() => removeSignal(i)} style={{ ...tabBtn(false), padding: '2px 6px' }}>
                        <X size={12} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 6 }}>
                      <div>
                        <label style={labelStyle}>Dir</label>
                        <select
                          style={inputStyle}
                          value={s.direction}
                          onChange={(e) => updateSignal(i, { direction: e.target.value as Direction })}
                        >
                          {(['Above', 'Below', 'CrossUp', 'CrossDown'] as Direction[]).map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Threshold</label>
                        <input
                          type="number"
                          step="0.01"
                          style={inputStyle}
                          value={s.threshold}
                          onChange={(e) => updateSignal(i, { threshold: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Weight</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="1"
                          style={inputStyle}
                          value={s.weight}
                          onChange={(e) => updateSignal(i, { weight: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Entry combine</label>
                <select style={inputStyle} value={p.entryOp} onChange={(e) => p.setEntryOp(e.target.value as Operator)}>
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Exit combine</label>
                <select style={inputStyle} value={p.exitOp} onChange={(e) => p.setExitOp(e.target.value as Operator)}>
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Position sizing</label>
                <select
                  style={inputStyle}
                  value={p.sizing.method}
                  onChange={(e) => {
                    const m = e.target.value as PositionSizing['method'];
                    if (m === 'FixedFractional') p.setSizing({ method: m, fraction: 0.5 });
                    else if (m === 'Kelly') p.setSizing({ method: m, kelly_fraction: 0.5 });
                    else if (m === 'VolTarget') p.setSizing({ method: m, target_annual_vol: 0.1 });
                    else p.setSizing({ method: 'EqualWeight' });
                  }}
                >
                  <option value="VolTarget">Vol Target</option>
                  <option value="Kelly">Fractional Kelly</option>
                  <option value="FixedFractional">Fixed Fractional</option>
                  <option value="EqualWeight">Equal Weight</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Max drawdown %</label>
                <input
                  type="number"
                  step="1"
                  style={inputStyle}
                  value={p.maxDD}
                  onChange={(e) => p.setMaxDD(Number(e.target.value))}
                />
              </div>
            </div>

            {p.sizing.method === 'VolTarget' && (
              <div>
                <label style={labelStyle}>Target annual vol</label>
                <input
                  type="number"
                  step="0.01"
                  style={inputStyle}
                  value={p.sizing.target_annual_vol ?? 0.1}
                  onChange={(e) => p.setSizing({ method: 'VolTarget', target_annual_vol: Number(e.target.value) })}
                />
              </div>
            )}
            {p.sizing.method === 'Kelly' && (
              <div>
                <label style={labelStyle}>Kelly fraction</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  style={inputStyle}
                  value={p.sizing.kelly_fraction ?? 0.5}
                  onChange={(e) => p.setSizing({ method: 'Kelly', kelly_fraction: Number(e.target.value) })}
                />
              </div>
            )}
            {p.sizing.method === 'FixedFractional' && (
              <div>
                <label style={labelStyle}>Fraction</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  style={inputStyle}
                  value={p.sizing.fraction}
                  onChange={(e) => p.setSizing({ method: 'FixedFractional', fraction: Number(e.target.value) })}
                />
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={p.comparison} onChange={(e) => p.setComparison(e.target.checked)} />
              Compare against 12-1 momentum baseline
            </label>
          </>
        )}

        {p.tab === 'advanced' && (
          <div>
            <label style={labelStyle}>StrategySpec JSON</label>
            <textarea
              spellCheck={false}
              style={{ ...inputStyle, minHeight: 420, fontFamily: 'monospace', fontSize: 11.5, lineHeight: 1.5 }}
              value={p.advancedJson}
              onChange={(e) => p.setAdvancedJson(e.target.value)}
            />
            <p className="ds-caption" style={{ marginTop: 6 }}>
              Edited JSON is used verbatim on Run. Switch tabs to regenerate from the composer.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

// ─── Results: equity chart with regime bands ────────────────────────────────────

const EquityChart: React.FC<{ results: BacktestResults }> = ({ results }) => {
  const data = useMemo(
    () =>
      results.equity_curve.map((p) => ({
        t: p.timestamp,
        equity: p.value,
        drawdown: p.drawdown,
        state: p.regime_state,
      })),
    [results],
  );

  // Contiguous regime segments → shaded reference areas.
  const segments = useMemo(() => {
    const segs: { x1: string; x2: string; state: number }[] = [];
    const ec = results.equity_curve;
    if (!ec.length) return segs;
    let start = 0;
    for (let i = 1; i <= ec.length; i++) {
      if (i === ec.length || ec[i].regime_state !== ec[start].regime_state) {
        segs.push({ x1: ec[start].timestamp, x2: ec[i - 1].timestamp, state: ec[start].regime_state });
        start = i;
      }
    }
    return segs;
  }, [results]);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        {segments.map((s, i) => (
          <ReferenceArea
            key={i}
            x1={s.x1}
            x2={s.x2}
            fill={regimeColor(s.state)}
            fillOpacity={0.1}
            stroke="none"
          />
        ))}
        <XAxis
          dataKey="t"
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          tickFormatter={(t: string) => (t ?? '').slice(0, 7)}
          minTickGap={48}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          tickFormatter={(v: number) => v.toFixed(2)}
          domain={['auto', 'auto']}
          width={48}
        />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}
          formatter={(v: number, name: string) =>
            name === 'equity' ? [v.toFixed(3), 'Equity'] : [`${(v * 100).toFixed(1)}%`, 'Drawdown']
          }
          labelFormatter={(t: string) => t}
        />
        <Area dataKey="drawdown" stroke="none" fill="var(--ds-loss)" fillOpacity={0.12} />
        <Line dataKey="equity" stroke="var(--chart-1)" strokeWidth={1.8} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

// ─── Metrics grid ───────────────────────────────────────────────────────────────

const MetricTile: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--card)' }}>
    <div style={{ ...labelStyle, marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>{value}</div>
    {hint && <div className="ds-caption" style={{ marginTop: 2 }}>{hint}</div>}
  </div>
);

const MetricsGrid: React.FC<{ m: AggregateMetrics }> = ({ m }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
    <MetricTile label="Sharpe (Lo-adj)" value={f2(m.sharpe_ratio)} />
    <MetricTile label="Deflated Sharpe" value={fProb(m.deflated_sharpe_ratio)} hint="P(true SR > exp-max)" />
    <MetricTile label="Probabilistic SR" value={fProb(m.probabilistic_sharpe_ratio)} hint="P(SR > 0)" />
    <MetricTile label="Sortino" value={f2(m.sortino_ratio)} />
    <MetricTile label="Calmar" value={f2(m.calmar_ratio)} />
    <MetricTile label="CAGR" value={fPct(m.cagr)} />
    <MetricTile label="Annual Vol" value={fPct(m.annual_volatility)} />
    <MetricTile label="Max Drawdown" value={fPct(m.max_drawdown)} />
    <MetricTile label="Win Rate" value={fPct(m.win_rate)} />
    <MetricTile label="Profit Factor" value={f2(m.profit_factor)} />
    <MetricTile label="Trades" value={String(m.total_trades)} hint={`avg ${m.avg_trade_duration_days.toFixed(0)}d`} />
    <MetricTile label="Skew / Kurt" value={`${f2(m.skewness)} / ${f2(m.excess_kurtosis)}`} />
  </div>
);

// ─── Comparison + regime + trades ───────────────────────────────────────────────

const ComparisonPanel: React.FC<{ results: BacktestResults }> = ({ results }) => {
  const c = results.comparison;
  if (!c) return null;
  return (
    <section className="ds-panel">
      <div className="ds-panel-header">
        <span style={{ fontWeight: 600, fontSize: 13 }}>Signal Value vs 12-1 Momentum Baseline</span>
        <span className="ds-caption">value score {fProb(c.signal_value_score)}</span>
      </div>
      <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        <MetricTile label="Δ Sharpe" value={f2(c.sharpe_delta)} hint="enhanced − baseline" />
        <MetricTile label="Drawdown Reduction" value={`${c.drawdown_reduction_pct.toFixed(1)}%`} />
        <MetricTile label="Enhanced Sharpe" value={f2(c.enhanced_metrics.sharpe_ratio)} />
        <MetricTile label="Baseline Sharpe" value={f2(c.baseline_metrics.sharpe_ratio)} />
        <MetricTile label="Enhanced MaxDD" value={fPct(c.enhanced_metrics.max_drawdown)} />
        <MetricTile label="Baseline MaxDD" value={fPct(c.baseline_metrics.max_drawdown)} />
      </div>
    </section>
  );
};

const RegimeBreakdown: React.FC<{ results: BacktestResults }> = ({ results }) => {
  const rows: { label: string; m: PartitionMetrics; state: number }[] = [
    { label: REGIME_LABELS[0], m: results.regime_metrics.risk_on, state: 0 },
    { label: REGIME_LABELS[1], m: results.regime_metrics.transitional, state: 1 },
    { label: REGIME_LABELS[2], m: results.regime_metrics.risk_off, state: 2 },
  ];
  return (
    <section className="ds-panel">
      <div className="ds-panel-header">
        <span style={{ fontWeight: 600, fontSize: 13 }}>Performance by Regime</span>
      </div>
      <div style={{ padding: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'right', color: 'var(--muted-foreground)' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px' }}>Regime</th>
              <th style={{ padding: '4px 8px' }}>Days</th>
              <th style={{ padding: '4px 8px' }}>Sharpe</th>
              <th style={{ padding: '4px 8px' }}>Ann. Return</th>
              <th style={{ padding: '4px 8px' }}>Max DD</th>
              <th style={{ padding: '4px 8px' }}>Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} style={{ textAlign: 'right', borderTop: '1px solid var(--border)' }}>
                <td style={{ textAlign: 'left', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: regimeColor(r.state) }} />
                  {r.label}
                </td>
                <td style={{ padding: '6px 8px' }}>{r.m.days_in_regime}</td>
                <td style={{ padding: '6px 8px' }}>{f2(r.m.sharpe_ratio)}</td>
                <td style={{ padding: '6px 8px' }}>{fPct(r.m.annualized_return)}</td>
                <td style={{ padding: '6px 8px' }}>{fPct(r.m.max_drawdown)}</td>
                <td style={{ padding: '6px 8px' }}>{fPct(r.m.win_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const TradeLog: React.FC<{ results: BacktestResults }> = ({ results }) => (
  <section className="ds-panel">
    <div className="ds-panel-header">
      <span style={{ fontWeight: 600, fontSize: 13 }}>Trade Log</span>
      <span className="ds-caption">{results.trade_log.length} trades</span>
    </div>
    <div style={{ padding: 12, maxHeight: 320, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
        <thead>
          <tr style={{ textAlign: 'right', color: 'var(--muted-foreground)' }}>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Entry</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Exit</th>
            <th style={{ padding: '4px 8px' }}>Days</th>
            <th style={{ padding: '4px 8px' }}>Regime</th>
            <th style={{ padding: '4px 8px' }}>PnL</th>
          </tr>
        </thead>
        <tbody>
          {results.trade_log.slice(0, 200).map((t, i) => (
            <tr key={i} style={{ textAlign: 'right', borderTop: '1px solid var(--border)' }}>
              <td style={{ textAlign: 'left', padding: '5px 8px' }}>{t.entry_ts}</td>
              <td style={{ textAlign: 'left', padding: '5px 8px' }}>{t.exit_ts}</td>
              <td style={{ padding: '5px 8px' }}>{t.duration_days.toFixed(0)}</td>
              <td style={{ padding: '5px 8px', color: regimeColor(t.regime_at_entry) }}>
                {REGIME_LABELS[t.regime_at_entry] ?? t.regime_at_entry}
              </td>
              <td style={{ padding: '5px 8px', color: t.pnl_pct >= 0 ? 'var(--ds-gain)' : 'var(--ds-loss)', fontWeight: 600 }}>
                {fPct(t.pnl_pct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

// ─── Page ───────────────────────────────────────────────────────────────────────

export const Backtesting: React.FC = () => {
  const [library, setLibrary] = useState<SignalLibrary | null>(null);

  // Builder state
  const [tab, setTab] = useState<BuilderTab>('templates');
  const [name, setName] = useState('Risk-On Regime Trend');
  const [dateRange, setDateRange] = useState({ start_date: '2015-01-01', end_date: TODAY });
  const [signals, setSignals] = useState<SignalConfig[]>(TEMPLATES[0].signals);
  const [entryOp, setEntryOp] = useState<Operator>('AND');
  const [exitOp, setExitOp] = useState<Operator>('OR');
  const [sizing, setSizing] = useState<PositionSizing>(TEMPLATES[0].sizing);
  const [comparison, setComparison] = useState(true);
  const [maxDD, setMaxDD] = useState(25);
  const [advancedJson, setAdvancedJson] = useState('');

  // Run state
  const [running, setRunning] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [results, setResults] = useState<BacktestResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSignalLibrary()
      .then(setLibrary)
      .catch(() => setLibrary({ signals: [] }));
  }, []);

  const currentSpec = useMemo(
    () =>
      buildSpec(
        { name, date_range: dateRange, risk_params: { max_drawdown_pct: maxDD, position_cap_pct: 100, rebalance_freq: 'Daily', risk_per_trade_pct: 1, min_rr: 2 } },
        signals,
        entryOp,
        exitOp,
        sizing,
        comparison,
      ),
    [name, dateRange, signals, entryOp, exitOp, sizing, comparison, maxDD],
  );

  // Keep the advanced JSON in sync when leaving the composer/templates.
  const goTab = (t: BuilderTab) => {
    if (t === 'advanced') setAdvancedJson(JSON.stringify(currentSpec, null, 2));
    setTab(t);
  };

  const applyTemplate = (t: Template) => {
    setName(t.name);
    setSignals(t.signals);
    setSizing(t.sizing);
    setEntryOp(t.entryOp);
    setExitOp(t.exitOp);
    setTab('composer');
  };

  const addSignal = (s: SignalMeta) => {
    if (signals.some((x) => x.signal_id === s.signal_id)) return;
    const threshold = s.signal_type === 'MacroRegime' && s.unit === 'probability' ? 0.5 : 0;
    setSignals([...signals, { signal_id: s.signal_id, signal_type: s.signal_type, threshold, direction: 'Above', weight: 1 }]);
    if (tab === 'templates') setTab('composer');
  };

  const onRun = async () => {
    setError(null);
    setValidation(null);
    let spec: StrategySpec;
    try {
      spec = tab === 'advanced' ? (JSON.parse(advancedJson) as StrategySpec) : currentSpec;
    } catch {
      setError('Advanced JSON is not valid JSON.');
      return;
    }
    setRunning(true);
    try {
      const v = await validateStrategy(spec);
      setValidation(v);
      if (!v.valid) {
        setRunning(false);
        return;
      }
      const res = await runBacktest(spec);
      setResults(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backtest failed.');
    } finally {
      setRunning(false);
    }
  };

  const activeIds = useMemo(() => new Set(signals.map((s) => s.signal_id)), [signals]);

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto', padding: '0 4px 40px' }}>
      <PageHeader
        title="Backtesting"
        subtitle="Regime-conditioned strategy backtesting on the institutional execution engine — Lo-adjusted Sharpe, Deflated Sharpe, causal HMM regimes, realistic costs."
        actions={
          <button
            onClick={onRun}
            disabled={running}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              fontWeight: 600,
              fontSize: 13,
              cursor: running ? 'default' : 'pointer',
              opacity: running ? 0.7 : 1,
            }}
          >
            {running ? <Loader2 size={15} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Play size={15} />}
            {running ? 'Running…' : 'Run Backtest'}
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 420px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* Left column: builder + library */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <StrategyBuilder
            tab={tab}
            setTab={goTab}
            name={name}
            setName={setName}
            dateRange={dateRange}
            setDateRange={setDateRange}
            signals={signals}
            setSignals={setSignals}
            entryOp={entryOp}
            setEntryOp={setEntryOp}
            exitOp={exitOp}
            setExitOp={setExitOp}
            sizing={sizing}
            setSizing={setSizing}
            comparison={comparison}
            setComparison={setComparison}
            maxDD={maxDD}
            setMaxDD={setMaxDD}
            onApplyTemplate={applyTemplate}
            advancedJson={advancedJson}
            setAdvancedJson={setAdvancedJson}
          />
          <SignalLibraryPanel library={library} onAdd={addSignal} activeIds={activeIds} />
        </div>

        {/* Right column: results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {validation && (validation.errors.length > 0 || validation.warnings.length > 0 || validation.tier_requirements.length > 0) && (
            <section className="ds-panel" style={{ padding: 14 }}>
              {validation.errors.map((e, i) => (
                <div key={`e${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--ds-loss)', fontSize: 12.5, marginBottom: 4 }}>
                  <AlertTriangle size={14} /> {e}
                </div>
              ))}
              {validation.warnings.map((w, i) => (
                <div key={`w${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#C79A3C', fontSize: 12.5, marginBottom: 4 }}>
                  <AlertTriangle size={14} /> {w}
                </div>
              ))}
              {validation.tier_requirements.map((t, i) => (
                <div key={`t${i}`} style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}>{t}</div>
              ))}
            </section>
          )}

          {error && (
            <section className="ds-panel" style={{ padding: 14, color: 'var(--ds-loss)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertTriangle size={16} /> {error}
            </section>
          )}

          {!results && !running && !error && (
            <section className="ds-panel" style={{ padding: 48, textAlign: 'center' }}>
              <FlaskConical size={28} style={{ color: 'var(--muted-foreground)', marginBottom: 10 }} />
              <p style={{ fontWeight: 600, marginBottom: 4 }}>No backtest run yet</p>
              <p className="ds-caption" style={{ maxWidth: 420, margin: '0 auto' }}>
                Pick a template or compose a strategy on the left, then Run Backtest. Results are computed on the Rust execution engine with causal regime labels and realistic costs.
              </p>
            </section>
          )}

          {results && (
            <>
              <section className="ds-panel">
                <div className="ds-panel-header">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={15} style={{ color: 'var(--ds-gain)' }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Equity Curve · regime-shaded</span>
                  </span>
                  <span className="ds-caption">{results.bars} bars · through {results.data_through}</span>
                </div>
                <div style={{ padding: 12 }}>
                  <EquityChart results={results} />
                  <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                    {REGIME_LABELS.map((l, i) => (
                      <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted-foreground)' }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: regimeColor(i), opacity: 0.6 }} />
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              </section>

              <section className="ds-panel" style={{ padding: 14 }}>
                <MetricsGrid m={results.aggregate_metrics} />
              </section>

              <ComparisonPanel results={results} />
              <RegimeBreakdown results={results} />
              <TradeLog results={results} />
            </>
          )}

          <Disclaimer />
        </div>
      </div>
    </div>
  );
};
