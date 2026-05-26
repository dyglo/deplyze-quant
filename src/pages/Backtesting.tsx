/**
 * Backtesting — Cowork-inspired 3-column shell.
 *
 * Left rail   (240px) : history list + new strategy
 * Center canvas (flex) : dot-grid canvas, landing tiles, results, sticky input bar
 * Right panel (280px) : collapsible Progress · Artifacts · Context accordion
 */

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import {
  Plus, X, Loader2, TrendingUp,
  AlertTriangle, BarChart2, DollarSign,
  Activity, BookOpen, Lock, ChevronDown,
  ChevronRight, ArrowRight, Zap, BarChart as BarIcon,
  LineChart, Shield, Layers, PanelLeft,
  SlidersHorizontal,
} from 'lucide-react';
import { Disclaimer } from '../components/quant/Disclaimer';
import { useBacktest } from '../hooks/useBacktest';
import {
  getSignalLibrary,
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
  type ImprovementSuggestion,
  type ImprovementActionPatch,
} from '../services/backtest';

// ─── Design tokens — use DS CSS vars, no hardcoded brand hex ───────────────────
const RAIL_W  = 240;
const PANEL_W = 300;

// Subtle dot-grid on plain background — no color tint
const canvasBg: React.CSSProperties = {
  background: 'var(--background)',
  backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--muted-foreground) 20%, transparent) 1px, transparent 1px)',
  backgroundSize: '24px 24px',
};

// ─── Constants ───────────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10);

// ─── Types ───────────────────────────────────────────────────────────────────────
interface HistoryEntry {
  id: string;
  name: string;
  instrument: string;
  sharpe: number;
  cagr: number;
  ts: number;
  spec: StrategySpec;
}

type CanvasState = 'landing' | 'building' | 'running' | 'results';
type YAxisMode   = 'dollar' | 'pct';

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
  entryOp: Operator, exitOp: Operator,
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
    risk_params: base.risk_params ?? { max_drawdown_pct: 0.25, position_cap_pct: 1.0, rebalance_freq: 'Daily', risk_per_trade_pct: 1.0, min_rr: 2.0 },
    comparison_mode: comparison,
    cost_model: base.cost_model ?? { commission_bps: 1, slippage_bps: 2 },
    instrument,
    starting_capital: startingCapital,
  };
}

const fmt = {
  dollar: (x: number) => x >= 1_000_000 ? `$${(x/1_000_000).toFixed(2)}M` : x >= 1_000 ? `$${(x/1_000).toFixed(1)}K` : `$${x.toFixed(0)}`,
  pct:  (x: number) => `${(x * 100).toFixed(1)}%`,
  f2:   (x: number) => isFinite(x) ? x.toFixed(2) : '—',
  f3:   (x: number) => isFinite(x) ? x.toFixed(3) : '—',
  int:  (x: number) => isFinite(x) ? Math.round(x).toLocaleString() : '—',
  rel:  (ts: number) => {
    const d = Math.floor((Date.now() - ts) / 86400000);
    return d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d}d ago`;
  },
};

// ─── Templates ───────────────────────────────────────────────────────────────────
interface Template {
  key: string; name: string; blurb: string;
  icon: React.ReactNode;
  signals: SignalConfig[];
  sizing: PositionSizing;
  entryOp: Operator; exitOp: Operator;
}

const TEMPLATES: Template[] = [
  {
    key: 'risk_on_trend', name: 'Risk-On Regime', blurb: 'Hold while HMM posteriors favour risk-on. Vol-targeted.',
    icon: <TrendingUp size={14} />,
    signals: [{ signal_id: 'macro_regime_risk_on', signal_type: 'MacroRegime', threshold: 0.5, direction: 'Above', weight: 1 }],
    sizing: { method: 'VolTarget', target_annual_vol: 0.10 }, entryOp: 'AND', exitOp: 'OR',
  },
  {
    key: 'yield_curve', name: 'Yield Curve Defensive', blurb: 'Exit when 10y-2y spread inverts. Half-Kelly sizing.',
    icon: <LineChart size={14} />,
    signals: [{ signal_id: 'yield_curve_10y2y', signal_type: 'YieldSpread', threshold: 0, direction: 'Above', weight: 1 }],
    sizing: { method: 'Kelly', kelly_fraction: 0.5 }, entryOp: 'AND', exitOp: 'OR',
  },
  {
    key: 'low_vol_mom', name: 'Low-Vol Momentum', blurb: 'Long when vol is below 1σ and 12-1 momentum is positive.',
    icon: <BarIcon size={14} />,
    signals: [
      { signal_id: 'realized_vol_z', signal_type: 'VolatilityZScore', threshold: 1.0, direction: 'Below', weight: 0.5 },
      { signal_id: 'ts_momentum_12_1', signal_type: 'MomentumFactor', threshold: 0, direction: 'Above', weight: 0.5 },
    ],
    sizing: { method: 'VolTarget', target_annual_vol: 0.12 }, entryOp: 'AND', exitOp: 'OR',
  },
  {
    key: 'liquidity_macro', name: 'Liquidity + Regime', blurb: 'Hold when net liquidity expands AND macro is risk-on.',
    icon: <Layers size={14} />,
    signals: [
      { signal_id: 'liquidity_composite', signal_type: 'MacroRegime', threshold: 0, direction: 'Above', weight: 0.5 },
      { signal_id: 'macro_regime_risk_on', signal_type: 'MacroRegime', threshold: 0.5, direction: 'Above', weight: 0.5 },
    ],
    sizing: { method: 'VolTarget', target_annual_vol: 0.12 }, entryOp: 'AND', exitOp: 'OR',
  },
  {
    key: 'inflation', name: 'Inflation Persistence', blurb: 'Defensive posture when inflation composite is elevated.',
    icon: <Shield size={14} />,
    signals: [{ signal_id: 'inflation_persistence', signal_type: 'MacroRegime', threshold: 0, direction: 'Below', weight: 1 }],
    sizing: { method: 'VolTarget', target_annual_vol: 0.08 }, entryOp: 'AND', exitOp: 'OR',
  },
  {
    key: 'custom', name: 'Custom strategy', blurb: 'Open the builder and compose from scratch.',
    icon: <Zap size={14} />,
    signals: [],
    sizing: { method: 'VolTarget', target_annual_vol: 0.10 }, entryOp: 'AND', exitOp: 'OR',
  },
];

// ─── Accordion (right panel) ──────────────────────────────────────────────────────
const Accordion: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({
  title, defaultOpen = true, children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--foreground)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted-foreground)' }}>{title}</span>
        {open
          ? <ChevronDown size={12} style={{ color: 'var(--muted-foreground)' }} />
          : <ChevronRight size={12} style={{ color: 'var(--muted-foreground)' }} />}
      </button>
      {open && <div style={{ padding: '0 14px 12px' }}>{children}</div>}
    </div>
  );
};

// ─── Step chain (Progress section) ───────────────────────────────────────────────
const StepChain: React.FC<{ steps: ReturnType<typeof useBacktest>['state']['steps'] }> = ({ steps }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    {steps.map((step) => {
      const done   = step.state === 'done';
      const active = step.state === 'active';
      const failed = step.state === 'failed';
      const color  = failed ? 'var(--ds-loss)' : done ? 'var(--primary)' : active ? 'var(--foreground)' : 'var(--muted-foreground)';
      return (
        <div key={step.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
            border: `1.5px solid ${color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: done ? 'var(--primary)' : 'transparent',
          }}>
            {active && <Loader2 size={9} style={{ color, animation: 'spin 1s linear infinite' }} />}
            {done  && <span style={{ fontSize: 8, color: 'var(--primary-foreground)', fontWeight: 700 }}>✓</span>}
            {failed && <span style={{ fontSize: 8, color }}>✗</span>}
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, color, fontWeight: active ? 600 : 400 }}>{step.label}</span>
            {step.detail && <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>{step.detail}</p>}
            {step.error  && <p style={{ fontSize: 10, color: 'var(--ds-loss)', margin: '2px 0 0' }}>{step.error}</p>}
          </div>
        </div>
      );
    })}
  </div>
);

