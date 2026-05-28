import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
  ComposedChart,
} from 'recharts';
import {
  Briefcase, Plus, ChevronDown, TrendingUp,
  Activity, BarChart3, ShieldAlert, PieChart, AlertCircle, X, Check,
  Loader2, LayoutDashboard, Brain, RefreshCw, Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePortfolioWorkspace } from '../../hooks/usePortfolioWorkspace';
import { isAwarenessWorkspaceEnabled } from '../../lib/portfolio/awarenessFlag';
import { logOpen } from '../../lib/telemetry';
import { usePortfolioPerformance } from '../../hooks/usePortfolioPerformance';
import { usePortfolioIntelligence } from '../../hooks/usePortfolioIntelligence';
import { DEFAULT_BENCHMARK_ID, BENCHMARK_REGISTRY } from '../../lib/portfolio/benchmarks';
import type { Portfolio, Holding } from '../../lib/portfolio/schemas';
import { PortfolioIntelligencePanel } from '../../components/portfolio/PortfolioIntelligencePanel';
import { AgentPortfolioInsights, type AgentIntelligenceFilter } from '../../components/portfolio/AgentPortfolioInsights';

// ─── Period options ────────────────────────────────────────────────────────

const PERIODS = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 252 },
] as const;

type PeriodLabel = typeof PERIODS[number]['label'];

const PeriodSelector: React.FC<{ active: PeriodLabel; onChange: (p: PeriodLabel) => void }> = ({ active, onChange }) => (
  <div style={{ display: 'flex', gap: 3 }}>
    {PERIODS.map(p => (
      <button
        key={p.label}
        onClick={() => onChange(p.label)}
        style={{
          padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700,
          border: `1px solid ${active === p.label ? 'var(--primary)' : 'var(--border)'}`,
          background: active === p.label ? 'var(--primary)' : 'transparent',
          color: active === p.label ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
          cursor: 'pointer', letterSpacing: '0.03em',
        }}
      >
        {p.label}
      </button>
    ))}
  </div>
);

// ─── Shared helpers ────────────────────────────────────────────────────────

