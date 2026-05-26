import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import {
  Play,
  Plus,
  X,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Info,
  BarChart2,
  DollarSign,
  Activity,
  Zap,
  BookOpen,
  Lock,
} from 'lucide-react';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import { useBacktest, type BacktestStep } from '../hooks/useBacktest';
import {
  getSignalLibrary,
  validateStrategy,
  requestCommentary,
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
  type AggregateMetrics,
  type PartitionMetrics,
} from '../services/backtest';

// ─── Constants ──────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function invert(d: Direction): Direction {
  switch (d) {
    case 'Above': return 'Below';
    case 'Below': return 'Above';
    case 'CrossUp': return 'CrossDown';
    case 'CrossDown': return 'CrossUp';
  }
}

function buildSpec(
  base: Partial<StrategySpec>,
  signals: SignalConfig[],
  entryOp: Operator,
  exitOp: Operator,
  sizing: PositionSizing,
  comparison: boolean,
  instrument: string,
  startingCapital: number,
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
      max_drawdown_pct: 0.25,
      position_cap_pct: 1.0,
      rebalance_freq: 'Daily',
      risk_per_trade_pct: 1.0,
      min_rr: 2.0,
    },
    comparison_mode: comparison,
    cost_model: base.cost_model ?? { commission_bps: 1, slippage_bps: 2 },
    instrument,
    starting_capital: startingCapital,
  };
}

const fmt = {
  dollar: (x: number) =>
    x >= 1_000_000
      ? `$${(x / 1_000_000).toFixed(2)}M`
      : x >= 1_000
      ? `$${(x / 1_000).toFixed(1)}K`
      : `$${x.toFixed(0)}`,
  pct: (x: number) => `${(x * 100).toFixed(1)}%`,
  pct2: (x: number) => `${(x * 100).toFixed(2)}%`,
  f2: (x: number) => (isFinite(x) ? x.toFixed(2) : '—'),
  f3: (x: number) => (isFinite(x) ? x.toFixed(3) : '—'),
  int: (x: number) => (isFinite(x) ? Math.round(x).toLocaleString() : '—'),
};

function pnlTone(x: number): 'gain' | 'loss' | 'neutral' {
  if (x > 0.005) return 'gain';
  if (x < -0.005) return 'loss';
  return 'neutral';
}

// ─── UI atoms ─────────────────────────────────────────────────────────────────────

const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

const TierGate: React.FC<{ tier: string; children: React.ReactNode }> = ({ tier, children }) => (
  <div style={{ position: 'relative', display: 'contents' }}>
    <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none' }}>{children}</div>
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'color-mix(in srgb, var(--card) 80%, transparent)',
      borderRadius: 8,
    }}>
      <span className="ds-tag ds-pill-critical" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
        <Lock size={10} /> {tier}+
      </span>
    </div>
  </div>
);