// ─── Commentary modal ─────────────────────────────────────────────────────────────
const CommentaryModal: React.FC<{ title: string; narrative: string | null; onClose: () => void }> = ({
  title, narrative, onClose,
}) => (
  <div
    onClick={onClose}
    style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
        maxWidth: 520, width: '100%', margin: '0 20px', padding: '22px 24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex' }}>
          <X size={14} />
        </button>
      </div>
      {narrative
        ? <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, color: 'var(--foreground)' }}>{narrative}</p>
        : <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)', fontSize: 12 }}>
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating…
          </div>}
    </div>
  </div>
);

// ─── Tier gate ────────────────────────────────────────────────────────────────────
const TierGate: React.FC<{ tier: string; children: React.ReactNode }> = ({ children }) => <>{children}</>;

// ─── Metric row (right panel Artifacts) ──────────────────────────────────────────
const MetricRow: React.FC<{ label: string; value: string; tone?: 'gain' | 'loss' | 'neutral' }> = ({
  label, value, tone = 'neutral',
}) => {
  const color = tone === 'gain' ? 'var(--ds-gain)' : tone === 'loss' ? 'var(--ds-loss)' : 'var(--foreground)';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}>
      <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
};

// ─── Equity chart ─────────────────────────────────────────────────────────────────
const EquityChart: React.FC<{ results: BacktestResults; yMode: YAxisMode; onToggleY: () => void }> = ({
  results, yMode, onToggleY,
}) => {
  const ds = results.dollar_summary;
  const hasBaseline = results.comparison !== undefined;

  const data = useMemo(() => {
    if (yMode === 'dollar' && ds) {
      return ds.curve.map((p) => ({ ts: p.timestamp, enhanced: p.enhanced, buy_hold: p.buy_hold, baseline: p.baseline }));
    }
    return results.equity_curve.map((p) => ({ ts: p.timestamp, enhanced: p.value, buy_hold: undefined as number | undefined, baseline: undefined as number | undefined }));
  }, [results, ds, yMode]);

  const tickFmt = (v: number) => yMode === 'dollar' ? fmt.dollar(v) : `${((v - 1) * 100).toFixed(0)}%`;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted-foreground)' }}>
          {[['var(--primary)', 'Strategy'], ['var(--ds-gain)', 'Buy-Hold'], ...(hasBaseline ? [['#C9A227', 'Baseline']] : [])].map(([c, l]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 14, height: 2, background: c as string, borderRadius: 1, display: 'inline-block' }} />{l}
            </span>
          ))}
        </div>
        <button onClick={onToggleY} style={{ fontSize: 11, background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer', color: 'var(--foreground)' }}>
          {yMode === 'dollar' ? '% returns' : '$ value'}
        </button>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} />
          <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={tickFmt} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={52} />
          <RechartsTip
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
            formatter={(v: number, name: string) => [yMode === 'dollar' ? fmt.dollar(v) : fmt.pct(v - 1), name === 'enhanced' ? 'Strategy' : name === 'buy_hold' ? 'Buy-Hold' : 'Baseline']}
          />
          {yMode === 'dollar' && ds && <>
            <Line type="monotone" dataKey="buy_hold" stroke="var(--ds-gain)" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
            {hasBaseline && <Line type="monotone" dataKey="baseline" stroke="#C9A227" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />}
            <Line type="monotone" dataKey="enhanced" stroke="var(--primary)" strokeWidth={2} dot={false} />
          </>}
          {yMode === 'pct' && <Area type="monotone" dataKey="enhanced" stroke="var(--primary)" strokeWidth={2} fill="color-mix(in srgb, var(--primary) 10%, transparent)" dot={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─── Metrics grid ─────────────────────────────────────────────────────────────────
const MetricsGrid: React.FC<{ metrics: AggregateMetrics; onRow: (k: string) => void }> = ({ metrics: m, onRow }) => {
  const rows = [
    { k: 'Sharpe', label: 'Sharpe (Lo-adj.)', value: fmt.f3(m.sharpe_ratio), tone: m.sharpe_ratio > 0.5 ? 'gain' : m.sharpe_ratio < 0 ? 'loss' : 'neutral' },
    { k: 'DSR',    label: 'Deflated Sharpe',   value: fmt.f3(m.deflated_sharpe_ratio), tone: m.deflated_sharpe_ratio > 0 ? 'gain' : 'loss' },
    { k: 'PSR',    label: 'PSR',                value: fmt.pct(m.probabilistic_sharpe_ratio), tone: m.probabilistic_sharpe_ratio > 0.8 ? 'gain' : 'neutral' },
    { k: 'Sortino',label: 'Sortino',            value: fmt.f2(m.sortino_ratio), tone: m.sortino_ratio > 0 ? 'gain' : 'loss' },
    { k: 'Calmar', label: 'Calmar',             value: fmt.f2(m.calmar_ratio), tone: m.calmar_ratio > 0.5 ? 'gain' : 'neutral' },
    { k: 'CAGR',   label: 'CAGR',               value: fmt.pct(m.cagr), tone: m.cagr > 0 ? 'gain' : 'loss' },
    { k: 'Vol',    label: 'Ann. Volatility',    value: fmt.pct(m.annual_volatility), tone: 'neutral' },
    { k: 'MDD',    label: 'Max Drawdown',       value: fmt.pct(m.max_drawdown), tone: m.max_drawdown > 0.3 ? 'loss' : 'neutral' },
    { k: 'WR',     label: 'Win Rate',           value: fmt.pct(m.win_rate), tone: m.win_rate > 0.5 ? 'gain' : 'neutral' },
    { k: 'PF',     label: 'Profit Factor',      value: fmt.f2(m.profit_factor), tone: m.profit_factor > 1.5 ? 'gain' : m.profit_factor < 1 ? 'loss' : 'neutral' },
    { k: 'Trades', label: 'Total Trades',       value: fmt.int(m.total_trades), tone: 'neutral' },
    { k: 'Dur',    label: 'Avg Duration',       value: `${m.avg_trade_duration_days.toFixed(0)}d`, tone: 'neutral' },
    { k: 'Skew',   label: 'Skewness',           value: fmt.f2(m.skewness), tone: m.skewness > 0 ? 'gain' : 'neutral' },
    { k: 'Kurt',   label: 'Excess Kurtosis',    value: fmt.f2(m.excess_kurtosis), tone: 'neutral' },
  ] as const;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {rows.map((row, i) => {
        const color = row.tone === 'gain' ? 'var(--ds-gain)' : row.tone === 'loss' ? 'var(--ds-loss)' : 'var(--foreground)';
        return (
          <div
            key={row.k}
            onClick={() => onRow(row.k)}
            title="Click for commentary"
            style={{
              padding: '8px 12px', cursor: 'pointer',
              borderBottom: i < rows.length - 2 ? '1px solid var(--border)' : 'none',
              borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{row.label}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
          </div>
        );
      })}
    </div>
  );
};

const InstitutionalMetrics: React.FC<{ results: BacktestResults }> = ({ results }) => {
  const m = results.aggregate_metrics;
  const e = results.expectancy_metrics;
  const cards = [
    {
      label: 'System Quality',
      value: e ? fmt.f2(e.system_quality_number) : '—',
      sub: e ? (e.system_quality_number >= 3 ? 'excellent SQN' : e.system_quality_number >= 2 ? 'tradeable SQN' : 'needs proof') : 'SQN unavailable',
      tone: e && e.system_quality_number >= 2 ? 'gain' : 'neutral',
    },
    {
      label: 'Deflated Sharpe',
      value: fmt.f3(m.deflated_sharpe_ratio),
      sub: m.deflated_sharpe_ratio >= 0.7 ? 'strong evidence' : m.deflated_sharpe_ratio >= 0.5 ? 'mixed evidence' : 'weak evidence',
      tone: m.deflated_sharpe_ratio >= 0.7 ? 'gain' : m.deflated_sharpe_ratio < 0.5 ? 'loss' : 'neutral',
    },
    {
      label: 'Expectancy / Trade',
      value: e ? fmt.dollar(e.expectancy_per_trade) : '—',
      sub: e ? `${fmt.f2(e.expectancy_per_dollar)}R per trade` : 'R multiple unavailable',
      tone: e && e.expectancy_per_trade > 0 ? 'gain' : e && e.expectancy_per_trade < 0 ? 'loss' : 'neutral',
    },
    {
      label: 'Recovery Factor',
      value: e ? fmt.f2(e.recovery_factor) : '—',
      sub: 'net profit / max DD',
      tone: e && e.recovery_factor > 0.5 ? 'gain' : e && e.recovery_factor < 0 ? 'loss' : 'neutral',
    },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
      {cards.map((card) => {
        const color = card.tone === 'gain' ? 'var(--ds-gain)' : card.tone === 'loss' ? 'var(--ds-loss)' : 'var(--foreground)';
        return (
          <div key={card.label} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 11px', background: 'var(--background)' }}>
            <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '0 0 5px', fontWeight: 600 }}>{card.label}</p>
            <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 3px', color, fontVariantNumeric: 'tabular-nums' }}>{card.value}</p>
            <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: 0 }}>{card.sub}</p>
          </div>
        );
      })}
    </div>
  );
};