function fmtPct(v: number, sign = true): string {
  if (!isFinite(v)) return '—';
  const s = (v * 100).toFixed(2);
  return sign && v >= 0 ? `+${s}%` : `${s}%`;
}
function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}
function fmtUSD(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '+';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}
function fmtValue(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

const PALETTE = {
  portfolio:  'var(--primary)',
  benchmark:  'var(--chart-2)',
  vol:        'var(--chart-4)',
  drawdown:   'var(--destructive)',
  grid:       'var(--border)',
  text:       'var(--muted-foreground)',
};

// ─── Tooltip components ───────────────────────────────────────────────────────

const PerfTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: any; benchmarkId?: string }> = ({ active, payload, benchmarkId }) => {
  if (!active || !payload?.length) return null;
  const p = payload.find((x: any) => x.dataKey === 'portfolio');
  const b = payload.find((x: any) => x.dataKey === 'benchmark');
  return (
    <div style={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
      {p && <p style={{ margin: 0, color: PALETTE.portfolio, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>Portfolio: {(p.value as number).toFixed(2)}</p>}
      {b && <p style={{ margin: '3px 0 0', color: PALETTE.benchmark, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{benchmarkId}: {(b.value as number).toFixed(2)}</p>}
    </div>
  );
};

const VolTooltip: React.FC<{ active?: boolean; payload?: any[] }> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number;
  return (
    <div style={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px', fontSize: 11 }}>
      <p style={{ margin: 0, color: PALETTE.vol, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>Vol: {v.toFixed(1)}%</p>
    </div>
  );
};

const DdTooltip: React.FC<{ active?: boolean; payload?: any[] }> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number;
  return (
    <div style={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px', fontSize: 11 }}>
      <p style={{ margin: 0, color: PALETTE.drawdown, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>Drawdown: {fmtPct(v)}</p>
    </div>
  );
};

// ─── Metric pill ──────────────────────────────────────────────────────────────

const MetricPill: React.FC<{ label: string; value: string; color?: string; accent?: boolean }> = ({ label, value, color, accent }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', gap: 2,
    padding: '8px 12px',
    background: accent ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'var(--muted)',
    border: `1px solid ${accent ? 'color-mix(in srgb, var(--primary) 20%, transparent)' : 'var(--border)'}`,
    borderRadius: 8,
    minWidth: 80,
  }}>
    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 700, color: color ?? 'var(--foreground)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{value}</span>
  </div>
);

// ─── Portfolio Value Input ────────────────────────────────────────────────────

const PortfolioValueInput: React.FC<{
  currentValue?: number;
  onSave: (v: number | undefined) => void;
}> = ({ currentValue, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');

  const start = () => {
    setRaw(currentValue != null ? String(currentValue) : '');
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseFloat(raw.replace(/[^0-9.]/g, ''));
    onSave(isNaN(parsed) || parsed <= 0 ? undefined : parsed);
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>$</span>
        <input
          autoFocus
          value={raw}
          onChange={e => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="e.g. 100000"
          style={{
            width: 110, padding: '4px 8px', borderRadius: 5, fontSize: 11,
            border: '1px solid var(--primary)', background: 'var(--background)',
            color: 'var(--foreground)', outline: 'none', fontVariantNumeric: 'tabular-nums',
          }}
        />
        <button onClick={commit} style={{ padding: '4px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', cursor: 'pointer' }}>
          Set
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={start}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
        borderRadius: 6, fontSize: 11, fontWeight: 600,
        background: currentValue != null ? 'color-mix(in srgb, var(--chart-2) 10%, transparent)' : 'var(--muted)',
        border: `1px solid ${currentValue != null ? 'color-mix(in srgb, var(--chart-2) 25%, transparent)' : 'var(--border)'}`,
        color: currentValue != null ? 'var(--chart-2)' : 'var(--muted-foreground)',
        cursor: 'pointer',
      }}
      title="Set total portfolio value to enable dollar P&L estimates"
    >
      {currentValue != null ? `${fmtValue(currentValue)} total` : '+ Set portfolio value'}
    </button>
  );
};

// ─── Create Portfolio Modal ───────────────────────────────────────────────────

type RiskProfile = 'conservative' | 'balanced' | 'growth' | 'aggressive';
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD'] as const;
const RISK_PROFILES: RiskProfile[] = ['conservative', 'balanced', 'growth', 'aggressive'];

export interface CreatePortfolioParams {
  name: string;
  benchmarkId: string;
  currency: string;
  startingCapital?: number;
  cashBalance?: number;
  riskProfile?: RiskProfile;
}

const CreatePortfolioModal: React.FC<{ onClose: () => void; onCreate: (params: CreatePortfolioParams) => void }> = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [capitalStr, setCapitalStr] = useState('');
  const [riskProfile, setRiskProfile] = useState<RiskProfile>('balanced');

  const startingCapital = capitalStr.trim() === '' ? undefined : Number(capitalStr);
  const capitalValid = startingCapital === undefined || (Number.isFinite(startingCapital) && startingCapital >= 0);
  // Create needs only a name (capital optional). Symbols are added afterwards in
  // Holdings & Watchlist, with price and share count.
  const canCreate = !!name.trim() && capitalValid;

  const submit = () => {
    if (!canCreate) return;
    onCreate({
      name: name.trim(),
      // Benchmark is no longer a creation-time choice — the service defaults it
      // (SPY); it can be changed later from the portfolio view.
      benchmarkId: DEFAULT_BENCHMARK_ID,
      currency,
      startingCapital,
      cashBalance: startingCapital,
      riskProfile,
    });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 400, maxWidth: '90vw', maxHeight: '88vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--foreground)' }}>New Portfolio</p>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Name */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Portfolio Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Growth Leaders, AI Thematic..."
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 10px', borderRadius: 6, fontSize: 13,
                border: '1px solid var(--border)', background: 'var(--background)',
                color: 'var(--foreground)', outline: 'none',
              }}
            />
          </div>

          {/* Capital setup */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Starting Capital
              </label>
              <input
                value={capitalStr}
                onChange={e => setCapitalStr(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder="e.g. 100000"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, fontSize: 13,
                  border: `1px solid ${capitalValid ? 'var(--border)' : 'var(--destructive)'}`,
                  background: 'var(--background)', color: 'var(--foreground)', outline: 'none',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
              <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>
                Simulated capital. Optional — enables cash & P&L tracking.
              </p>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Base Currency
              </label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', cursor: 'pointer' }}
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Risk profile */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Risk Profile
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {RISK_PROFILES.map(r => (
                <button
                  key={r}
                  onClick={() => setRiskProfile(r)}
                  style={{
                    flex: 1, padding: '7px 4px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    textTransform: 'capitalize',
                    border: `1px solid ${riskProfile === r ? 'var(--primary)' : 'var(--border)'}`,
                    background: riskProfile === r ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                    color: riskProfile === r ? 'var(--primary)' : 'var(--muted-foreground)',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Symbols are added after creation, in Holdings & Watchlist. */}
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
            Add holdings after creating — open <strong style={{ color: 'var(--foreground)', fontWeight: 600 }}>Holdings &amp; Watchlist</strong> and use <strong style={{ color: 'var(--foreground)', fontWeight: 600 }}>Add Holding</strong> to enter each symbol with its price and share count.
          </p>

          <button
            disabled={!canCreate}
            onClick={submit}
            style={{
              padding: '9px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: canCreate ? 'var(--primary)' : 'var(--muted)',
              color: canCreate ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              border: 'none', cursor: canCreate ? 'pointer' : 'not-allowed',
              marginTop: 4,
            }}
          >
            Create Portfolio
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Portfolio Selector Bar ───────────────────────────────────────────────────

const PortfolioSelectorBar: React.FC<{
  portfolios: Portfolio[];
  selected: Portfolio | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
}> = ({ portfolios, selected, onSelect, onCreateNew }) => {
  const [open, setOpen] = useState(false);
  const bm = BENCHMARK_REGISTRY.find(b => b.id === selected?.benchmarkId);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {/* Portfolio selector */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--card)',
            cursor: 'pointer', color: 'var(--foreground)',
          }}
        >
          <Briefcase size={13} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selected?.name ?? 'Select Portfolio'}</span>
          <ChevronDown size={11} style={{ color: 'var(--muted-foreground)' }} />
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4,
            background: 'var(--popover)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 6, zIndex: 50,
            minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
              Your Portfolios
            </p>
            {portfolios.map(p => (
              <button
                key={p.id}
                onClick={() => { onSelect(p.id); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '7px 8px', borderRadius: 5,
                  background: p.id === selected?.id ? 'var(--accent)' : 'transparent',
                  border: 'none', cursor: 'pointer', fontSize: 12,
                  color: 'var(--foreground)', textAlign: 'left',
                }}
              >
                <span style={{ fontWeight: p.id === selected?.id ? 600 : 400 }}>{p.name}</span>
                {p.id === selected?.id && <Check size={11} style={{ color: 'var(--primary)' }} />}
              </button>
            ))}
            <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
            <button
              onClick={() => { onCreateNew(); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', padding: '7px 8px', borderRadius: 5,
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--muted-foreground)',
              }}
            >
              <Plus size={11} /> New Portfolio
            </button>
          </div>
        )}
      </div>

      {selected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>vs</span>
          <div style={{
            padding: '4px 10px', borderRadius: 5,
            background: 'color-mix(in srgb, var(--chart-2) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--chart-2) 25%, transparent)',
            fontSize: 11, fontWeight: 600, color: 'var(--chart-2)',
          }}>
            {selected.benchmarkId ?? DEFAULT_BENCHMARK_ID} — {bm?.name ?? 'Benchmark'}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Allocation bar ───────────────────────────────────────────────────────────

const ALLOC_COLORS = [
  'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)',
  '#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#a4de6c', '#d0ed57',
];

// ─── Holdings multi-line chart ──────────────────────────────────────────────

type MultiPoint = Record<string, number> & { ts: number };

const HoldingsLineChart: React.FC<{
  performanceSeries: Array<{ ts: number; portfolio: number; benchmark: number }>;
  holdingCurves: Array<{ symbol: string; data: Array<{ ts: number; value: number }>; totalReturn: number }>;
  benchmarkId: string;
  portfolioName: string;
}> = ({ performanceSeries, holdingCurves, benchmarkId, portfolioName }) => {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);

  const merged = useMemo<MultiPoint[]>(() => {
    const map = new Map<number, MultiPoint>();
    for (const p of performanceSeries) {
      map.set(p.ts, { ts: p.ts, __portfolio: p.portfolio, __benchmark: p.benchmark });
    }
    for (const hc of holdingCurves) {
      for (const d of hc.data) {
        const row = map.get(d.ts);
        if (row) row[hc.symbol] = d.value;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
  }, [performanceSeries, holdingCurves]);

  const toggle = (sym: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      next.has(sym) ? next.delete(sym) : next.add(sym);
      return next;
    });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return (
      <div style={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', fontSize: 11, minWidth: 160 }}>
        <p style={{ margin: '0 0 6px', fontSize: 10, color: 'var(--muted-foreground)' }}>
          {new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
        </p>
        {sorted.map((entry: any) => (
          <div key={entry.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
            <span style={{ color: entry.color, fontWeight: 600 }}>{entry.name}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>{Number(entry.value).toFixed(1)}</span>
          </div>
        ))}
      </div>
    );
  };

  if (merged.length === 0) return null;

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={merged} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="ts" tickFormatter={(ts) => fmtDate(ts)} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(0)} domain={['auto', 'auto']} />
          <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="3 3" />
          <Tooltip content={<CustomTooltip />} />
          {/* Individual holdings */}
          {holdingCurves.map((hc, i) => (
            hidden.has(hc.symbol) ? null : (
              <Line
                key={hc.symbol}
                type="monotone"
                dataKey={hc.symbol}
                name={hc.symbol}
                stroke={ALLOC_COLORS[i % ALLOC_COLORS.length]}
                strokeWidth={hovered === hc.symbol ? 2.5 : hovered ? 0.5 : 1.5}
                dot={false}
                activeDot={{ r: 3 }}
                strokeOpacity={hovered && hovered !== hc.symbol ? 0.25 : 1}
              />
            )
          ))}
          {/* Portfolio aggregate */}
          <Line type="monotone" dataKey="__portfolio" name={portfolioName} stroke="var(--primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          {/* Benchmark */}
          <Line type="monotone" dataKey="__benchmark" name={benchmarkId} stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Interactive legend */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {/* Portfolio chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 5, background: 'color-mix(in srgb, var(--primary) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)' }}>
          <div style={{ width: 10, height: 2, background: 'var(--primary)', borderRadius: 1 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary)' }}>{portfolioName}</span>
        </div>
        {/* Benchmark chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 5, background: 'var(--muted)', border: '1px solid var(--border)' }}>
          <div style={{ width: 10, height: 1, background: 'var(--muted-foreground)', borderRadius: 1, borderTop: '1px dashed var(--muted-foreground)' }} />
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{benchmarkId}</span>
        </div>
        {/* Holding chips */}
        {holdingCurves.map((hc, i) => {
          const color = ALLOC_COLORS[i % ALLOC_COLORS.length];
          const isHidden = hidden.has(hc.symbol);
          const ret = hc.totalReturn;
          return (
            <button
              key={hc.symbol}
              onClick={() => toggle(hc.symbol)}
              onMouseEnter={() => setHovered(hc.symbol)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
                borderRadius: 5, cursor: 'pointer',
                background: isHidden ? 'transparent' : `color-mix(in srgb, ${color} 10%, transparent)`,
                border: `1px solid ${isHidden ? 'var(--border)' : `color-mix(in srgb, ${color} 30%, transparent)`}`,
                opacity: isHidden ? 0.4 : 1,
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--foreground)' }}>{hc.symbol}</span>
              <span style={{ fontSize: 10, color: ret >= 0 ? 'var(--chart-2)' : 'var(--destructive)', fontVariantNumeric: 'tabular-nums' }}>
                {ret >= 0 ? '+' : ''}{(ret * 100).toFixed(1)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const AllocationBar: React.FC<{ holdings: Holding[]; weights: Record<string, number> }> = ({ holdings, weights }) => {
  const sorted = [...holdings].sort((a, b) => (weights[b.symbol] ?? 0) - (weights[a.symbol] ?? 0));

  return (
    <div>
      {/* Visual stacked bar */}
      <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 12, gap: 1 }}>
        {sorted.map((h, i) => (
          <div
            key={h.symbol}
            title={`${h.symbol}: ${((weights[h.symbol] ?? 0) * 100).toFixed(1)}%`}
            style={{
              flex: (weights[h.symbol] ?? 0),
              background: ALLOC_COLORS[i % ALLOC_COLORS.length],
              minWidth: 2,
              transition: 'flex 300ms ease',
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
        {sorted.slice(0, 10).map((h, i) => (
          <div key={h.symbol} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: ALLOC_COLORS[i % ALLOC_COLORS.length], flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--foreground)', fontWeight: 600 }}>{h.symbol}</span>
            <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
              {((weights[h.symbol] ?? 0) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
        {sorted.length > 10 && (
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>+{sorted.length - 10} more</span>
        )}
      </div>
    </div>
  );
};

// ─── Holdings Snapshot ────────────────────────────────────────────────────────

const HoldingsSnapshot: React.FC<{
  holdings: Holding[];
  weights: Record<string, number>;
  totalValue?: number;
  holdingCurves?: Array<{ symbol: string; totalReturn: number }>;
}> = ({ holdings, weights, totalValue, holdingCurves }) => {
  const sorted = [...holdings].sort((a, b) => (weights[b.symbol] ?? 0) - (weights[a.symbol] ?? 0));
  const returnMap = Object.fromEntries((holdingCurves ?? []).map(h => [h.symbol, h.totalReturn]));
  const hasValue = totalValue != null;
  const hasCurves = (holdingCurves?.length ?? 0) > 0;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Symbol', 'Name', 'Asset Class', 'Sector', 'Weight',
              ...(hasValue ? ['Exposure'] : []),
              ...(hasCurves ? ['Period Return'] : []),
              ...(hasValue && hasCurves ? ['Est. P&L'] : []),
              'Conviction',
            ].map(h => (
              <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((h, i) => {
            const w = weights[h.symbol] ?? 0;
            const ret = returnMap[h.symbol];
            const exposure = hasValue ? (totalValue! * w) : null;
            const pnl = exposure != null && ret != null ? exposure * ret : null;
            const conviction = h.conviction ?? 'medium';
            const convictionColor = conviction === 'highest' ? 'var(--primary)' : conviction === 'high' ? 'var(--chart-2)' : conviction === 'medium' ? 'var(--foreground)' : 'var(--muted-foreground)';
            return (
              <tr
                key={h.id}
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--muted) 30%, transparent)',
                }}
              >
                <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                  {h.symbol}
                </td>
                <td style={{ padding: '8px 10px', color: 'var(--foreground)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {h.name}
                </td>
                <td style={{ padding: '8px 10px', color: 'var(--muted-foreground)' }}>
                  <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: 'var(--muted)', border: '1px solid var(--border)' }}>
                    {h.assetClass}
                  </span>
                </td>
                <td style={{ padding: '8px 10px', color: 'var(--muted-foreground)', fontSize: 11 }}>
                  {h.sector ?? '—'}
                </td>
                <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--foreground)' }}>
                  {(w * 100).toFixed(1)}%
                </td>
                {hasValue && (
                  <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', fontWeight: 600 }}>
                    {exposure != null ? fmtValue(exposure) : '—'}
                  </td>
                )}
                {hasCurves && (
                  <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: ret == null ? 'var(--muted-foreground)' : ret >= 0 ? 'var(--chart-2)' : 'var(--destructive)' }}>
                    {ret != null ? fmtPct(ret) : '—'}
                  </td>
                )}
                {hasValue && hasCurves && (
                  <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: pnl == null ? 'var(--muted-foreground)' : pnl >= 0 ? 'var(--chart-2)' : 'var(--destructive)' }}>
                    {pnl != null ? fmtUSD(pnl) : '—'}
                  </td>
                )}
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: convictionColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {conviction}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ─── Intelligence Feed ────────────────────────────────────────────────────────

const IntelligenceFeed: React.FC<{
  observations: import('../../lib/portfolio/schemas').PortfolioIntelligenceObservation[];
  portfolioName: string;
}> = ({ observations, portfolioName }) => {
  const SEVERITY_COLOR: Record<string, string> = {
    high: 'var(--destructive)', medium: 'var(--chart-4)', low: 'var(--chart-2)', info: 'var(--muted-foreground)',
  };

  if (observations.length === 0) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center' }}>
        <Activity size={20} style={{ color: 'var(--muted-foreground)', margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-foreground)' }}>
          No active intelligence observations for {portfolioName}.
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted-foreground)', opacity: 0.7 }}>
          Observations surface automatically as portfolio conditions evolve.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {observations.map(obs => (
        <div
          key={obs.id}
          style={{
            padding: '10px 14px',
            background: 'var(--muted)',
            border: `1px solid var(--border)`,
            borderLeft: `3px solid ${SEVERITY_COLOR[obs.severity] ?? 'var(--border)'}`,
            borderRadius: '0 8px 8px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <AlertCircle size={12} style={{ color: SEVERITY_COLOR[obs.severity], flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.3 }}>{obs.title}</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>{obs.narrative}</p>
              {obs.symbols && obs.symbols.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {obs.symbols.map(s => (
                    <span key={s} style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Section Card ─────────────────────────────────────────────────────────────

const SectionCard: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ title, subtitle, icon, actions, children, style }) => (
  <div style={{
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
    overflow: 'hidden', ...style,
  }}>
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      padding: '12px 16px 10px', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {icon && <div style={{ flexShrink: 0, color: 'var(--primary)' }}>{icon}</div>}
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>{title}</p>
          {subtitle && <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>{subtitle}</p>}
        </div>
      </div>
      {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
    </div>
    <div style={{ padding: '14px 16px' }}>{children}</div>
  </div>
);

// ─── Empty portfolio state ────────────────────────────────────────────────────

const EmptyPortfolioState: React.FC<{ portfolioName: string }> = ({ portfolioName }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center' }}>
    <div style={{
      width: 48, height: 48, borderRadius: 12,
      background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
      border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    }}>
      <Briefcase size={20} style={{ color: 'var(--primary)' }} />
    </div>
    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.02em' }}>
      {portfolioName} is empty
    </p>
    <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted-foreground)', maxWidth: 360, lineHeight: 1.6 }}>
      Navigate to <strong>Holdings & Watchlist</strong> to add positions. Once holdings are added, performance curves, exposure analysis, and intelligence overlays will populate automatically.
    </p>
  </div>
);

// ─── No portfolio state ───────────────────────────────────────────────────────

const NoPortfolioState: React.FC<{ onCreateNew: () => void }> = ({ onCreateNew }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: 24, textAlign: 'center' }}>
    <div style={{
      width: 56, height: 56, borderRadius: 14,
      background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
      border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    }}>
      <LayoutDashboard size={24} style={{ color: 'var(--primary)' }} />
    </div>
    <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.02em' }}>
      Portfolio Intelligence Workspace
    </p>
    <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--muted-foreground)', maxWidth: 440, lineHeight: 1.7 }}>
      Build and monitor institutional portfolios with continuous intelligence overlays, benchmark comparison, exposure analysis, and risk surveillance. Create your first portfolio to begin.
    </p>
    <button
      onClick={onCreateNew}
      style={{
        marginTop: 24, display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 20px', borderRadius: 8,
        background: 'var(--primary)', color: 'var(--primary-foreground)',
        border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
      }}
    >
      <Plus size={14} /> Create First Portfolio
    </button>
  </div>
);

// ─── Intelligence filter tabs ─────────────────────────────────────────────────

const INTEL_FILTERS: Array<{ id: AgentIntelligenceFilter | 'signals'; label: string; icon: React.ReactNode }> = [
  { id: 'all',     label: 'All Intelligence',   icon: <Brain size={11} /> },
  { id: 'risk',    label: 'Risk Environment',   icon: <ShieldAlert size={11} /> },
  { id: 'regime',  label: 'Regime Intelligence', icon: <Activity size={11} /> },
  { id: 'macro',   label: 'Macro Intelligence',  icon: <BarChart3 size={11} /> },
  { id: 'signals', label: 'Portfolio Signals',   icon: <AlertCircle size={11} /> },
];

const IntelligenceModal: React.FC<{
  portfolioId: string | null | undefined;
  observations: import('../../hooks/usePortfolioIntelligence').CombinedObservation[];
  onAcknowledge: (id: string) => void;
  onClose: () => void;
}> = ({ portfolioId, observations, onAcknowledge, onClose }) => {
  const [activeFilter, setActiveFilter] = useState<AgentIntelligenceFilter | 'signals'>('all');

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 480, height: '100%',
          background: 'var(--card)', borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain size={14} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>
              Portfolio Intelligence
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex', padding: 4 }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Filter tabs */}
        <div style={{
          display: 'flex', gap: 4, padding: '10px 12px',
          borderBottom: '1px solid var(--border)', flexWrap: 'wrap', flexShrink: 0,
        }}>
          {INTEL_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                border: `1px solid ${activeFilter === f.id ? 'var(--primary)' : 'var(--border)'}`,
                background: activeFilter === f.id ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                color: activeFilter === f.id ? 'var(--primary)' : 'var(--muted-foreground)',
                cursor: 'pointer',
              }}
            >
              {f.icon}
              {f.label}
              {f.id === 'signals' && observations.length > 0 && (
                <span style={{
                  padding: '0 5px', borderRadius: 10, fontSize: 9, fontWeight: 800,
                  background: 'var(--destructive)', color: 'white', marginLeft: 2,
                }}>
                  {observations.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
          {activeFilter === 'signals' ? (
            <PortfolioIntelligencePanel
              observations={observations}
              onAcknowledge={onAcknowledge}
            />
          ) : (
            <AgentPortfolioInsights
              portfolioId={portfolioId}
              filter={activeFilter}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export const PortfolioOverview: React.FC = () => {
  const {
    portfolios, selectedPortfolio, holdings,
    loading, holdingsLoading,
    selectPortfolio, createNew, updateSelected,
    effectiveWeights,
  } = usePortfolioWorkspace();

  const [showCreate, setShowCreate] = useState(false);
  const [period, setPeriod] = useState<PeriodLabel>('1Y');
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const navigate = useNavigate();
  const awarenessEnabled = isAwarenessWorkspaceEnabled();

  const symbols = useMemo(() => holdings.map(h => h.symbol), [holdings]);
  const benchmarkId = selectedPortfolio?.benchmarkId ?? DEFAULT_BENCHMARK_ID;
  const periodDays = PERIODS.find(p => p.label === period)?.days ?? 252;

  const {
    performanceSeries,
    volSeries,
    drawdownSeries,
    holdingCurves,
    maxDrawdown: mdd,
    annReturn,
    annVol,
    totalReturn,
    sharpe,
    benchmarkTotalReturn,
    loading: perfLoading,
    error: perfError,
    retry: perfRetry,
  } = usePortfolioPerformance(symbols, effectiveWeights, benchmarkId, periodDays);

  const handleCreate = useCallback(async (params: CreatePortfolioParams) => {
    setShowCreate(false);
    await createNew({
      name: params.name,
      benchmarkId: params.benchmarkId,
      type: 'long-only',
      currency: params.currency,
      startingCapital: params.startingCapital,
      cashBalance: params.cashBalance,
      riskProfile: params.riskProfile,
    });
  }, [createNew]);

  const handleSetValue = useCallback((v: number | undefined) => {
    updateSelected({ totalValue: v });
  }, [updateSelected]);

  // Excess return
  const excessReturn = totalReturn - benchmarkTotalReturn;

  // Dollar P&L — only available when totalValue is set
  const portfolioTotalValue = selectedPortfolio?.totalValue;
  const dollarPnL = portfolioTotalValue != null ? portfolioTotalValue * totalReturn : null;
  const dollarExcess = portfolioTotalValue != null ? portfolioTotalValue * excessReturn : null;

  // Intelligence overlay
  const hhi = useMemo(
    () => Object.values(effectiveWeights).reduce((s, w) => s + w * w, 0),
    [effectiveWeights],
  );
  const top3Weight = useMemo(() => {
    const sorted = Object.values(effectiveWeights).sort((a, b) => b - a);
    return sorted.slice(0, 3).reduce((s, w) => s + w, 0);
  }, [effectiveWeights]);

  const { observations, acknowledge } = usePortfolioIntelligence(
    selectedPortfolio?.id,
    holdings.length > 0
      ? { holdings, effectiveWeights, annVol, maxDrawdownPct: mdd, hhi, top3Weight }
      : null,
  );

  // Performance tick formatter
  const xTickFmt = useCallback((ts: number) => fmtDate(ts), []);
  const xTickFmtShort = useCallback((ts: number) => fmtDateShort(ts), []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Loader2 size={20} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (portfolios.length === 0) {
    return (
      <>
        <NoPortfolioState onCreateNew={() => setShowCreate(true)} />
        {showCreate && (
          <CreatePortfolioModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
        )}
      </>
    );
  }

  const hasHoldings = holdings.length > 0;
  const hasPerfData = performanceSeries.length > 20;

  return (
    <div style={{ padding: '0 0 32px' }}>
      {/* Page header */}
      <div style={{
        padding: '16px 24px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--foreground)' }}>
            Portfolio Overview
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
            Intelligence command center — performance, exposure & risk surveillance
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <PortfolioValueInput
            currentValue={selectedPortfolio?.totalValue}
            onSave={handleSetValue}
          />
          <PortfolioSelectorBar
            portfolios={portfolios}
            selected={selectedPortfolio}
            onSelect={selectPortfolio}
            onCreateNew={() => setShowCreate(true)}
          />
          {/* Portfolio Awareness — subtle, gated entry to the dedicated cognition workspace. */}
          {awarenessEnabled && selectedPortfolio && (
            <button
              onClick={() => {
                logOpen({
                  category: 'portfolio',
                  placement: 'portfolio_overview_awareness_entry',
                  entity_id: selectedPortfolio.id,
                });
                navigate(`/portfolio/${selectedPortfolio.id}/awareness`);
              }}
              title="Open the awareness workspace — synthesized context, drivers, risks, and what to monitor."
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 11px', borderRadius: 7,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--muted-foreground)',
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.01em',
              }}
            >
              <Sparkles size={12} style={{ color: 'var(--primary)', opacity: 0.85 }} />
              Portfolio Awareness
              <span style={{ opacity: 0.5, fontWeight: 500 }}>→</span>
            </button>
          )}
          {/* Intelligence button */}
          <button
            onClick={() => setIntelligenceOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 11px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: observations.length > 0 ? 'var(--foreground)' : 'var(--muted-foreground)',
              cursor: 'pointer', fontSize: 11, fontWeight: 600, position: 'relative',
            }}
            title="View portfolio intelligence"
          >
            <Brain size={12} style={{ color: 'var(--primary)' }} />
            Intelligence
            {observations.length > 0 && (
              <span style={{
                padding: '1px 5px', borderRadius: 8, fontSize: 9, fontWeight: 800,
                background: 'var(--destructive)', color: 'white',
              }}>
                {observations.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 7,
              background: 'var(--primary)', color: 'var(--primary-foreground)',
              border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            <Plus size={12} /> New
          </button>
        </div>
      </div>

      {!hasHoldings ? (
        <EmptyPortfolioState portfolioName={selectedPortfolio?.name ?? 'Portfolio'} />
      ) : (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Metric strip ─────────────────────────────────────────────── */}
          {hasPerfData && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <MetricPill label="Total Return" value={fmtPct(totalReturn)} color={totalReturn >= 0 ? 'var(--chart-2)' : 'var(--destructive)'} accent />
              {dollarPnL != null && (
                <MetricPill
                  label="Est. P&L"
                  value={fmtUSD(dollarPnL)}
                  color={dollarPnL >= 0 ? 'var(--chart-2)' : 'var(--destructive)'}
                  accent
                />
              )}
              <MetricPill label="vs Benchmark" value={fmtPct(excessReturn)} color={excessReturn >= 0 ? 'var(--chart-2)' : 'var(--destructive)'} />
              {dollarExcess != null && (
                <MetricPill
                  label="vs Bmk ($)"
                  value={fmtUSD(dollarExcess)}
                  color={dollarExcess >= 0 ? 'var(--chart-2)' : 'var(--destructive)'}
                />
              )}
              <MetricPill label="Ann. Return" value={fmtPct(annReturn)} color={annReturn >= 0 ? 'var(--chart-2)' : 'var(--destructive)'} />
              <MetricPill label="Ann. Volatility" value={fmtPct(annVol, false)} color="var(--chart-4)" />
              <MetricPill label="Sharpe Ratio" value={isFinite(sharpe) ? sharpe.toFixed(2) : '—'} color={sharpe >= 1 ? 'var(--chart-2)' : sharpe >= 0.5 ? 'var(--foreground)' : 'var(--destructive)'} />
              <MetricPill label="Max Drawdown" value={fmtPct(mdd)} color="var(--destructive)" />
              <MetricPill label="Holdings" value={String(holdings.length)} />
            </div>
          )}

          {/* Loading state — only while computing, not once errored */}
          {(perfLoading || holdingsLoading) && !hasPerfData && !perfError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'var(--muted)', borderRadius: 8, fontSize: 12, color: 'var(--muted-foreground)' }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
              Computing portfolio performance from historical price data…
            </div>
          )}

          {/* ── Period selector ───────────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <PeriodSelector active={period} onChange={setPeriod} />
          </div>

          {/* ── Row 1: Performance + Allocation ──────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>

            {/* Performance curve */}
            <SectionCard
              title="Portfolio vs Benchmark"
              subtitle={`${selectedPortfolio?.name} · ${benchmarkId} · Rebased to 100`}
              icon={<TrendingUp size={13} />}
            >
              {hasPerfData ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={performanceSeries} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke={PALETTE.grid} strokeOpacity={0.5} vertical={false} />
                    <XAxis dataKey="ts" tickFormatter={xTickFmt} tick={{ fontSize: 10, fill: PALETTE.text }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: PALETTE.text }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(0)} />
                    <Tooltip content={<PerfTooltip benchmarkId={benchmarkId} />} />
                    <Line type="monotone" dataKey="portfolio" stroke={PALETTE.portfolio} strokeWidth={2} dot={false} activeDot={{ r: 3 }} name="Portfolio" />
                    <Line type="monotone" dataKey="benchmark" stroke={PALETTE.benchmark} strokeWidth={1.5} dot={false} strokeDasharray="4 3" activeDot={{ r: 3 }} name={benchmarkId} />
                    <Legend
                      wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                      formatter={(value) => value === 'portfolio' ? selectedPortfolio?.name : benchmarkId}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : perfError ? (
                <div style={{ height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <AlertCircle size={18} style={{ color: 'var(--destructive)', opacity: 0.7 }} />
                  <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>
                    {perfError}
                  </p>
                  <button
                    onClick={perfRetry}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      border: '1px solid var(--border)', background: 'var(--muted)',
                      color: 'var(--foreground)', cursor: 'pointer',
                    }}
                  >
                    <RefreshCw size={11} /> Retry
                  </button>
                </div>
              ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Loader2 size={14} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
                  <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>Loading performance data…</p>
                </div>
              )}
            </SectionCard>

            {/* Allocation */}
            <SectionCard
              title="Allocation"
              subtitle={`${holdings.length} holdings · By weight`}
              icon={<PieChart size={13} />}
            >
              <AllocationBar holdings={holdings} weights={effectiveWeights} />
            </SectionCard>
          </div>

          {/* ── Holdings equity curves (multi-line interactive) ───────────── */}
          {hasPerfData && holdingCurves.length > 0 && (
            <SectionCard
              title="Holdings Performance Breakdown"
              subtitle={`Individual equity curves · Click legend to toggle · ${period} window · Rebased to 100`}
              icon={<LayoutDashboard size={13} />}
            >
              <HoldingsLineChart
                performanceSeries={performanceSeries}
                holdingCurves={holdingCurves}
                benchmarkId={benchmarkId}
                portfolioName={selectedPortfolio?.name ?? 'Portfolio'}
              />
            </SectionCard>
          )}

          {/* ── Row 2: Rolling Volatility + Drawdown ─────────────────────── */}
          {hasPerfData && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* Rolling Volatility */}
              <SectionCard
                title="Rolling Volatility"
                subtitle="21-day window · Annualised %"
                icon={<Activity size={13} />}
              >
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={volSeries} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <defs>
                      <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke={PALETTE.grid} strokeOpacity={0.5} vertical={false} />
                    <XAxis dataKey="ts" tickFormatter={xTickFmt} tick={{ fontSize: 10, fill: PALETTE.text }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: PALETTE.text }} tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
                    <Tooltip content={<VolTooltip />} />
                    <Area type="monotone" dataKey="vol" stroke={PALETTE.vol} strokeWidth={1.5} fill="url(#volGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </SectionCard>

              {/* Drawdown */}
              <SectionCard
                title="Drawdown"
                subtitle={`Maximum: ${fmtPct(mdd)} · From recent peak`}
                icon={<ShieldAlert size={13} />}
              >
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={drawdownSeries} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <defs>
                      <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.02} />
                        <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke={PALETTE.grid} strokeOpacity={0.5} vertical={false} />
                    <XAxis dataKey="ts" tickFormatter={xTickFmt} tick={{ fontSize: 10, fill: PALETTE.text }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: PALETTE.text }} tickLine={false} axisLine={false} tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
                    <Tooltip content={<DdTooltip />} />
                    <ReferenceLine y={0} stroke={PALETTE.grid} strokeDasharray="2 2" />
                    <Area type="monotone" dataKey="drawdown" stroke={PALETTE.drawdown} strokeWidth={1.5} fill="url(#ddGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </SectionCard>
            </div>
          )}

          {/* ── Row 3: Holdings Snapshot ──────────────────────────────────── */}
          <SectionCard
            title="Holdings Snapshot"
            subtitle={`${holdings.length} position${holdings.length !== 1 ? 's' : ''} · Sorted by weight`}
            icon={<BarChart3 size={13} />}
          >
            <HoldingsSnapshot
              holdings={holdings}
              weights={effectiveWeights}
              totalValue={portfolioTotalValue}
              holdingCurves={holdingCurves}
            />
          </SectionCard>

        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreatePortfolioModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}

      {/* Intelligence panel */}
      {intelligenceOpen && (
        <IntelligenceModal
          portfolioId={selectedPortfolio?.id}
          observations={observations}
          onAcknowledge={acknowledge}
          onClose={() => setIntelligenceOpen(false)}
        />
      )}
    </div>
  );
};