const Kpi: React.FC<{
  label: string;
  value: string;
  sub?: string;
  tone?: 'gain' | 'loss' | 'neutral';
  accent?: boolean;
  onClick?: () => void;
}> = ({ label, value, sub, tone = 'neutral', accent, onClick }) => {
  const color = tone === 'gain' ? 'var(--ds-gain)' : tone === 'loss' ? 'var(--ds-loss)' : 'var(--foreground)';
  return (
    <div
      className="ds-surface ds-transition-fast"
      onClick={onClick}
      style={{
        padding: '14px 16px',
        borderRadius: 10,
        display: 'grid',
        gap: 5,
        cursor: onClick ? 'pointer' : 'default',
        background: accent ? 'color-mix(in srgb, var(--primary) 6%, var(--card))' : 'var(--card)',
        borderColor: accent ? 'color-mix(in srgb, var(--primary) 30%, var(--border))' : 'var(--border)',
      }}
    >
      <span className="ds-label">{label}</span>
      <span style={{ ...num, fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', color, lineHeight: 1.1 }}>{value}</span>
      {sub && <span className="ds-caption" style={{ fontSize: 10 }}>{sub}</span>}
    </div>
  );
};

const SectionHeader: React.FC<{ icon?: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode }> = ({
  icon, title, subtitle, action,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
    {icon && <span style={{ color: 'var(--primary)', display: 'flex' }}>{icon}</span>}
    <div style={{ flex: 1 }}>
      <span className="ds-heading" style={{ fontSize: 13 }}>{title}</span>
      {subtitle && <span className="ds-caption" style={{ marginLeft: 8 }}>{subtitle}</span>}
    </div>
    {action}
  </div>
);

// ─── Step Trace ─────────────────────────────────────────────────────────────────

const StepTrace: React.FC<{ steps: BacktestStep[] }> = ({ steps }) => (
  <div className="ds-panel" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
    <SectionHeader icon={<Activity size={13} />} title="Execution trace" />
    {steps.map((step) => {
      const isActive = step.state === 'active';
      const isDone = step.state === 'done';
      const isFailed = step.state === 'failed';
      const color = isFailed
        ? 'var(--ds-loss)'
        : isDone
        ? 'var(--ds-gain)'
        : isActive
        ? 'var(--primary)'
        : 'var(--muted-foreground)';
      return (
        <div key={step.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
            {isActive && <Loader2 size={10} style={{ color, animation: 'spin 1s linear infinite' }} />}
            {isDone && <span style={{ fontSize: 9, color }}>✓</span>}
            {isFailed && <span style={{ fontSize: 9, color }}>✗</span>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color }}>{step.label}</span>
            </div>
            {step.detail && <p className="ds-caption" style={{ marginTop: 2 }}>{step.detail}</p>}
            {step.error && <p className="ds-caption" style={{ marginTop: 2, color: 'var(--ds-loss)' }}>{step.error}</p>}
          </div>
        </div>
      );
    })}
  </div>
);

// ─── Commentary Modal ────────────────────────────────────────────────────────────

const CommentaryModal: React.FC<{ title: string; narrative: string | null; onClose: () => void }> = ({
  title, narrative, onClose,
}) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'color-mix(in srgb, var(--background) 60%, transparent)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }} onClick={onClose}>
    <div
      className="ds-panel"
      style={{ maxWidth: 560, width: '100%', margin: '0 16px', padding: '20px 22px' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span className="ds-heading" style={{ fontSize: 13 }}>{title}</span>
        <button className="ds-btn ds-btn-ghost" onClick={onClose} style={{ height: 26, width: 26, padding: 0 }}>
          <X size={13} />
        </button>
      </div>
      {narrative
        ? <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--foreground)', margin: 0 }}>{narrative}</p>
        : <p className="ds-caption">Generating commentary…</p>}
    </div>
  </div>
);

// ─── NLP Command Bar ─────────────────────────────────────────────────────────────

const NlpBar: React.FC<{ onSubmit: (q: string) => void; disabled: boolean }> = ({ onSubmit, disabled }) => {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const q = value.trim();
    if (q.length < 3) return;
    onSubmit(q);
    setValue('');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          disabled={disabled}
          rows={2}
          placeholder="Describe your strategy idea… e.g. 'Long SPY when macro regime is risk-on and yield curve is positive, 10-year window'"
          style={{
            width: '100%',
            padding: '11px 14px',
            fontSize: 13,
            lineHeight: 1.5,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: 'var(--foreground)',
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
      <button
        className="ds-btn ds-btn-primary"
        onClick={submit}
        disabled={disabled || value.trim().length < 3}
        style={{ height: 42, padding: '0 18px', flexShrink: 0, alignSelf: 'flex-end' }}
      >
        {disabled ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} />}
        {disabled ? 'Running…' : 'Run'}
      </button>
    </div>
  );
};

// ─── Templates ───────────────────────────────────────────────────────────────────

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
    signals: [{ signal_id: 'macro_regime', signal_type: 'MacroRegime', threshold: 0.0, direction: 'Above', weight: 1 }],
    sizing: { method: 'VolTarget', target_annual_vol: 0.1 },
    entryOp: 'AND', exitOp: 'OR',
  },
  {
    key: 'curve_defensive',
    name: 'Yield-Curve Defensive',
    blurb: 'Reduce exposure when the 10y-2y term spread inverts. Half-Kelly sizing.',
    signals: [{ signal_id: 'yield_spread', signal_type: 'YieldSpread', threshold: 0, direction: 'Above', weight: 1 }],
    sizing: { method: 'Kelly', kelly_fraction: 0.5 },
    entryOp: 'AND', exitOp: 'OR',
  },
  {
    key: 'low_vol_momentum',
    name: 'Low-Vol Momentum',
    blurb: 'Long when vol is below 1 σ and 12-1 momentum is positive. Equal-weight signals.',
    signals: [
      { signal_id: 'vol_zscore', signal_type: 'VolatilityZScore', threshold: 1.0, direction: 'Below', weight: 0.5 },
      { signal_id: 'momentum_12_1', signal_type: 'MomentumFactor', threshold: 0, direction: 'Above', weight: 0.5 },
    ],
    sizing: { method: 'VolTarget', target_annual_vol: 0.12 },
    entryOp: 'AND', exitOp: 'OR',
  },
  {
    key: 'liquidity_macro',
    name: 'Liquidity + Regime',
    blurb: 'Hold when net liquidity is expanding AND the macro regime is risk-on.',
    signals: [
      { signal_id: 'liquidity_composite', signal_type: 'MacroRegime', threshold: 0, direction: 'Above', weight: 0.5 },
      { signal_id: 'macro_regime', signal_type: 'MacroRegime', threshold: 0.0, direction: 'Above', weight: 0.5 },
    ],
    sizing: { method: 'VolTarget', target_annual_vol: 0.12 },
    entryOp: 'AND', exitOp: 'OR',
  },
];

// ─── Equity Chart ────────────────────────────────────────────────────────────────

type YAxis_Mode = 'dollar' | 'pct';

const EquityChart: React.FC<{
  results: BacktestResults;
  yMode: YAxis_Mode;
  onToggleY: () => void;
}> = ({ results, yMode, onToggleY }) => {
  const ds = results.dollar_summary;
  const hasBaseline = !!(ds?.baseline_final !== undefined);
  const hasComparison = results.comparison !== undefined;

  const chartData = useMemo(() => {
    if (yMode === 'dollar' && ds) {
      return ds.curve.map((p) => ({
        ts: p.timestamp,
        enhanced: p.enhanced,
        buy_hold: p.buy_hold,
        baseline: p.baseline,
      }));
    }
    // Percent mode — use fractional equity curve
    return results.equity_curve.map((p) => ({
      ts: p.timestamp,
      enhanced: p.value,
      buy_hold: undefined as number | undefined,
      baseline: undefined as number | undefined,
      drawdown: p.drawdown,
      regime: p.regime_state,
    }));
  }, [results, ds, yMode]);

  const tickFmt = (v: number) =>
    yMode === 'dollar' ? fmt.dollar(v) : `${((v - 1) * 100).toFixed(0)}%`;

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 16, height: 2, background: 'var(--primary)', display: 'inline-block', borderRadius: 1 }} />
            Strategy
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 16, height: 2, background: 'var(--ds-gain)', display: 'inline-block', borderRadius: 1 }} />
            Buy-Hold
          </span>
          {hasComparison && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 16, height: 2, background: '#C9A227', display: 'inline-block', borderRadius: 1 }} />
              Baseline
            </span>
          )}
        </div>
        <button className="ds-btn ds-btn-ghost" onClick={onToggleY} style={{ height: 26, fontSize: 11, padding: '0 10px' }}>
          {yMode === 'dollar' ? '%' : '$'}
        </button>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
          <XAxis
            dataKey="ts"
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={tickFmt}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={false}
            width={55}
          />
          <RechartsTip
            contentStyle={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 11,
              color: 'var(--foreground)',
            }}
            formatter={(v: number, name: string) => [
              yMode === 'dollar' ? fmt.dollar(v) : fmt.pct(v - 1),
              name === 'enhanced' ? 'Strategy' : name === 'buy_hold' ? 'Buy-Hold' : 'Baseline',
            ]}
          />
          {yMode === 'dollar' && ds && (
            <>
              <Line type="monotone" dataKey="buy_hold" stroke="var(--ds-gain)" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
              {hasBaseline && <Line type="monotone" dataKey="baseline" stroke="#C9A227" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />}
              <Line type="monotone" dataKey="enhanced" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </>
          )}
          {yMode === 'pct' && (
            <Area
              type="monotone"
              dataKey="enhanced"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="color-mix(in srgb, var(--primary) 10%, transparent)"
              dot={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─── Metrics Table ───────────────────────────────────────────────────────────────

const MetricsTable: React.FC<{
  metrics: AggregateMetrics;
  onCommentary: (metric: string) => void;
  narrative: string | null;
}> = ({ metrics: m, onCommentary, narrative }) => {
  const rows: { label: string; value: string; tone?: 'gain' | 'loss' | 'neutral'; key: string }[] = [
    { label: 'Sharpe Ratio (Lo-adj.)', value: fmt.f3(m.sharpe_ratio), tone: m.sharpe_ratio > 0.5 ? 'gain' : m.sharpe_ratio < 0 ? 'loss' : 'neutral', key: 'Sharpe' },
    { label: 'Deflated Sharpe', value: fmt.f3(m.deflated_sharpe_ratio), tone: m.deflated_sharpe_ratio > 0 ? 'gain' : 'loss', key: 'Deflated Sharpe' },
    { label: 'PSR (vs 0.0 benchmark)', value: fmt.pct(m.probabilistic_sharpe_ratio), tone: m.probabilistic_sharpe_ratio > 0.8 ? 'gain' : 'neutral', key: 'PSR' },
    { label: 'Sortino Ratio', value: fmt.f2(m.sortino_ratio), tone: m.sortino_ratio > 0 ? 'gain' : 'loss', key: 'Sortino' },
    { label: 'Calmar Ratio', value: fmt.f2(m.calmar_ratio), tone: m.calmar_ratio > 0.5 ? 'gain' : 'neutral', key: 'Calmar' },
    { label: 'CAGR', value: fmt.pct(m.cagr), tone: m.cagr > 0 ? 'gain' : 'loss', key: 'CAGR' },
    { label: 'Annual Volatility', value: fmt.pct(m.annual_volatility), tone: 'neutral', key: 'Vol' },
    { label: 'Max Drawdown', value: fmt.pct(m.max_drawdown), tone: m.max_drawdown > 0.3 ? 'loss' : 'neutral', key: 'Drawdown' },
    { label: 'Win Rate', value: fmt.pct(m.win_rate), tone: m.win_rate > 0.5 ? 'gain' : 'neutral', key: 'Win Rate' },
    { label: 'Profit Factor', value: fmt.f2(m.profit_factor), tone: m.profit_factor > 1.5 ? 'gain' : m.profit_factor < 1 ? 'loss' : 'neutral', key: 'PF' },
    { label: 'Total Trades', value: fmt.int(m.total_trades), key: 'Trades' },
    { label: 'Avg Trade Duration', value: `${m.avg_trade_duration_days.toFixed(0)}d`, key: 'Duration' },
    { label: 'Skewness', value: fmt.f2(m.skewness), tone: m.skewness > 0 ? 'gain' : 'neutral', key: 'Skew' },
    { label: 'Excess Kurtosis', value: fmt.f2(m.excess_kurtosis), key: 'Kurt' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0px 0px', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {rows.map((row, i) => {
        const color = row.tone === 'gain' ? 'var(--ds-gain)' : row.tone === 'loss' ? 'var(--ds-loss)' : 'var(--foreground)';
        return (
          <div
            key={row.label}
            style={{
              padding: '9px 13px',
              borderBottom: i < rows.length - 2 ? '1px solid var(--border)' : 'none',
              borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: narrative !== undefined ? 'pointer' : 'default',
            }}
            onClick={() => onCommentary(row.key)}
            title="Click for commentary"
          >
            <span className="ds-caption">{row.label}</span>
            <span style={{ ...num, fontSize: 12, fontWeight: 600, color }}>{row.value}</span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Regime Table ────────────────────────────────────────────────────────────────

const RegimeTable: React.FC<{ results: BacktestResults }> = ({ results }) => {
  const rm = results.regime_metrics;
  const rows: { label: string; metrics: PartitionMetrics; state: number }[] = [
    { label: REGIME_LABELS[0], metrics: rm.risk_on, state: 0 },
    { label: REGIME_LABELS[1], metrics: rm.transitional, state: 1 },
    { label: REGIME_LABELS[2], metrics: rm.risk_off, state: 2 },
  ];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Regime', 'Days', 'Sharpe', 'MDD', 'Win Rate', 'Ann. Return'].map((h) => (
              <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Regime' ? 'left' : 'right', color: 'var(--muted-foreground)', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const m = row.metrics;
            const rColor = regimeColor(row.state);
            const retTone = m.annualized_return > 0 ? 'var(--ds-gain)' : m.annualized_return < 0 ? 'var(--ds-loss)' : 'var(--foreground)';
            return (
              <tr key={row.label} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: rColor, display: 'inline-block', flexShrink: 0 }} />
                  {row.label}
                </td>
                <td style={{ ...num, padding: '8px 10px', textAlign: 'right' }}>{m.days_in_regime}</td>
                <td style={{ ...num, padding: '8px 10px', textAlign: 'right', color: m.sharpe_ratio > 0 ? 'var(--ds-gain)' : m.sharpe_ratio < 0 ? 'var(--ds-loss)' : undefined }}>{fmt.f2(m.sharpe_ratio)}</td>
                <td style={{ ...num, padding: '8px 10px', textAlign: 'right', color: m.max_drawdown > 0.25 ? 'var(--ds-loss)' : undefined }}>{fmt.pct(m.max_drawdown)}</td>
                <td style={{ ...num, padding: '8px 10px', textAlign: 'right' }}>{fmt.pct(m.win_rate)}</td>
                <td style={{ ...num, padding: '8px 10px', textAlign: 'right', color: retTone }}>{fmt.pct(m.annualized_return)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ─── Signal Attribution Chart ─────────────────────────────────────────────────────

const AttributionChart: React.FC<{
  results: BacktestResults;
  onSignalClick: (signalId: string) => void;
}> = ({ results, onSignalClick }) => {
  const data = [...results.signal_attribution].sort((a, b) => b.marginal_sharpe - a.marginal_sharpe);
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20, top: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="signal_id" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
        <RechartsTip
          contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
          formatter={(v: number) => [v.toFixed(3), 'Marginal Sharpe']}
        />
        <Bar dataKey="marginal_sharpe" radius={[0, 4, 4, 0]} onClick={(d) => onSignalClick(d.signal_id)}>
          {data.map((entry) => (
            <Cell
              key={entry.signal_id}
              fill={entry.marginal_sharpe >= 0 ? 'var(--ds-gain)' : 'var(--ds-loss)'}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

// ─── Trade Log ───────────────────────────────────────────────────────────────────

const TradeLog: React.FC<{ results: BacktestResults }> = ({ results }) => {
  const [expanded, setExpanded] = useState(false);
  const trades = results.trade_log;
  const shown = expanded ? trades : trades.slice(0, 8);

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Entry', 'Exit', 'Duration', 'P&L', 'Regime', 'Signals'].map((h) => (
                <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((t, i) => {
              const tone = pnlTone(t.pnl_pct);
              const pnlColor = tone === 'gain' ? 'var(--ds-gain)' : tone === 'loss' ? 'var(--ds-loss)' : 'var(--foreground)';
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...num, padding: '7px 10px' }}>{t.entry_ts}</td>
                  <td style={{ ...num, padding: '7px 10px' }}>{t.exit_ts}</td>
                  <td style={{ ...num, padding: '7px 10px' }}>{t.duration_days.toFixed(0)}d</td>
                  <td style={{ ...num, padding: '7px 10px', fontWeight: 600, color: pnlColor }}>{fmt.pct(t.pnl_pct)}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <span style={{ fontSize: 10, color: regimeColor(t.regime_at_entry) }}>
                      {REGIME_LABELS[t.regime_at_entry]}
                    </span>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <span className="ds-caption" style={{ fontSize: 10 }}>{t.signals_triggered.join(', ')}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {trades.length > 8 && (
        <button
          className="ds-btn ds-btn-ghost"
          onClick={() => setExpanded(!expanded)}
          style={{ marginTop: 8, width: '100%', fontSize: 11 }}
        >
          {expanded ? 'Show fewer' : `Show all ${trades.length} trades`}
        </button>
      )}
    </div>
  );
};

// ─── Dollar Hero Cards ───────────────────────────────────────────────────────────

const DollarHero: React.FC<{ results: BacktestResults; onCommentary: () => void }> = ({ results, onCommentary }) => {
  const ds = results.dollar_summary;
  if (!ds) return null;
  const enhPnl = ds.enhanced_final - ds.starting_capital;
  const bhPnl = ds.buy_hold_final - ds.starting_capital;
  const blPnl = ds.baseline_final !== undefined ? ds.baseline_final - ds.starting_capital : null;
  const alpha = enhPnl - bhPnl;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      <Kpi
        label="Strategy P&L"
        value={fmt.dollar(Math.abs(enhPnl))}
        sub={`${enhPnl >= 0 ? '+' : '-'}${fmt.pct(Math.abs(results.aggregate_metrics.cagr))} CAGR`}
        tone={enhPnl >= 0 ? 'gain' : 'loss'}
        accent
        onClick={onCommentary}
      />
      <Kpi
        label="Buy-Hold P&L"
        value={fmt.dollar(Math.abs(bhPnl))}
        sub={`from ${fmt.dollar(ds.starting_capital)}`}
        tone={bhPnl >= 0 ? 'gain' : 'loss'}
      />
      {blPnl !== null ? (
        <Kpi
          label="vs Baseline"
          value={fmt.dollar(Math.abs(alpha))}
          sub={`Sharpe delta ${fmt.f3(results.comparison?.sharpe_delta ?? 0)}`}
          tone={alpha >= 0 ? 'gain' : 'loss'}
        />
      ) : (
        <Kpi
          label="Alpha vs Buy-Hold"
          value={fmt.dollar(Math.abs(alpha))}
          sub={`${alpha >= 0 ? '+' : ''}${fmt.pct(alpha / ds.starting_capital)}`}
          tone={alpha >= 0 ? 'gain' : 'loss'}
        />
      )}
    </div>
  );
};

// ─── Signal Library Panel ────────────────────────────────────────────────────────

const SignalLibraryPanel: React.FC<{ library: SignalLibrary | null; onAdd: (s: SignalMeta) => void; activeIds: Set<string> }> = ({
  library, onAdd, activeIds,
}) => (
  <section className="ds-panel">
    <div className="ds-panel-header">
      <span className="ds-heading">Signal Library</span>
      <span className="ds-caption">{library?.signals.length ?? 0} signals</span>
    </div>
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
      {!library && <p className="ds-caption">Loading…</p>}
      {library?.signals.map((s) => {
        const active = activeIds.has(s.signal_id);
        return (
          <div key={s.signal_id} className="ds-surface-ghost ds-transition-fast" style={{ padding: 10, borderRadius: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span className="ds-heading" style={{ fontSize: 12 }}>{s.label}</span>
              <span className="ds-tag ds-pill-critical" style={{ textTransform: 'uppercase', fontSize: 9 }}>{s.min_tier}</span>
            </div>
            <p className="ds-caption" style={{ margin: '5px 0', lineHeight: 1.45 }}>{s.description}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <code style={{ fontSize: 9, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                {s.source_columns.slice(0, 2).join(' · ')}
              </code>
              <button
                className={active ? 'ds-btn ds-btn-ghost' : 'ds-btn ds-btn-outline'}
                onClick={() => onAdd(s)}
                disabled={active}
                style={{ height: 24, padding: '0 9px', fontSize: 10 }}
              >
                <Plus size={11} /> {active ? 'Added' : 'Add'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  </section>
);

// ─── Composer ────────────────────────────────────────────────────────────────────

const Composer: React.FC<{
  signals: SignalConfig[];
  setSignals: (s: SignalConfig[]) => void;
  entryOp: Operator;
  setEntryOp: (o: Operator) => void;
  exitOp: Operator;
  setExitOp: (o: Operator) => void;
  sizing: PositionSizing;
  setSizing: (p: PositionSizing) => void;
  name: string;
  setName: (s: string) => void;
  instrument: string;
  setInstrument: (s: string) => void;
  dateRange: { start_date: string; end_date: string };
  setDateRange: (r: { start_date: string; end_date: string }) => void;
  startingCapital: number;
  setStartingCapital: (n: number) => void;
  comparison: boolean;
  setComparison: (b: boolean) => void;
}> = ({
  signals, setSignals, entryOp, setEntryOp, exitOp, setExitOp, sizing, setSizing,
  name, setName, instrument, setInstrument, dateRange, setDateRange,
  startingCapital, setStartingCapital, comparison, setComparison,
}) => {
  const removeSignal = (id: string) => setSignals(signals.filter((s) => s.signal_id !== id));
  const updateSignal = (id: string, patch: Partial<SignalConfig>) =>
    setSignals(signals.map((s) => (s.signal_id === id ? { ...s, ...patch } : s)));

  const label: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4, fontWeight: 600 };
  const input: React.CSSProperties = {
    padding: '6px 10px', fontSize: 12, background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 7, color: 'var(--foreground)', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Basic */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={label}>Strategy name</label>
          <input style={input} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label style={label}>Instrument</label>
          <input style={input} value={instrument} onChange={(e) => setInstrument(e.target.value.toUpperCase())} placeholder="e.g. SPY" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div>
          <label style={label}>Start date</label>
          <input type="date" style={input} value={dateRange.start_date} onChange={(e) => setDateRange({ ...dateRange, start_date: e.target.value })} />
        </div>
        <div>
          <label style={label}>End date</label>
          <input type="date" style={input} value={dateRange.end_date} onChange={(e) => setDateRange({ ...dateRange, end_date: e.target.value })} />
        </div>
        <div>
          <label style={label}>Starting capital</label>
          <input type="number" style={input} value={startingCapital} min={1000} step={1000}
            onChange={(e) => setStartingCapital(Math.max(1000, Number(e.target.value)))} />
        </div>
      </div>

      {/* Signals */}
      <div>
        <span style={label}>Active signals</span>
        {signals.length === 0 && <p className="ds-caption" style={{ marginTop: 4 }}>No signals — add from the Signal Library.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {signals.map((s) => (
            <div key={s.signal_id} className="ds-surface-ghost" style={{ padding: '8px 12px', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ fontSize: 10, flex: 1, color: 'var(--muted-foreground)' }}>{s.signal_id}</code>
              <select style={{ ...input, width: 90 }} value={s.direction} onChange={(e) => updateSignal(s.signal_id, { direction: e.target.value as Direction })}>
                {['Above', 'Below', 'CrossUp', 'CrossDown'].map((d) => <option key={d}>{d}</option>)}
              </select>
              <input type="number" style={{ ...input, width: 70 }} value={s.threshold} step={0.1}
                onChange={(e) => updateSignal(s.signal_id, { threshold: Number(e.target.value) })} />
              <button className="ds-btn ds-btn-ghost" onClick={() => removeSignal(s.signal_id)} style={{ height: 26, padding: '0 6px' }}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Logic operators */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={label}>Entry logic</label>
          <select style={input} value={entryOp} onChange={(e) => setEntryOp(e.target.value as Operator)}>
            <option>AND</option><option>OR</option>
          </select>
        </div>
        <div>
          <label style={label}>Exit logic</label>
          <select style={input} value={exitOp} onChange={(e) => setExitOp(e.target.value as Operator)}>
            <option>AND</option><option>OR</option>
          </select>
        </div>
      </div>

      {/* Position sizing */}
      <div>
        <label style={label}>Position sizing</label>
        <select style={input} value={sizing.method} onChange={(e) => {
          const m = e.target.value as PositionSizing['method'];
          setSizing(
            m === 'FixedFractional' ? { method: 'FixedFractional', fraction: 0.95 }
            : m === 'Kelly' ? { method: 'Kelly', kelly_fraction: 0.5 }
            : m === 'VolTarget' ? { method: 'VolTarget', target_annual_vol: 0.10 }
            : { method: 'EqualWeight' },
          );
        }}>
          <option value="FixedFractional">Fixed Fractional</option>
          <option value="Kelly">Kelly</option>
          <option value="VolTarget">Vol Target</option>
          <option value="EqualWeight">Equal Weight</option>
        </select>
        {sizing.method === 'FixedFractional' && (
          <input type="number" style={{ ...input, marginTop: 6 }} value={sizing.fraction} min={0.01} max={1} step={0.05}
            onChange={(e) => setSizing({ method: 'FixedFractional', fraction: Number(e.target.value) })} />
        )}
        {sizing.method === 'VolTarget' && (
          <input type="number" style={{ ...input, marginTop: 6 }} value={sizing.target_annual_vol ?? 0.10} min={0.01} max={0.5} step={0.01}
            onChange={(e) => setSizing({ method: 'VolTarget', target_annual_vol: Number(e.target.value) })} />
        )}
        {sizing.method === 'Kelly' && (
          <input type="number" style={{ ...input, marginTop: 6 }} value={sizing.kelly_fraction ?? 0.5} min={0.1} max={1} step={0.1}
            onChange={(e) => setSizing({ method: 'Kelly', kelly_fraction: Number(e.target.value) })} />
        )}
      </div>

      {/* Comparison toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
        <input type="checkbox" checked={comparison} onChange={(e) => setComparison(e.target.checked)} />
        Compare to 12-1 momentum baseline
      </label>
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────────

type InputMode = 'nlp' | 'composer';

export default function Backtesting() {
  const { state: bt, runFromQuery, runFromSpec, reset } = useBacktest();

  // Composer state
  const [inputMode, setInputMode] = useState<InputMode>('nlp');
  const [signals, setSignals] = useState<SignalConfig[]>([]);
  const [entryOp, setEntryOp] = useState<Operator>('AND');
  const [exitOp, setExitOp] = useState<Operator>('OR');
  const [sizing, setSizing] = useState<PositionSizing>({ method: 'VolTarget', target_annual_vol: 0.10 });
  const [name, setName] = useState('My Strategy');
  const [instrument, setInstrument] = useState('SPY');
  const [startingCapital, setStartingCapital] = useState(10_000);
  const [comparison, setComparison] = useState(false);
  const [dateRange, setDateRange] = useState({ start_date: '2015-01-01', end_date: TODAY });

  // Signal library
  const [library, setLibrary] = useState<SignalLibrary | null>(null);
  useEffect(() => {
    getSignalLibrary().then(setLibrary).catch(() => {});
  }, []);

  // Y-axis mode for equity chart
  const [yMode, setYMode] = useState<YAxis_Mode>('dollar');

  // Commentary modal
  const [commentaryModal, setCommentaryModal] = useState<{ title: string; narrative: string | null } | null>(null);
  const [commentaryCache, setCommentaryCache] = useState<Record<string, string>>({});

  const openCommentary = useCallback(async (title: string, query: string, metrics: Record<string, string | number>) => {
    if (commentaryCache[title]) {
      setCommentaryModal({ title, narrative: commentaryCache[title] });
      return;
    }
    setCommentaryModal({ title, narrative: null });
    try {
      const { narrative } = await requestCommentary({ query, metrics });
      setCommentaryCache((c) => ({ ...c, [title]: narrative }));
      setCommentaryModal({ title, narrative });
    } catch {
      setCommentaryModal({ title, narrative: 'Commentary unavailable at this time.' });
    }
  }, [commentaryCache]);

  const activeSignalIds = useMemo(() => new Set(signals.map((s) => s.signal_id)), [signals]);

  const addSignalFromLibrary = (s: SignalMeta) => {
    if (activeSignalIds.has(s.signal_id)) return;
    setSignals((prev) => [
      ...prev,
      { signal_id: s.signal_id, signal_type: s.signal_type, threshold: 0, direction: 'Above', weight: 1 / (prev.length + 1) },
    ]);
  };

  const applyTemplate = (t: Template) => {
    setSignals(t.signals);
    setSizing(t.sizing);
    setEntryOp(t.entryOp);
    setExitOp(t.exitOp);
    setName(t.name);
    setInputMode('composer');
  };

  const handleComposerRun = () => {
    if (signals.length === 0) return;
    const spec = buildSpec(
      { name, date_range: dateRange },
      signals, entryOp, exitOp, sizing, comparison, instrument, startingCapital,
    );
    runFromSpec(spec, name);
  };

  const results = bt.results;
  const hasResults = results !== null;
  const isRunning = bt.isRunning;

  return (
    <div className="ds-page">
      <PageHeader
        title="Strategy Backtesting"
        subtitle="Institutional-grade causal HMM regime engine · Lo-adjusted Sharpe · DSR · t+1 execution realism"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>

        {/* ── Left column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Input surface */}
          <section className="ds-panel" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <SectionHeader icon={<Zap size={13} />} title="Strategy input" />
              <div style={{ marginLeft: 'auto', display: 'inline-flex', borderRadius: 7, border: '1px solid var(--border)', overflow: 'hidden' }}>
                {(['nlp', 'composer'] as InputMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setInputMode(m)}
                    style={{
                      padding: '5px 12px',
                      fontSize: 11,
                      fontWeight: 600,
                      background: inputMode === m ? 'var(--primary)' : 'transparent',
                      color: inputMode === m ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {m === 'nlp' ? 'Natural language' : 'Composer'}
                  </button>
                ))}
              </div>
            </div>

            {inputMode === 'nlp' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <NlpBar onSubmit={runFromQuery} disabled={isRunning} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    'Long SPY when macro regime is risk-on',
                    'Yield-curve defensive strategy on TLT, 15 years',
                    'Momentum on QQQ with vol target 10%, compare to baseline',
                  ].map((ex) => (
                    <button
                      key={ex}
                      className="ds-btn ds-btn-ghost"
                      style={{ fontSize: 11, height: 26 }}
                      onClick={() => !isRunning && runFromQuery(ex)}
                      disabled={isRunning}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Template strip */}
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.key}
                      className="ds-btn ds-btn-ghost"
                      onClick={() => applyTemplate(t)}
                      style={{ fontSize: 11, height: 26, whiteSpace: 'nowrap' }}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>

                <Composer
                  signals={signals} setSignals={setSignals}
                  entryOp={entryOp} setEntryOp={setEntryOp}
                  exitOp={exitOp} setExitOp={setExitOp}
                  sizing={sizing} setSizing={setSizing}
                  name={name} setName={setName}
                  instrument={instrument} setInstrument={setInstrument}
                  dateRange={dateRange} setDateRange={setDateRange}
                  startingCapital={startingCapital} setStartingCapital={setStartingCapital}
                  comparison={comparison} setComparison={setComparison}
                />

                <button
                  className="ds-btn ds-btn-primary"
                  onClick={handleComposerRun}
                  disabled={isRunning || signals.length === 0}
                  style={{ alignSelf: 'flex-start', padding: '0 18px', height: 36 }}
                >
                  {isRunning ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={13} />}
                  {isRunning ? 'Running…' : 'Run backtest'}
                </button>
              </div>
            )}
          </section>

          {/* Execution trace while running */}
          {isRunning && <StepTrace steps={bt.steps} />}

          {/* Error banner */}
          {bt.error && !isRunning && (
            <div className="ds-panel" style={{ padding: '12px 16px', borderColor: 'var(--ds-loss)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AlertTriangle size={14} style={{ color: 'var(--ds-loss)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: 'var(--ds-loss)' }}>Backtest failed</p>
                <p className="ds-caption" style={{ marginTop: 4 }}>{bt.error}</p>
              </div>
              <button className="ds-btn ds-btn-ghost" onClick={reset} style={{ marginLeft: 'auto', height: 26, fontSize: 11 }}>Dismiss</button>
            </div>
          )}

          {/* Results zone */}
          {hasResults && !isRunning && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Dollar hero */}
              <section>
                <SectionHeader icon={<DollarSign size={13} />} title="Performance summary" subtitle={`through ${results.data_through} · ${results.bars.toLocaleString()} bars`} />
                <DollarHero
                  results={results}
                  onCommentary={() => openCommentary(
                    'Performance commentary',
                    bt.resolvedSpec?.name ?? 'Strategy',
                    {
                      CAGR: fmt.pct(results.aggregate_metrics.cagr),
                      'Max DD': fmt.pct(results.aggregate_metrics.max_drawdown),
                      Sharpe: fmt.f3(results.aggregate_metrics.sharpe_ratio),
                    },
                  )}
                />
              </section>

              {/* Equity curve */}
              <section className="ds-panel" style={{ padding: '16px 18px' }}>
                <SectionHeader icon={<TrendingUp size={13} />} title="Equity curve" subtitle={yMode === 'dollar' ? '3-curve dollar view' : 'fractional returns'} />
                <EquityChart results={results} yMode={yMode} onToggleY={() => setYMode(m => m === 'dollar' ? 'pct' : 'dollar')} />
              </section>

              {/* Metrics */}
              <section className="ds-panel" style={{ padding: '16px 18px' }}>
                <SectionHeader
                  icon={<BarChart2 size={13} />}
                  title="Aggregate metrics"
                  subtitle="click any row for commentary"
                />
                <MetricsTable
                  metrics={results.aggregate_metrics}
                  narrative={bt.narrative}
                  onCommentary={(key) => openCommentary(
                    key,
                    bt.resolvedSpec?.name ?? 'Strategy',
                    { [key]: 'See aggregate metrics' },
                  )}
                />
              </section>

              {/* Regime breakdown */}
              <section className="ds-panel" style={{ padding: '16px 18px' }}>
                <SectionHeader icon={<Activity size={13} />} title="Regime performance breakdown" />
                <RegimeTable results={results} />
              </section>

              {/* Signal attribution */}
              {results.signal_attribution.length > 0 && (
                <section className="ds-panel" style={{ padding: '16px 18px' }}>
                  <SectionHeader icon={<Zap size={13} />} title="Signal attribution" subtitle="marginal Sharpe (leave-one-out)" />
                  <AttributionChart
                    results={results}
                    onSignalClick={(id) => openCommentary(
                      `Signal: ${id}`,
                      bt.resolvedSpec?.name ?? 'Strategy',
                      { 'Signal ID': id },
                    )}
                  />
                </section>
              )}

              {/* Trade log */}
              <section className="ds-panel" style={{ padding: '16px 18px' }}>
                <SectionHeader
                  icon={<BookOpen size={13} />}
                  title="Trade log"
                  subtitle={`${results.trade_log.length} trades`}
                />
                <TradeLog results={results} />
              </section>

              {/* AI commentary */}
              {bt.narrative && (
                <section className="ds-panel" style={{ padding: '16px 18px', borderColor: 'color-mix(in srgb, var(--primary) 30%, var(--border))' }}>
                  <SectionHeader icon={<Info size={13} />} title="Institutional commentary" />
                  <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--foreground)', margin: 0 }}>{bt.narrative}</p>
                  <p className="ds-caption" style={{ marginTop: 10 }}>
                    Generated by Deplyze intelligence layer. Not investment advice. Evidence-grounded, no forward-looking guarantees.
                  </p>
                </section>
              )}

              {/* Forward context — Institutional tier gate */}
              <section className="ds-panel" style={{ padding: '16px 18px', position: 'relative' }}>
                <SectionHeader icon={<Lock size={13} />} title="Forward context" subtitle="Institutional" />
                <TierGate tier="Institutional">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Kpi label="Walk-forward efficiency" value="—" />
                    <Kpi label="Out-of-sample Sharpe" value="—" />
                  </div>
                </TierGate>
              </section>
            </div>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SignalLibraryPanel library={library} onAdd={addSignalFromLibrary} activeIds={activeSignalIds} />

          {hasResults && !isRunning && (
            <section className="ds-panel" style={{ padding: '14px 16px' }}>
              <SectionHeader icon={<Activity size={12} />} title="Run summary" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['Strategy', bt.resolvedSpec?.name ?? '—'],
                  ['Instrument', bt.resolvedSpec?.instrument ?? 'SPY'],
                  ['Period', `${bt.resolvedSpec?.date_range.start_date ?? '—'} → ${bt.resolvedSpec?.date_range.end_date ?? '—'}`],
                  ['Bars', results.bars.toLocaleString()],
                  ['Data through', results.data_through],
                  ['Sharpe', fmt.f3(results.aggregate_metrics.sharpe_ratio)],
                  ['CAGR', fmt.pct(results.aggregate_metrics.cagr)],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                    <span className="ds-caption">{k}</span>
                    <span style={{ ...num, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
              <button className="ds-btn ds-btn-ghost" onClick={reset} style={{ marginTop: 12, width: '100%', fontSize: 11 }}>
                New backtest
              </button>
            </section>
          )}
        </div>
      </div>

      <Disclaimer />

      {commentaryModal && (
        <CommentaryModal
          title={commentaryModal.title}
          narrative={commentaryModal.narrative}
          onClose={() => setCommentaryModal(null)}
        />
      )}
    </div>
  );
}