const WalkForwardPanel: React.FC<{ results: BacktestResults }> = ({ results }) => {
  const wf = results.walk_forward;
  if (!wf) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {wf.warning && (
        <div style={{ gridColumn: '1 / -1', border: '1px solid var(--ds-loss)', borderRadius: 8, padding: '8px 10px', color: 'var(--ds-loss)', fontSize: 11 }}>
          {wf.warning}
        </div>
      )}
      <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
        <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '0 0 4px' }}>Walk-forward efficiency</p>
        <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{fmt.pct(wf.oos_vs_insample_ratio)}</p>
      </div>
      <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
        <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '0 0 4px' }}>Out-of-sample Sharpe</p>
        <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{fmt.f2(wf.oos_sharpe)}</p>
      </div>
    </div>
  );
};

const ImprovementPanel: React.FC<{
  verdict?: string;
  suggestions: ImprovementSuggestion[];
  onApply: (patch?: ImprovementActionPatch) => void;
}> = ({ verdict, suggestions, onApply }) => {
  if (!suggestions.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {verdict && <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '0 0 4px', lineHeight: 1.6 }}>{verdict}</p>}
      {suggestions.map((s) => (
        <div key={`${s.rank}-${s.title}`} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '11px 12px', background: 'var(--background)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 35%, var(--border))', borderRadius: 999, padding: '2px 7px' }}>{s.category}</span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{s.title}</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--foreground)', margin: '0 0 6px', lineHeight: 1.55 }}>{s.explanation}</p>
          <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '0 0 9px' }}>{s.expected_impact}</p>
          <button
            onClick={() => onApply(s.action_patch)}
            disabled={!s.action_patch}
            style={{ fontSize: 11, fontWeight: 600, background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 9px', cursor: s.action_patch ? 'pointer' : 'not-allowed', color: 'var(--foreground)' }}
          >
            Apply This Improvement
          </button>
        </div>
      ))}
    </div>
  );
};

