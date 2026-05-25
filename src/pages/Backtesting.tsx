import React, { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import {
  Play,
  Plus,
  X,
  AlertTriangle,
  Loader2,
  FlaskConical,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
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
    blurb: 'Hold while the HMM filtered probability of the risk-on regime is dominant. Vol-targeted.',
    signals: [{ signal_id: 'macro_regime_risk_on', signal_type: 'MacroRegime', threshold: 0.5, direction: 'Above', weight: 1 }],
    sizing: { method: 'VolTarget', target_annual_vol: 0.1 },
    entryOp: 'AND',
    exitOp: 'OR',
  },
  {
    key: 'curve_defensive',
    name: 'Yield-Curve Defensive',
    blurb: 'Reduce exposure when the 10y-2y term spread inverts. Half-Kelly sizing.',
    signals: [{ signal_id: 'yield_curve_10y2y', signal_type: 'YieldSpread', threshold: 0, direction: 'Above', weight: 1 }],
    sizing: { method: 'Kelly', kelly_fraction: 0.5 },
    entryOp: 'AND',
    exitOp: 'OR',
  },
  {
    key: 'liquidity_macro',
    name: 'Liquidity + Regime',
    blurb: 'Hold when net liquidity is expanding AND the macro regime is risk-on.',
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

const f2 = (x?: number) => (x === undefined || !isFinite(x) ? '—' : x.toFixed(2));
const fPct = (x?: number) => (x === undefined || !isFinite(x) ? '—' : `${(x * 100).toFixed(1)}%`);
const fProb = (x?: number) => (x === undefined || !isFinite(x) ? '—' : `${(x * 100).toFixed(0)}%`);
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

// ─── UI atoms ───────────────────────────────────────────────────────────────────

const Pill: React.FC<{ children: React.ReactNode; tone?: 'neutral' | 'brand' | 'gain' | 'loss' }> = ({
  children,
  tone = 'neutral',
}) => {
  const cls =
    tone === 'brand' ? 'ds-pill-critical' : tone === 'gain' ? 'ds-pill-low' : tone === 'loss' ? 'ds-pill-high' : 'ds-pill-neutral';
  return (
    <span className={`ds-tag ${cls}`} style={{ textTransform: 'uppercase' }}>
      {children}
    </span>
  );
};

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'inline-flex', borderRadius: 7, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--card)' }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: '5px 11px',
              fontSize: 11.5,
              fontWeight: 600,
              background: active ? 'var(--primary)' : 'transparent',
              color: active ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Hero KPI tile — the headline result numbers. */
const Kpi: React.FC<{ label: string; value: string; sub?: string; tone?: 'gain' | 'loss' | 'neutral'; accent?: boolean }> = ({
  label,
  value,
  sub,
  tone = 'neutral',
  accent,
}) => {
  const color = tone === 'gain' ? 'var(--ds-gain)' : tone === 'loss' ? 'var(--ds-loss)' : 'var(--foreground)';
  return (
    <div
      className="ds-surface"
      style={{
        padding: '13px 15px',
        borderRadius: 10,
        display: 'grid',
        gap: 5,
        background: accent ? 'color-mix(in srgb, var(--primary) 5%, var(--card))' : 'var(--card)',
        borderColor: accent ? 'color-mix(in srgb, var(--primary) 30%, var(--border))' : 'var(--border)',
      }}
    >
      <span className="ds-label">{label}</span>
      <span style={{ ...num, fontSize: 23, fontWeight: 650, letterSpacing: '-0.02em', color, lineHeight: 1.1 }}>{value}</span>
      {sub && <span className="ds-caption" style={{ fontSize: 10 }}>{sub}</span>}
    </div>
  );
};

const fieldLabel: React.CSSProperties = { display: 'block', marginBottom: 5 };

// ─── Signal Library ─────────────────────────────────────────────────────────────

const SignalLibraryPanel: React.FC<{ library: SignalLibrary | null; onAdd: (s: SignalMeta) => void; activeIds: Set<string> }> = ({
  library,
  onAdd,
  activeIds,
}) => (
  <section className="ds-panel">
    <div className="ds-panel-header">
      <span className="ds-heading">Signal Library</span>
      <span className="ds-caption">{library?.signals.length ?? 0} signals</span>
    </div>
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
      {!library && <p className="ds-caption">Loading signals…</p>}
      {library?.signals.map((s) => {
        const active = activeIds.has(s.signal_id);
        return (
          <div key={s.signal_id} className="ds-surface-ghost ds-transition-fast" style={{ padding: 11, borderRadius: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span className="ds-heading" style={{ fontSize: 12.5 }}>{s.label}</span>
              <Pill tone="brand">{s.min_tier}</Pill>
            </div>
            <p className="ds-caption" style={{ margin: '6px 0', lineHeight: 1.45 }}>{s.description}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <code style={{ fontSize: 9.5, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                {s.source_columns.slice(0, 3).join(' · ')}
              </code>
              <button
                className={active ? 'ds-btn ds-btn-ghost' : 'ds-btn ds-btn-outline'}
                onClick={() => onAdd(s)}
                disabled={active}
                style={{ height: 26, padding: '0 10px', fontSize: 11 }}
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
      <div className="ds-panel-header" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className="ds-heading">Strategy Builder</span>
        <Segmented
          value={p.tab}
          onChange={p.setTab}
          options={[
            { value: 'templates', label: 'Templates' },
            { value: 'composer', label: 'Composer' },
            { value: 'advanced', label: 'Advanced' },
          ]}
        />
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {p.tab === 'templates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => p.onApplyTemplate(t)}
                className="ds-surface-ghost ds-transition-fast"
                style={{ textAlign: 'left', padding: 12, borderRadius: 9, cursor: 'pointer' }}
              >
                <div className="ds-heading">{t.name}</div>
                <p className="ds-caption" style={{ margin: '6px 0 0', lineHeight: 1.45 }}>{t.blurb}</p>
                <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                  {t.signals.map((s) => (
                    <Pill key={s.signal_id}>{s.signal_id}</Pill>
                  ))}
                  <Pill tone="brand">{t.sizing.method}</Pill>
                </div>
              </button>
            ))}
          </div>
        )}

        {p.tab === 'composer' && (
          <>
            <div>
              <label className="ds-label" style={fieldLabel}>Strategy name</label>
              <input className="ds-input" value={p.name} onChange={(e) => p.setName(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="ds-label" style={fieldLabel}>Start</label>
                <input className="ds-input" type="date" value={p.dateRange.start_date} onChange={(e) => p.setDateRange({ ...p.dateRange, start_date: e.target.value })} />
              </div>
              <div>
                <label className="ds-label" style={fieldLabel}>End</label>
                <input className="ds-input" type="date" value={p.dateRange.end_date} onChange={(e) => p.setDateRange({ ...p.dateRange, end_date: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="ds-label" style={fieldLabel}>Signals ({p.signals.length})</label>
              {p.signals.length === 0 && <p className="ds-caption">Add signals from the library below.</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.signals.map((s, i) => (
                  <div key={s.signal_id} className="ds-surface-inset" style={{ padding: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <code style={{ fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{s.signal_id}</code>
                      <button className="ds-btn ds-btn-ghost" onClick={() => removeSignal(i)} style={{ height: 22, width: 22, padding: 0 }}>
                        <X size={12} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.8fr', gap: 6, marginTop: 7 }}>
                      <div>
                        <label className="ds-label" style={fieldLabel}>Dir</label>
                        <select className="ds-input" value={s.direction} onChange={(e) => updateSignal(i, { direction: e.target.value as Direction })}>
                          {(['Above', 'Below', 'CrossUp', 'CrossDown'] as Direction[]).map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="ds-label" style={fieldLabel}>Threshold</label>
                        <input className="ds-input" type="number" step="0.01" value={s.threshold} onChange={(e) => updateSignal(i, { threshold: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="ds-label" style={fieldLabel}>Weight</label>
                        <input className="ds-input" type="number" step="0.1" min="0" max="1" value={s.weight} onChange={(e) => updateSignal(i, { weight: Number(e.target.value) })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="ds-label" style={fieldLabel}>Entry combine</label>
                <Segmented value={p.entryOp} onChange={p.setEntryOp} options={[{ value: 'AND', label: 'AND' }, { value: 'OR', label: 'OR' }]} />
              </div>
              <div>
                <label className="ds-label" style={fieldLabel}>Exit combine</label>
                <Segmented value={p.exitOp} onChange={p.setExitOp} options={[{ value: 'AND', label: 'AND' }, { value: 'OR', label: 'OR' }]} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="ds-label" style={fieldLabel}>Position sizing</label>
                <select
                  className="ds-input"
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
                <label className="ds-label" style={fieldLabel}>Max drawdown %</label>
                <input className="ds-input" type="number" step="1" value={p.maxDD} onChange={(e) => p.setMaxDD(Number(e.target.value))} />
              </div>
            </div>

            {p.sizing.method === 'VolTarget' && (
              <div>
                <label className="ds-label" style={fieldLabel}>Target annual vol</label>
                <input className="ds-input" type="number" step="0.01" value={p.sizing.target_annual_vol ?? 0.1} onChange={(e) => p.setSizing({ method: 'VolTarget', target_annual_vol: Number(e.target.value) })} />
              </div>
            )}
            {p.sizing.method === 'Kelly' && (
              <div>
                <label className="ds-label" style={fieldLabel}>Kelly fraction</label>
                <input className="ds-input" type="number" step="0.05" min="0" max="1" value={p.sizing.kelly_fraction ?? 0.5} onChange={(e) => p.setSizing({ method: 'Kelly', kelly_fraction: Number(e.target.value) })} />
              </div>
            )}
            {p.sizing.method === 'FixedFractional' && (
              <div>
                <label className="ds-label" style={fieldLabel}>Fraction</label>
                <input className="ds-input" type="number" step="0.05" min="0" max="1" value={p.sizing.fraction} onChange={(e) => p.setSizing({ method: 'FixedFractional', fraction: Number(e.target.value) })} />
              </div>
            )}

            <label className="ds-body" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={p.comparison} onChange={(e) => p.setComparison(e.target.checked)} />
              Compare against 12-1 momentum baseline
            </label>
          </>
        )}

        {p.tab === 'advanced' && (
          <div>
            <label className="ds-label" style={fieldLabel}>StrategySpec JSON</label>
            <textarea
              spellCheck={false}
              className="ds-input"
              style={{ height: 440, padding: 10, fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.55, resize: 'vertical' }}
              value={p.advancedJson}
              onChange={(e) => p.setAdvancedJson(e.target.value)}
            />
            <p className="ds-caption" style={{ marginTop: 6 }}>Edited JSON is used verbatim on Run. Switch tabs to regenerate from the composer.</p>
          </div>
        )}
      </div>
    </section>
  );
};

// ─── Equity chart ───────────────────────────────────────────────────────────────

interface ChartDatum {
  t: string;
  equity: number;
  drawdown: number;
  state: number;
}

const ChartTooltip: React.FC<{ active?: boolean; payload?: { payload: ChartDatum }[] }> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="ds-surface" style={{ padding: '8px 10px', background: 'var(--popover)', boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>
      <div className="ds-caption" style={{ marginBottom: 4 }}>{d.t}</div>
      <div style={{ ...num, display: 'grid', gap: 2, fontSize: 11.5 }}>
        <span><strong>{d.equity.toFixed(3)}</strong> equity</span>
        <span style={{ color: 'var(--ds-loss)' }}>{(d.drawdown * 100).toFixed(1)}% drawdown</span>
        <span style={{ color: regimeColor(d.state) }}>{REGIME_LABELS[d.state] ?? d.state}</span>
      </div>
    </div>
  );
};

const EquityChart: React.FC<{ results: BacktestResults }> = ({ results }) => {
  const data = useMemo<ChartDatum[]>(
    () => results.equity_curve.map((p) => ({ t: p.timestamp, equity: p.value, drawdown: p.drawdown, state: p.regime_state })),
    [results],
  );
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
    <>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 6, right: 14, left: 0, bottom: 0 }} syncId="bt">
          <defs>
            <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          {segments.map((s, i) => (
            <ReferenceArea key={i} x1={s.x1} x2={s.x2} fill={regimeColor(s.state)} fillOpacity={0.07} stroke="none" />
          ))}
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={(t: string) => (t ?? '').slice(0, 7)} minTickGap={56} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={(v: number) => v.toFixed(2)} domain={['auto', 'auto']} width={46} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Area dataKey="equity" stroke="var(--chart-1)" strokeWidth={1.8} fill="url(#eqFill)" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {/* Underwater (drawdown) plot */}
      <ResponsiveContainer width="100%" height={84}>
        <ComposedChart data={data} margin={{ top: 2, right: 14, left: 0, bottom: 0 }} syncId="bt">
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="t" hide />
          <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} width={46} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Area dataKey="drawdown" stroke="var(--ds-loss)" strokeWidth={1.2} fill="var(--ds-loss)" fillOpacity={0.14} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
};

// ─── Regime distribution ribbon ─────────────────────────────────────────────────

const RegimeRibbon: React.FC<{ results: BacktestResults }> = ({ results }) => {
  const counts = [0, 0, 0];
  for (const p of results.equity_curve) if (p.regime_state < 3) counts[p.regime_state]++;
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {counts.map((c, i) => (
          <div key={i} style={{ width: `${(c / total) * 100}%`, background: regimeColor(i), opacity: 0.7 }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        {REGIME_LABELS.map((l, i) => (
          <span key={l} className="ds-caption" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: regimeColor(i), opacity: 0.7 }} />
            {l} <span style={{ ...num, color: 'var(--foreground)' }}>{((counts[i] / total) * 100).toFixed(0)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
};

// ─── Detailed metrics table ─────────────────────────────────────────────────────

const MetricsTable: React.FC<{ m: AggregateMetrics }> = ({ m }) => {
  const rows: [string, string, string?][] = [
    ['Sharpe (Lo-adjusted)', f2(m.sharpe_ratio)],
    ['Deflated Sharpe', fProb(m.deflated_sharpe_ratio), 'P(true SR > expected-max)'],
    ['Probabilistic Sharpe', fProb(m.probabilistic_sharpe_ratio), 'P(SR > 0)'],
    ['Sortino', f2(m.sortino_ratio)],
    ['Calmar', f2(m.calmar_ratio)],
    ['Annual volatility', fPct(m.annual_volatility)],
    ['Profit factor', f2(m.profit_factor)],
    ['Avg trade duration', `${m.avg_trade_duration_days.toFixed(0)}d`],
    ['Skewness', f2(m.skewness)],
    ['Excess kurtosis', f2(m.excess_kurtosis)],
  ];
  return (
    <table className="ds-table">
      <tbody>
        {rows.map(([k, v, hint]) => (
          <tr key={k}>
            <td style={{ color: 'var(--muted-foreground)' }}>
              {k}
              {hint && <span className="ds-caption" style={{ display: 'block', fontSize: 9.5 }}>{hint}</span>}
            </td>
            <td style={{ ...num, textAlign: 'right', fontWeight: 600 }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const ComparisonPanel: React.FC<{ results: BacktestResults }> = ({ results }) => {
  const c = results.comparison;
  if (!c) return null;
  const better = c.sharpe_delta >= 0;
  return (
    <section className="ds-panel">
      <div className="ds-panel-header">
        <span className="ds-heading">Signal Value vs 12-1 Momentum</span>
        <Pill tone={c.signal_value_score >= 0.5 ? 'gain' : 'loss'}>value {fProb(c.signal_value_score)}</Pill>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {better ? <TrendingUp size={18} style={{ color: 'var(--ds-gain)' }} /> : <TrendingDown size={18} style={{ color: 'var(--ds-loss)' }} />}
          <span style={{ ...num, fontSize: 20, fontWeight: 650, color: better ? 'var(--ds-gain)' : 'var(--ds-loss)' }}>
            {c.sharpe_delta >= 0 ? '+' : ''}{f2(c.sharpe_delta)}
          </span>
          <span className="ds-caption">Sharpe vs baseline · {c.drawdown_reduction_pct >= 0 ? '−' : '+'}{Math.abs(c.drawdown_reduction_pct).toFixed(0)}% drawdown</span>
        </div>
        <table className="ds-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th style={{ textAlign: 'right' }}>Enhanced</th>
              <th style={{ textAlign: 'right' }}>Baseline</th>
            </tr>
          </thead>
          <tbody>
            {([
              ['Sharpe', f2(c.enhanced_metrics.sharpe_ratio), f2(c.baseline_metrics.sharpe_ratio)],
              ['CAGR', fPct(c.enhanced_metrics.cagr), fPct(c.baseline_metrics.cagr)],
              ['Max drawdown', fPct(c.enhanced_metrics.max_drawdown), fPct(c.baseline_metrics.max_drawdown)],
              ['Sortino', f2(c.enhanced_metrics.sortino_ratio), f2(c.baseline_metrics.sortino_ratio)],
            ] as [string, string, string][]).map(([k, e, b]) => (
              <tr key={k}>
                <td style={{ color: 'var(--muted-foreground)' }}>{k}</td>
                <td style={{ ...num, textAlign: 'right', fontWeight: 600 }}>{e}</td>
                <td style={{ ...num, textAlign: 'right', color: 'var(--muted-foreground)' }}>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <div className="ds-panel-header"><span className="ds-heading">Performance by Regime</span></div>
      <div style={{ padding: '4px 6px', overflowX: 'auto' }}>
        <table className="ds-table">
          <thead>
            <tr>
              <th>Regime</th>
              <th style={{ textAlign: 'right' }}>Days</th>
              <th style={{ textAlign: 'right' }}>Sharpe</th>
              <th style={{ textAlign: 'right' }}>Ann. Return</th>
              <th style={{ textAlign: 'right' }}>Max DD</th>
              <th style={{ textAlign: 'right' }}>Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: regimeColor(r.state) }} />
                  {r.label}
                </td>
                <td style={{ ...num, textAlign: 'right' }}>{r.m.days_in_regime}</td>
                <td style={{ ...num, textAlign: 'right', fontWeight: 600 }}>{f2(r.m.sharpe_ratio)}</td>
                <td style={{ ...num, textAlign: 'right', color: r.m.annualized_return >= 0 ? 'var(--ds-gain)' : 'var(--ds-loss)' }}>{fPct(r.m.annualized_return)}</td>
                <td style={{ ...num, textAlign: 'right' }}>{fPct(r.m.max_drawdown)}</td>
                <td style={{ ...num, textAlign: 'right' }}>{fPct(r.m.win_rate)}</td>
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
      <span className="ds-heading">Trade Log</span>
      <span className="ds-caption">{results.trade_log.length} trades</span>
    </div>
    <div style={{ padding: '4px 6px', maxHeight: 340, overflowY: 'auto' }}>
      <table className="ds-table">
        <thead>
          <tr>
            <th>Entry</th>
            <th>Exit</th>
            <th style={{ textAlign: 'right' }}>Days</th>
            <th>Regime @ entry</th>
            <th style={{ textAlign: 'right' }}>PnL</th>
          </tr>
        </thead>
        <tbody>
          {results.trade_log.slice(0, 250).map((t, i) => (
            <tr key={i}>
              <td style={num}>{t.entry_ts}</td>
              <td style={num}>{t.exit_ts}</td>
              <td style={{ ...num, textAlign: 'right' }}>{t.duration_days.toFixed(0)}</td>
              <td>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: regimeColor(t.regime_at_entry) }} />
                  {REGIME_LABELS[t.regime_at_entry] ?? t.regime_at_entry}
                </span>
              </td>
              <td style={{ ...num, textAlign: 'right', fontWeight: 600, color: t.pnl_pct >= 0 ? 'var(--ds-gain)' : 'var(--ds-loss)' }}>{fPct(t.pnl_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

// ─── Results zone ───────────────────────────────────────────────────────────────

const ResultsZone: React.FC<{ results: BacktestResults }> = ({ results }) => {
  const m = results.aggregate_metrics;
  return (
    <>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 10 }}>
        <Kpi label="CAGR" value={fPct(m.cagr)} tone={m.cagr >= 0 ? 'gain' : 'loss'} accent />
        <Kpi label="Sharpe" value={f2(m.sharpe_ratio)} sub="Lo-adjusted" tone={m.sharpe_ratio >= 1 ? 'gain' : 'neutral'} />
        <Kpi label="Deflated SR" value={fProb(m.deflated_sharpe_ratio)} sub="probability" />
        <Kpi label="Max Drawdown" value={fPct(m.max_drawdown)} tone="loss" />
        <Kpi label="Sortino" value={f2(m.sortino_ratio)} />
        <Kpi label="Calmar" value={f2(m.calmar_ratio)} />
        <Kpi label="Win Rate" value={fPct(m.win_rate)} sub={`${m.total_trades} trades`} />
      </section>

      <section className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <span className="ds-heading">Equity Curve · regime-shaded</span>
          <span className="ds-caption" style={num}>{results.bars} bars · through {results.data_through}</span>
        </div>
        <EquityChart results={results} />
        <RegimeRibbon results={results} />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: results.comparison ? '1fr 1fr' : '1fr', gap: 16, alignItems: 'start' }}>
        <section className="ds-panel">
          <div className="ds-panel-header"><span className="ds-heading">Risk-Adjusted Metrics</span></div>
          <div style={{ padding: '4px 6px' }}><MetricsTable m={m} /></div>
        </section>
        <ComparisonPanel results={results} />
      </div>

      <RegimeBreakdown results={results} />
      <TradeLog results={results} />
    </>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────────────

export const Backtesting: React.FC = () => {
  const [library, setLibrary] = useState<SignalLibrary | null>(null);

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

  const [running, setRunning] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [results, setResults] = useState<BacktestResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSignalLibrary().then(setLibrary).catch(() => setLibrary({ signals: [] }));
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
  const hasValidationNotes =
    validation && (validation.errors.length > 0 || validation.warnings.length > 0 || validation.tier_requirements.length > 0);

  return (
    <div style={{ padding: '0 24px 36px', maxWidth: 1520, margin: '0 auto' }}>
      <PageHeader
        title="Backtesting"
        subtitle="Regime-conditioned strategy backtesting on the institutional execution engine — Lo-adjusted Sharpe, Deflated Sharpe, causal HMM regimes, and realistic transaction costs."
        actions={
          <button className="ds-btn ds-btn-primary" onClick={onRun} disabled={running} style={{ height: '2.375rem', padding: '0 18px', fontSize: 13 }}>
            {running ? <Loader2 size={15} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Play size={15} />}
            {running ? 'Running…' : 'Run Backtest'}
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 400px) 1fr', gap: 18, alignItems: 'start' }}>
        {/* Left: builder + library */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 16 }}>
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

        {/* Right: results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {hasValidationNotes && (
            <section className="ds-panel" style={{ padding: 14, display: 'grid', gap: 5 }}>
              {validation!.errors.map((e, i) => (
                <div key={`e${i}`} className="ds-sev-critical" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                  <AlertTriangle size={14} /> {e}
                </div>
              ))}
              {validation!.warnings.map((w, i) => (
                <div key={`w${i}`} className="ds-sev-medium" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                  <AlertTriangle size={14} /> {w}
                </div>
              ))}
              {validation!.tier_requirements.map((t, i) => (
                <div key={`t${i}`} className="ds-caption">{t}</div>
              ))}
            </section>
          )}

          {error && (
            <section className="ds-panel ds-sev-critical" style={{ padding: 14, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertTriangle size={16} /> {error}
            </section>
          )}

          {running && !results && (
            <section className="ds-panel ds-empty">
              <div className="ds-spinner" style={{ width: 26, height: 26 }} />
              <p className="ds-heading">Running backtest…</p>
              <p className="ds-caption" style={{ maxWidth: 420 }}>Fitting the regime model and simulating execution with realistic costs. This can take a few seconds on a cold engine.</p>
            </section>
          )}

          {!results && !running && !error && !hasValidationNotes && (
            <section className="ds-panel">
              <div className="ds-empty">
                <div className="ds-empty-icon"><FlaskConical size={22} /></div>
                <p className="ds-heading">No backtest run yet</p>
                <p className="ds-caption" style={{ maxWidth: 440 }}>
                  Pick a template or compose a strategy on the left, then Run Backtest. Results are computed on the Rust execution engine with causal regime labels and realistic costs.
                </p>
              </div>
            </section>
          )}

          {results && <ResultsZone results={results} />}

          <Disclaimer />
        </div>
      </div>
    </div>
  );
};