// ─── Regime table ─────────────────────────────────────────────────────────────────
const RegimeTable: React.FC<{ results: BacktestResults }> = ({ results }) => {
  const rows: { label: string; m: PartitionMetrics; state: number }[] = [
    { label: REGIME_LABELS[0], m: results.regime_metrics.risk_on,       state: 0 },
    { label: REGIME_LABELS[1], m: results.regime_metrics.transitional,  state: 1 },
    { label: REGIME_LABELS[2], m: results.regime_metrics.risk_off,      state: 2 },
  ];
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Regime', 'Days', 'Sharpe', 'MDD', 'Win Rate', 'Ann. Return'].map((h) => (
              <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Regime' ? 'left' : 'right', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 11 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, m, state }) => (
            <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: regimeColor(state), display: 'inline-block', flexShrink: 0 }} />{label}
              </td>
              <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.days_in_regime}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: m.sharpe_ratio > 0 ? 'var(--ds-gain)' : m.sharpe_ratio < 0 ? 'var(--ds-loss)' : undefined }}>{fmt.f2(m.sharpe_ratio)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: m.max_drawdown > 0.25 ? 'var(--ds-loss)' : undefined }}>{fmt.pct(m.max_drawdown)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt.pct(m.win_rate)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: m.annualized_return > 0 ? 'var(--ds-gain)' : m.annualized_return < 0 ? 'var(--ds-loss)' : undefined }}>{fmt.pct(m.annualized_return)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Attribution chart ────────────────────────────────────────────────────────────
const AttributionChart: React.FC<{ results: BacktestResults; onBar: (id: string) => void }> = ({ results, onBar }) => {
  const data = [...results.signal_attribution].sort((a, b) => b.marginal_sharpe - a.marginal_sharpe);
  return (
    <ResponsiveContainer width="100%" height={Math.max(100, data.length * 42)}>
      <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20, top: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="signal_id" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
        <RechartsTip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [v.toFixed(3), 'Marginal Sharpe']} />
        <Bar dataKey="marginal_sharpe" radius={[0, 4, 4, 0]} onClick={(d) => onBar(d.signal_id)}>
          {data.map((e) => <Cell key={e.signal_id} fill={e.marginal_sharpe >= 0 ? 'var(--ds-gain)' : 'var(--ds-loss)'} style={{ cursor: 'pointer' }} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

// ─── Trade log ────────────────────────────────────────────────────────────────────
const TradeLog: React.FC<{ results: BacktestResults }> = ({ results }) => {
  const [expanded, setExpanded] = useState(false);
  const trades = results.trade_log;
  const shown = expanded ? trades : trades.slice(0, 6);
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Entry', 'Exit', 'Dur.', 'P&L', 'Regime'].map((h) => (
              <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 11 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((t, i) => {
            const pos = t.pnl_pct > 0.005;
            const neg = t.pnl_pct < -0.005;
            return (
              <tr key={i} style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}>
                <td style={{ padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>{t.entry_ts}</td>
                <td style={{ padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>{t.exit_ts}</td>
                <td style={{ padding: '6px 10px' }}>{t.duration_days.toFixed(0)}d</td>
                <td style={{ padding: '6px 10px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: pos ? 'var(--ds-gain)' : neg ? 'var(--ds-loss)' : undefined }}>{fmt.pct(t.pnl_pct)}</td>
                <td style={{ padding: '6px 10px' }}><span style={{ fontSize: 10, color: regimeColor(t.regime_at_entry) }}>{REGIME_LABELS[t.regime_at_entry]}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {trades.length > 6 && (
        <button onClick={() => setExpanded(!expanded)} style={{ marginTop: 8, width: '100%', fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '6px 0' }}>
          {expanded ? 'Show fewer' : `Show all ${trades.length} trades`}
        </button>
      )}
    </div>
  );
};

// ─── Section header (canvas content) ─────────────────────────────────────────────
const SH: React.FC<{ icon: React.ReactNode; title: string; sub?: string }> = ({ icon, title, sub }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
    <span style={{ color: 'var(--primary)', display: 'flex', flexShrink: 0 }}>{icon}</span>
    <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
    {sub && <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 4 }}>{sub}</span>}
  </div>
);

// ─── Composer (Quick Build form) ──────────────────────────────────────────────────
const Composer: React.FC<{
  signals: SignalConfig[]; setSignals: (s: SignalConfig[]) => void;
  entryOp: Operator; setEntryOp: (o: Operator) => void;
  exitOp: Operator; setExitOp: (o: Operator) => void;
  sizing: PositionSizing; setSizing: (p: PositionSizing) => void;
  name: string; setName: (s: string) => void;
  instrument: string; setInstrument: (s: string) => void;
  dateRange: { start_date: string; end_date: string }; setDateRange: (r: { start_date: string; end_date: string }) => void;
  startingCapital: number; setStartingCapital: (n: number) => void;
  comparison: boolean; setComparison: (b: boolean) => void;
  library: SignalLibrary | null;
}> = ({
  signals, setSignals, entryOp, setEntryOp, exitOp, setExitOp,
  sizing, setSizing, name, setName, instrument, setInstrument,
  dateRange, setDateRange, startingCapital, setStartingCapital,
  comparison, setComparison, library,
}) => {
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4, fontWeight: 600 };
  const inp: React.CSSProperties = { padding: '7px 10px', fontSize: 12, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--foreground)', width: '100%', boxSizing: 'border-box' };
  const activeIds = new Set(signals.map((s) => s.signal_id));

  return (
    <div style={{ display: 'flex', gap: 24 }}>
      {/* Left: form fields */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={lbl}>Strategy name</label><input style={inp} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label style={lbl}>Instrument</label><input style={inp} value={instrument} onChange={(e) => setInstrument(e.target.value.toUpperCase())} placeholder="SPY" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div><label style={lbl}>Start date</label><input type="date" style={inp} value={dateRange.start_date} onChange={(e) => setDateRange({ ...dateRange, start_date: e.target.value })} /></div>
          <div><label style={lbl}>End date</label><input type="date" style={inp} value={dateRange.end_date} onChange={(e) => setDateRange({ ...dateRange, end_date: e.target.value })} /></div>
          <div><label style={lbl}>Capital ($)</label><input type="number" style={inp} value={startingCapital} min={1000} step={1000} onChange={(e) => setStartingCapital(Math.max(1000, Number(e.target.value)))} /></div>
        </div>

        {/* Active signals */}
        <div>
          <span style={lbl}>Active signals</span>
          {signals.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0, padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: 7, textAlign: 'center' }}>
              Pick signals from the library →
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {signals.map((s) => (
              <div key={s.signal_id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', background: 'var(--muted)', borderRadius: 7 }}>
                <code style={{ fontSize: 10, flex: 1, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.signal_id}</code>
                <select style={{ ...inp, width: 90 }} value={s.direction} onChange={(e) => setSignals(signals.map((x) => x.signal_id === s.signal_id ? { ...x, direction: e.target.value as Direction } : x))}>
                  {(['Above','Below','CrossUp','CrossDown'] as Direction[]).map((d) => <option key={d}>{d}</option>)}
                </select>
                <input type="number" style={{ ...inp, width: 68 }} value={s.threshold} step={0.1} onChange={(e) => setSignals(signals.map((x) => x.signal_id === s.signal_id ? { ...x, threshold: Number(e.target.value) } : x))} />
                <button onClick={() => setSignals(signals.filter((x) => x.signal_id !== s.signal_id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex' }}><X size={12} /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Logic + sizing */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div><label style={lbl}>Entry logic</label><select style={inp} value={entryOp} onChange={(e) => setEntryOp(e.target.value as Operator)}><option>AND</option><option>OR</option></select></div>
          <div><label style={lbl}>Exit logic</label><select style={inp} value={exitOp} onChange={(e) => setExitOp(e.target.value as Operator)}><option>AND</option><option>OR</option></select></div>
          <div><label style={lbl}>Position sizing</label>
            <select style={inp} value={sizing.method} onChange={(e) => {
              const m = e.target.value as PositionSizing['method'];
              setSizing(m === 'FixedFractional' ? { method: 'FixedFractional', fraction: 0.95 } : m === 'Kelly' ? { method: 'Kelly', kelly_fraction: 0.5 } : m === 'VolTarget' ? { method: 'VolTarget', target_annual_vol: 0.10 } : { method: 'EqualWeight' });
            }}>
              <option value="FixedFractional">Fixed Frac.</option>
              <option value="Kelly">Kelly</option>
              <option value="VolTarget">Vol Target</option>
              <option value="EqualWeight">Equal Weight</option>
            </select>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--muted-foreground)' }}>
          <input type="checkbox" checked={comparison} onChange={(e) => setComparison(e.target.checked)} />
          Compare to 12-1 momentum baseline
        </label>
      </div>

      {/* Right: signal library */}
      <div style={{ width: 210, flexShrink: 0 }}>
        <span style={lbl}>Signal library</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 340, overflowY: 'auto' }}>
          {!library && <p style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Loading…</p>}
          {library?.signals.map((s) => {
            const active = activeIds.has(s.signal_id);
            return (
              <div key={s.signal_id} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'color-mix(in srgb, var(--primary) 6%, var(--card))' : 'var(--card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{s.label}</span>
                  <button
                    disabled={active}
                    onClick={() => !active && setSignals([...signals, { signal_id: s.signal_id, signal_type: s.signal_type, threshold: 0, direction: 'Above', weight: 1 / (signals.length + 1) }])}
                    style={{ fontSize: 10, background: active ? 'transparent' : 'var(--primary)', color: active ? 'var(--primary)' : 'var(--primary-foreground)', border: active ? 'none' : 'none', borderRadius: 5, padding: '2px 7px', cursor: active ? 'default' : 'pointer', flexShrink: 0, fontWeight: 600 }}
                  >
                    {active ? '✓' : '+'}
                  </button>
                </div>
                <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '3px 0 0', lineHeight: 1.4 }}>{s.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Bottom input bar ─────────────────────────────────────────────────────────────
const BottomBar: React.FC<{
  onSubmit: (q: string) => void;
  busy: boolean;
  showingBuilder: boolean;
  onToggleBuilder: () => void;
  onRunBuilder: () => void;
  builderDisabled: boolean;
}> = ({ onSubmit, busy, showingBuilder, onToggleBuilder, onRunBuilder, builderDisabled }) => {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [value]);

  const submit = () => {
    const v = value.trim();
    if (!v || busy) return;
    onSubmit(v);
    setValue('');
  };

  return (
    <div style={{
      padding: '12px 20px 16px',
    }}>
      {/* Input container */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 8,
        background: 'var(--background)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '8px 10px 8px 12px',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.04)',
        transition: 'border-color 0.15s',
      }}
        onFocus={() => {}}
      >
        {/* Quick Build toggle */}
        <button
          onClick={onToggleBuilder}
          title={showingBuilder ? 'Close builder' : 'Quick Build — configure signals manually'}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 9px', borderRadius: 7, border: '1px solid var(--border)',
            background: showingBuilder ? 'var(--primary)' : 'var(--muted)',
            color: showingBuilder ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            cursor: 'pointer', fontSize: 11, fontWeight: 600, flexShrink: 0,
            alignSelf: 'flex-end', marginBottom: 2,
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {showingBuilder ? <X size={11} /> : <SlidersHorizontal size={11} />}
          <span>{showingBuilder ? 'Close' : 'Quick Build'}</span>
        </button>

        {/* Textarea */}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={showingBuilder ? 'Configure your strategy above, then press Run →' : 'Describe a strategy — instrument, signals, logic, time window…'}
          rows={1}
          disabled={busy || showingBuilder}
          style={{
            flex: 1, resize: 'none', border: 'none', outline: 'none',
            background: 'transparent', color: showingBuilder ? 'var(--muted-foreground)' : 'var(--foreground)',
            font: 'inherit', fontSize: 13.5, lineHeight: 1.5,
            padding: '4px 0', minHeight: 28, maxHeight: 120,
          }}
        />

        {/* Run button */}
        <button
          onClick={showingBuilder ? onRunBuilder : submit}
          disabled={busy || (showingBuilder ? builderDisabled : !value.trim())}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px',
            background: 'var(--primary)', color: 'var(--primary-foreground)',
            border: 'none', borderRadius: 8,
            fontSize: 12, fontWeight: 600,
            cursor: (busy || (showingBuilder ? builderDisabled : !value.trim())) ? 'not-allowed' : 'pointer',
            opacity: (busy || (showingBuilder ? builderDisabled : !value.trim())) ? 0.45 : 1,
            flexShrink: 0, alignSelf: 'flex-end', marginBottom: 2,
            transition: 'opacity 0.15s',
          }}
        >
          {busy
            ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Running…</>
            : <><span>Run</span><ArrowRight size={12} /></>}
        </button>
      </div>
      <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '6px 0 0 2px' }}>
        Research intelligence only — not financial advice.
      </p>
    </div>
  );
};

// ─── Landing state ────────────────────────────────────────────────────────────────
const Landing: React.FC<{ onTemplate: (t: Template) => void }> = ({ onTemplate }) => (
  <div style={{
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '48px 32px 24px', textAlign: 'center',
  }}>
    <Zap size={28} style={{ color: 'var(--primary)', marginBottom: 14 }} />
    <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.02em', color: 'var(--foreground)' }}>
      What strategy do you want to backtest?
    </h2>
    <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 28px', maxWidth: 400, lineHeight: 1.6 }}>
      Describe your idea below, or choose a starting template.
    </p>

    {/* Compact template list — two columns */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxWidth: 580, width: '100%' }}>
      {TEMPLATES.map((t) => (
        <button
          key={t.key}
          onClick={() => onTemplate(t)}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 9,
            padding: '10px 14px',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 10,
            transition: 'border-color 0.12s, background 0.12s',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = 'var(--primary)';
            el.style.background = 'color-mix(in srgb, var(--primary) 5%, var(--card))';
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = 'var(--border)';
            el.style.background = 'var(--card)';
          }}
        >
          <span style={{ color: 'var(--primary)', display: 'flex', flexShrink: 0 }}>{t.icon}</span>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
            <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)', lineHeight: 1.4, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.blurb}</span>
          </div>
        </button>
      ))}
    </div>
  </div>
);

// ─── History row (left rail) ──────────────────────────────────────────────────────
const HistoryRow: React.FC<{ entry: HistoryEntry; active: boolean; onClick: () => void }> = ({
  entry, active, onClick,
}) => (
  <button
    onClick={onClick}
    style={{
      width: '100%', textAlign: 'left',
      background: active ? 'color-mix(in srgb, var(--primary) 8%, var(--card))' : 'none',
      border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
      borderLeft: active ? '2px solid var(--primary)' : '2px solid transparent',
    }}
  >
    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--muted-foreground)' }}>
      <span style={{ background: 'var(--muted)', borderRadius: 4, padding: '1px 5px', fontFamily: 'var(--font-mono)' }}>{entry.instrument}</span>
      <span>SR {entry.sharpe.toFixed(2)}</span>
      <span style={{ marginLeft: 'auto' }}>{fmt.rel(entry.ts)}</span>
    </div>
  </button>
);

// ─── Main page ────────────────────────────────────────────────────────────────────
export function Backtesting() {
  const { state: bt, runFromQuery, runFromSpec, reset } = useBacktest();

  // Composer state
  const [signals, setSignals]           = useState<SignalConfig[]>([]);
  const [entryOp, setEntryOp]           = useState<Operator>('AND');
  const [exitOp, setExitOp]             = useState<Operator>('OR');
  const [sizing, setSizing]             = useState<PositionSizing>({ method: 'VolTarget', target_annual_vol: 0.10 });
  const [name, setName]                 = useState('My Strategy');
  const [instrument, setInstrument]     = useState('SPY');
  const [startingCapital, setStartingCapital] = useState(10_000);
  const [comparison, setComparison]     = useState(false);
  const [dateRange, setDateRange]       = useState({ start_date: '2015-01-01', end_date: TODAY });

  // UI state
  const [canvasState, setCanvasState]   = useState<CanvasState>('landing');
  const [showBuilder, setShowBuilder]   = useState(false);
  const [yMode, setYMode]               = useState<YAxisMode>('dollar');
  const [panelOpen, setPanelOpen]       = useState(true);
  const [railOpen, setRailOpen]         = useState(true);

  // History
  const [history, setHistory]           = useState<HistoryEntry[]>([]);
  const resultsCache                    = useRef<Map<string, BacktestResults>>(new Map());
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [cachedDisplay, setCachedDisplay] = useState<BacktestResults | null>(null);

  // Commentary
  const [commentaryModal, setCommentaryModal] = useState<{ title: string; narrative: string | null } | null>(null);
  const commentaryCache = useRef<Map<string, string>>(new Map());

  // Signal library
  const [library, setLibrary]           = useState<SignalLibrary | null>(null);
  useEffect(() => { getSignalLibrary().then(setLibrary).catch(() => {}); }, []);

  // Drive canvas state from bt state
  useEffect(() => {
    if (bt.isRunning) { setCanvasState('running'); return; }
    if (bt.results) { setCanvasState('results'); return; }
    if (canvasState === 'running') setCanvasState('landing');
  }, [bt.isRunning, bt.results]);

  // Record completed run to history
  useEffect(() => {
    if (!bt.results || bt.isRunning) return;
    const id = bt.resolvedSpec?.id ?? `h_${Date.now()}`;
    if (resultsCache.current.has(id)) return;
    const entry: HistoryEntry = {
      id,
      name: bt.resolvedSpec?.name ?? 'Strategy',
      instrument: bt.resolvedSpec?.instrument ?? 'SPY',
      sharpe: bt.results.aggregate_metrics.sharpe_ratio,
      cagr: bt.results.aggregate_metrics.cagr,
      ts: Date.now(),
      spec: bt.resolvedSpec!,
    };
    resultsCache.current.set(id, bt.results);
    setHistory((h) => [entry, ...h.filter((x) => x.id !== id)].slice(0, 20));
    setActiveHistoryId(id);
  }, [bt.results, bt.isRunning]);

  const openCommentary = useCallback(async (title: string, query: string, metrics: Record<string, string | number>) => {
    const cached = commentaryCache.current.get(title);
    if (cached) { setCommentaryModal({ title, narrative: cached }); return; }
    setCommentaryModal({ title, narrative: null });
    try {
      const { narrative } = await requestCommentary({ query, metrics });
      commentaryCache.current.set(title, narrative);
      setCommentaryModal({ title, narrative });
    } catch {
      setCommentaryModal({ title, narrative: 'Commentary unavailable.' });
    }
  }, []);

  const handleTemplate = (t: Template) => {
    if (t.key === 'custom') { setShowBuilder(true); setCanvasState('building'); return; }
    setSignals(t.signals);
    setSizing(t.sizing);
    setEntryOp(t.entryOp);
    setExitOp(t.exitOp);
    setName(t.name);
    setShowBuilder(true);
    setCanvasState('building');
  };

  const handleBuilderRun = () => {
    if (signals.length === 0) return;
    setShowBuilder(false);
    const spec = buildSpec({ name, date_range: dateRange }, signals, entryOp, exitOp, sizing, comparison, instrument, startingCapital);
    runFromSpec(spec, name);
  };

  const applyImprovement = useCallback((patch?: ImprovementActionPatch) => {
    if (!patch) return;
    const base = bt.resolvedSpec ?? buildSpec({ name, date_range: dateRange }, signals, entryOp, exitOp, sizing, comparison, instrument, startingCapital);
    let nextSignals = [...base.signals];
    let nextEntryOp = base.entry_logic.operator;
    let nextExitOp = base.exit_logic.operator;
    let nextSizing = base.position_sizing;
    let nextRisk = { ...base.risk_params };

    if (patch.type === 'remove_signal' && patch.signal_id) {
      nextSignals = nextSignals.filter((s) => s.signal_id !== patch.signal_id);
    }
    if (patch.type === 'add_or_update_signal' && patch.signal) {
      const existing = nextSignals.some((s) => s.signal_id === patch.signal!.signal_id);
      nextSignals = existing
        ? nextSignals.map((s) => s.signal_id === patch.signal!.signal_id ? { ...s, ...patch.signal! } : s)
        : [...nextSignals, patch.signal];
      if (patch.entry_operator) nextEntryOp = patch.entry_operator;
      if (patch.exit_operator) nextExitOp = patch.exit_operator;
    }
    if (patch.type === 'set_rebalance_freq' && patch.value) {
      nextRisk = { ...nextRisk, rebalance_freq: patch.value };
    }
    if (patch.type === 'set_position_sizing') {
      if (patch.method === 'Kelly') nextSizing = { method: 'Kelly', kelly_fraction: patch.kelly_fraction ?? 0.5 };
      if (patch.method === 'VolTarget') nextSizing = { method: 'VolTarget', target_annual_vol: patch.target_annual_vol ?? 0.10 };
      if (patch.method === 'EqualWeight') nextSizing = { method: 'EqualWeight' };
      if (patch.method === 'FixedFractional') nextSizing = { method: 'FixedFractional', fraction: 0.95 };
    }
    if (nextSignals.length === 0) return;
    const weight = 1 / nextSignals.length;
    nextSignals = nextSignals.map((s) => ({ ...s, weight }));

    setSignals(nextSignals);
    setEntryOp(nextEntryOp);
    setExitOp(nextExitOp);
    setSizing(nextSizing);
    setName(`${base.name} Improved`);
    setInstrument(base.instrument ?? instrument);
    setDateRange(base.date_range);
    setStartingCapital(base.starting_capital ?? startingCapital);
    setComparison(Boolean(base.comparison_mode));
    setShowBuilder(false);
    setCachedDisplay(null);

    const spec = buildSpec(
      {
        ...base,
        id: `${base.id}_improved_${Date.now()}`,
        name: `${base.name} Improved`,
        date_range: base.date_range,
        risk_params: nextRisk,
        cost_model: base.cost_model,
      },
      nextSignals,
      nextEntryOp,
      nextExitOp,
      nextSizing,
      Boolean(base.comparison_mode),
      base.instrument ?? instrument,
      base.starting_capital ?? startingCapital,
    );
    runFromSpec(spec, spec.name);
  }, [bt.resolvedSpec, comparison, dateRange, entryOp, exitOp, instrument, name, runFromSpec, signals, sizing, startingCapital]);

  const handleHistoryClick = (entry: HistoryEntry) => {
    const r = resultsCache.current.get(entry.id);
    if (!r) return;
    reset();
    setActiveHistoryId(entry.id);
    setCachedDisplay(r);
    setCanvasState('results');
  };

  const displayResults = bt.results ?? cachedDisplay;

  const handleNewStrategy = () => {
    reset();
    setCachedDisplay(null);
    setActiveHistoryId(null);
    setCanvasState('landing');
    setShowBuilder(false);
  };

  const isRunning = bt.isRunning;
  const steps     = bt.steps;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--background)' }}>

      {/* ── Left rail ── */}
      <aside style={{
        width: railOpen ? RAIL_W : 40, flexShrink: 0,
        background: 'var(--card)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.2s ease',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: railOpen ? '12px 12px 10px' : '12px 8px 10px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          {railOpen && (
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Backtesting</p>
          )}
          <button
            onClick={() => setRailOpen((o) => !o)}
            title={railOpen ? 'Collapse panel' : 'Expand panel'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--muted-foreground)', display: 'flex', padding: 4, borderRadius: 6,
              marginLeft: railOpen ? 'auto' : 0,
            }}
          >
            <PanelLeft size={15} />
          </button>
        </div>

        {railOpen && (
          <>
            <div style={{ padding: '8px 8px 4px' }}>
              <button
                onClick={handleNewStrategy}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                  padding: '7px 10px', borderRadius: 8,
                  background: 'var(--primary)', color: 'var(--primary-foreground)',
                  border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}
              >
                <Plus size={12} /> New strategy
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 4px' }}>
              {history.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--muted-foreground)', padding: '12px 10px', margin: 0, lineHeight: 1.6 }}>
                  Completed runs appear here.
                </p>
              )}
              {history.map((entry) => (
                <HistoryRow
                  key={entry.id}
                  entry={entry}
                  active={entry.id === activeHistoryId}
                  onClick={() => handleHistoryClick(entry)}
                />
              ))}
            </div>

            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.5 }}>
                Causal HMM · t+1 lag · Lo Sharpe · DSR
              </p>
            </div>
          </>
        )}
      </aside>

      {/* ── Center canvas ── */}
      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        minWidth: 0, ...canvasBg, overflow: 'hidden',
      }}>
        {/* Scrollable canvas body */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* Landing */}
          {canvasState === 'landing' && !showBuilder && (
            <Landing onTemplate={handleTemplate} />
          )}

          {/* Quick Build form */}
          {showBuilder && canvasState !== 'running' && canvasState !== 'results' && (
            <div style={{ padding: '20px 24px', flex: 1 }}>
              <div style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '20px 22px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                  <SlidersHorizontal size={14} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Quick Build</span>
                  <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 4 }}>configure signals &amp; parameters manually</span>
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
                  library={library}
                />
              </div>
            </div>
          )}

          {/* Running */}
          {canvasState === 'running' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 24px' }}>
              <div style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 14, padding: '24px 28px',
                maxWidth: 460, width: '100%',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
              }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 16px' }}>
                  Execution trace · {steps.filter((s) => s.state === 'done').length}/{steps.length} steps
                </p>
                <StepChain steps={steps} />
              </div>
            </div>
          )}

          {/* Results */}
          {canvasState === 'results' && displayResults && (
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {bt.error && (
                <div style={{ background: 'color-mix(in srgb, var(--ds-loss) 10%, var(--card))', border: '1px solid var(--ds-loss)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <AlertTriangle size={14} style={{ color: 'var(--ds-loss)', marginTop: 1, flexShrink: 0 }} />
                  <p style={{ fontSize: 12, margin: 0, color: 'var(--ds-loss)' }}>{bt.error}</p>
                </div>
              )}

              {/* Dollar hero */}
              {displayResults.dollar_summary && (() => {
                const ds = displayResults.dollar_summary!;
                const enhPnl = ds.enhanced_final - ds.starting_capital;
                const bhPnl  = ds.buy_hold_final - ds.starting_capital;
                const alpha  = enhPnl - bhPnl;
                const query  = bt.resolvedSpec?.name ?? 'Strategy';
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {[
                      { label: 'Strategy P&L', val: fmt.dollar(Math.abs(enhPnl)), sub: `${fmt.pct(displayResults.aggregate_metrics.cagr)} CAGR`, tone: enhPnl >= 0 ? 'gain' : 'loss', accent: true, key: 'Performance' },
                      { label: 'Buy-Hold P&L', val: fmt.dollar(Math.abs(bhPnl)), sub: `from ${fmt.dollar(ds.starting_capital)}`, tone: bhPnl >= 0 ? 'gain' : 'loss', key: 'BH' },
                      { label: 'Alpha vs B&H', val: fmt.dollar(Math.abs(alpha)), sub: `${alpha >= 0 ? '+' : ''}${fmt.pct(alpha / ds.starting_capital)}`, tone: alpha >= 0 ? 'gain' : 'loss', key: 'Alpha' },
                    ].map(({ label, val, sub, tone, accent, key }) => {
                      const color = tone === 'gain' ? 'var(--ds-gain)' : 'var(--ds-loss)';
                      return (
                        <div
                          key={key}
                          onClick={() => openCommentary(label, query, { CAGR: fmt.pct(displayResults.aggregate_metrics.cagr), 'Max DD': fmt.pct(displayResults.aggregate_metrics.max_drawdown) })}
                          style={{ background: 'var(--card)', border: `1px solid ${accent ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 11, padding: '14px 16px', cursor: 'pointer' }}
                        >
                          <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '0 0 6px', fontWeight: 600 }}>{label}</p>
                          <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em', color, fontVariantNumeric: 'tabular-nums' }}>{val}</p>
                          <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: 0 }}>{sub}</p>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Equity chart */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 11, padding: '16px 18px' }}>
                <SH icon={<TrendingUp size={13} />} title="Equity curve" sub={`through ${displayResults.data_through}`} />
                <EquityChart results={displayResults} yMode={yMode} onToggleY={() => setYMode((m) => m === 'dollar' ? 'pct' : 'dollar')} />
              </div>

              {/* Metrics */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 11, padding: '16px 18px' }}>
                <SH icon={<BarChart2 size={13} />} title="Aggregate metrics" sub="click any row for commentary" />
                <InstitutionalMetrics results={displayResults} />
                <MetricsGrid
                  metrics={displayResults.aggregate_metrics}
                  onRow={(k) => openCommentary(k, bt.resolvedSpec?.name ?? 'Strategy', { metric: k })}
                />
              </div>

              {/* Improvement loop */}
              {bt.improvements && (
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 11, padding: '16px 18px' }}>
                  <SH icon={<Zap size={13} />} title="Strategy Improvement Analysis" sub="ranked suggestions" />
                  <ImprovementPanel
                    verdict={bt.improvements.verdict}
                    suggestions={bt.improvements.suggestions}
                    onApply={applyImprovement}
                  />
                </div>
              )}

              {/* Regime breakdown */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 11, padding: '16px 18px' }}>
                <SH icon={<Activity size={13} />} title="Regime performance" />
                <RegimeTable results={displayResults} />
              </div>

              {/* Attribution */}
              {displayResults.signal_attribution.length > 0 && (
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 11, padding: '16px 18px' }}>
                  <SH icon={<BarChart2 size={13} />} title="Signal attribution" sub="marginal Sharpe · leave-one-out" />
                  <AttributionChart
                    results={displayResults}
                    onBar={(id) => openCommentary(`Signal: ${id}`, bt.resolvedSpec?.name ?? 'Strategy', { signal: id })}
                  />
                </div>
              )}

              {/* Trade log */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 11, padding: '16px 18px' }}>
                <SH icon={<BookOpen size={13} />} title="Trade log" sub={`${displayResults.trade_log.length} trades`} />
                <TradeLog results={displayResults} />
              </div>

              {/* AI commentary */}
              {bt.narrative && (
                <div style={{ background: 'color-mix(in srgb, var(--primary) 5%, var(--card))', border: '1px solid color-mix(in srgb, var(--primary) 30%, var(--border))', borderRadius: 11, padding: '16px 18px' }}>
                  <SH icon={<DollarSign size={13} />} title="Institutional commentary" />
                  <p style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--foreground)', margin: '0 0 10px' }}>{bt.narrative}</p>
                  <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: 0 }}>Research intelligence only. Not financial advice.</p>
                </div>
              )}

              {/* Forward context gate */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 11, padding: '16px 18px' }}>
                <SH icon={<Lock size={13} />} title="Forward context" sub="Institutional" />
                <TierGate tier="Institutional">
                  <WalkForwardPanel results={displayResults} />
                </TierGate>
              </div>

              <Disclaimer />
            </div>
          )}
        </div>

        {/* ── Bottom input bar — always visible, never inside scroll ── */}
        <BottomBar
          onSubmit={runFromQuery}
          busy={isRunning}
          showingBuilder={showBuilder && canvasState !== 'results' && canvasState !== 'running'}
          onToggleBuilder={() => {
            const next = !showBuilder;
            setShowBuilder(next);
            if (next && canvasState === 'landing') setCanvasState('building');
            if (!next && canvasState === 'building') setCanvasState('landing');
          }}
          onRunBuilder={handleBuilderRun}
          builderDisabled={signals.length === 0}
        />
      </main>

      {/* ── Right panel ── */}
      <aside style={{
        width: panelOpen ? PANEL_W : 40, flexShrink: 0,
        background: 'var(--card)',
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflowY: panelOpen ? 'auto' : 'hidden',
        overflowX: 'hidden',
        transition: 'width 0.2s ease',
      }}>
        {/* Panel header + toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: panelOpen ? '12px 14px 10px' : '12px 8px 10px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          {panelOpen && (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Run details
            </span>
          )}
          <button
            onClick={() => setPanelOpen((o) => !o)}
            title={panelOpen ? 'Collapse panel' : 'Expand panel'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--muted-foreground)', display: 'flex', padding: 4, borderRadius: 6,
              marginLeft: panelOpen ? 'auto' : 0,
            }}
          >
            <PanelLeft size={15} style={{ transform: 'scaleX(-1)' }} />
          </button>
        </div>

        {panelOpen && (
          <>
            {/* Progress */}
            <Accordion title="Progress">
              {steps.every((s) => s.state === 'pending') ? (
                <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.6 }}>Steps appear as the run executes.</p>
              ) : (
                <StepChain steps={steps} />
              )}
            </Accordion>

            {/* Signals */}
            <Accordion title="Signals" defaultOpen={false}>
              {(bt.resolvedSpec?.signals ?? signals).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(bt.resolvedSpec?.signals ?? signals).map((s) => (
                    <div key={s.signal_id} style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--background)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <code style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 600 }}>{s.signal_id}</code>
                        <span style={{ fontSize: 10, color: 'var(--muted-foreground)', background: 'var(--muted)', borderRadius: 4, padding: '1px 5px' }}>{s.direction}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--muted-foreground)' }}>
                        <span>threshold {s.threshold}</span>
                        <span>weight {s.weight.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0 }}>No signals configured yet.</p>
              )}
            </Accordion>

            {/* Artifacts */}
            <Accordion title="Artifacts">
              {displayResults ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <MetricRow label="System Quality" value={displayResults.expectancy_metrics ? fmt.f2(displayResults.expectancy_metrics.system_quality_number) : '—'} tone={(displayResults.expectancy_metrics?.system_quality_number ?? 0) >= 2 ? 'gain' : 'neutral'} />
                  <MetricRow label="Deflated Sharpe" value={fmt.f3(displayResults.aggregate_metrics.deflated_sharpe_ratio)} tone={displayResults.aggregate_metrics.deflated_sharpe_ratio > 0 ? 'gain' : 'loss'} />
                  <MetricRow label="Expectancy / Trade" value={displayResults.expectancy_metrics ? fmt.dollar(displayResults.expectancy_metrics.expectancy_per_trade) : '—'} tone={(displayResults.expectancy_metrics?.expectancy_per_trade ?? 0) > 0 ? 'gain' : 'loss'} />
                  <MetricRow label="Recovery Factor" value={displayResults.expectancy_metrics ? fmt.f2(displayResults.expectancy_metrics.recovery_factor) : '—'} />
                  <MetricRow label="Sharpe (Lo-adj.)" value={fmt.f3(displayResults.aggregate_metrics.sharpe_ratio)} tone={displayResults.aggregate_metrics.sharpe_ratio > 0.5 ? 'gain' : displayResults.aggregate_metrics.sharpe_ratio < 0 ? 'loss' : 'neutral'} />
                  <MetricRow label="CAGR" value={fmt.pct(displayResults.aggregate_metrics.cagr)} tone={displayResults.aggregate_metrics.cagr > 0 ? 'gain' : 'loss'} />
                  <MetricRow label="Max Drawdown" value={fmt.pct(displayResults.aggregate_metrics.max_drawdown)} tone={displayResults.aggregate_metrics.max_drawdown > 0.3 ? 'loss' : 'neutral'} />
                  <MetricRow label="Bars" value={displayResults.bars.toLocaleString()} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                  <BarChart2 size={24} style={{ color: 'var(--border)' }} />
                  <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>Outputs appear after the run completes.</p>
                </div>
              )}
            </Accordion>

            {/* Context */}
            <Accordion title="Context" defaultOpen={false}>
              {bt.resolvedSpec || displayResults ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {[
                    ['Strategy', bt.resolvedSpec?.name ?? '—'],
                    ['Instrument', bt.resolvedSpec?.instrument ?? '—'],
                    ['Start', bt.resolvedSpec?.date_range.start_date ?? '—'],
                    ['End', bt.resolvedSpec?.date_range.end_date ?? '—'],
                    ['Signals', bt.resolvedSpec?.signals.length ? `${bt.resolvedSpec.signals.length} configured` : '—'],
                    ['Sizing', bt.resolvedSpec?.position_sizing.method ?? '—'],
                    ['Data through', displayResults?.data_through ?? '—'],
                  ].map(([k, v]) => (
                    <MetricRow key={k} label={k} value={v} />
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                  <Activity size={24} style={{ color: 'var(--border)' }} />
                  <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>Strategy config tracks here as it runs.</p>
                </div>
              )}
            </Accordion>
          </>
        )}
      </aside>

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

export default Backtesting;
