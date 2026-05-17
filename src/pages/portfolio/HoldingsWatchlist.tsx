import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Plus, X, Search, Briefcase, ListTree, Loader2, Trash2, ChevronDown,
  ChevronRight, TrendingUp, TrendingDown, Activity, AlertCircle,
  BarChart2, Globe, Zap, Star,
} from 'lucide-react';
import { usePortfolioWorkspace } from '../../hooks/usePortfolioWorkspace';
import { DEFAULT_BENCHMARK_ID, BENCHMARK_REGISTRY } from '../../lib/portfolio/benchmarks';
import type { Holding } from '../../lib/portfolio/schemas';
import { fetchOHLCV, symbolSearch } from '../../services/marketService';
import type { OHLCVBar } from '../../types';
import {
  logReturns, cumulativeLogReturns, rebase100,
} from '../../lib/quant/returns';
import { rollingAnnualisedVol } from '../../lib/quant/volatility';
import { maxDrawdown as computeMaxDrawdown } from '../../lib/quant/risk';
import { trendLabel } from '../../lib/quant/momentum';
import type { AssetClass } from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtPct(v: number, sign = true): string {
  if (!isFinite(v)) return '—';
  const s = (v * 100).toFixed(2);
  return sign && v >= 0 ? `+${s}%` : `${s}%`;
}
function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CONVICTION_COLORS: Record<string, string> = {
  highest: 'var(--primary)', high: 'var(--chart-2)',
  medium: 'var(--foreground)', low: 'var(--muted-foreground)',
};

const ASSET_CLASSES = ['equity', 'fx', 'commodity', 'index', 'bond', 'crypto', 'macro'] as const;

// ─── Mini sparkline ───────────────────────────────────────────────────────────

const MiniSparkline: React.FC<{ bars: OHLCVBar[]; color?: string }> = ({ bars, color = 'var(--primary)' }) => {
  const data = bars.slice(-30).map((b, i) => ({ i, c: b.close }));
  return (
    <ResponsiveContainer width={80} height={28}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="c" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};

// ─── Add Holding Modal ────────────────────────────────────────────────────────

interface AddHoldingModalProps {
  onClose: () => void;
  onAdd: (params: {
    symbol: string; name: string; assetClass: AssetClass;
    conviction?: Holding['conviction']; notes?: string;
  }) => Promise<void>;
}

const AddHoldingModal: React.FC<AddHoldingModalProps> = ({ onClose, onAdd }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ symbol: string; name: string; type: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<{ symbol: string; name: string } | null>(null);
  const [conviction, setConviction] = useState<Holding['conviction']>('medium');
  const [assetClass, setAssetClass] = useState<Holding['assetClass']>('equity');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults([]); return; }
    const tid = setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await symbolSearch(query);
        setResults(hits.slice(0, 8).map(h => ({ symbol: h.symbol, name: h.name ?? h.symbol, type: h.type ?? 'equity' })));
      } catch { setResults([]); }
      setSearching(false);
    }, 350);
    return () => clearTimeout(tid);
  }, [query]);

  const handleAdd = async () => {
    if (!selected) return;
    setAdding(true);
    try {
      await onAdd({ symbol: selected.symbol, name: selected.name, assetClass, conviction, notes: notes.trim() });
      onClose();
    } catch { setAdding(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 420, maxWidth: '92vw', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>Add Holding</p>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex' }}><X size={16} /></button>
        </div>

        {/* Symbol search */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Symbol or Name</label>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
            <input
              autoFocus
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null); }}
              placeholder="Search AAPL, MSFT, BTC..."
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px 8px 30px', borderRadius: 6, fontSize: 13, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', outline: 'none' }}
            />
            {searching && <Loader2 size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />}
          </div>

          {results.length > 0 && !selected && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginTop: 4, overflow: 'hidden', background: 'var(--popover)' }}>
              {results.map(r => (
                <button
                  key={r.symbol}
                  onClick={() => { setSelected({ symbol: r.symbol, name: r.name }); setQuery(`${r.symbol} — ${r.name}`); setResults([]); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--foreground)', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontWeight: 600 }}>{r.symbol}</span>
                  <span style={{ color: 'var(--muted-foreground)', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div style={{ marginTop: 6, padding: '6px 10px', background: 'color-mix(in srgb, var(--primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)', borderRadius: 5, fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>
              ✓ {selected.symbol} — {selected.name}
            </div>
          )}
        </div>

        {/* Asset class + conviction */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Asset Class</label>
            <select value={assetClass} onChange={e => setAssetClass(e.target.value as Holding['assetClass'])} style={{ width: '100%', padding: '7px 8px', borderRadius: 5, fontSize: 12, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}>
              {ASSET_CLASSES.map(ac => <option key={ac} value={ac}>{ac}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conviction</label>
            <select value={conviction} onChange={e => setConviction(e.target.value as Holding['conviction'])} style={{ width: '100%', padding: '7px 8px', borderRadius: 5, fontSize: 12, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}>
              <option value="highest">Highest</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Thesis, context, narrative exposure..." style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 5, fontSize: 12, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', resize: 'none', outline: 'none' }} />
        </div>

        <button
          disabled={!selected || adding}
          onClick={handleAdd}
          style={{ width: '100%', padding: '10px', borderRadius: 7, fontSize: 13, fontWeight: 600, background: selected ? 'var(--primary)' : 'var(--muted)', color: selected ? 'var(--primary-foreground)' : 'var(--muted-foreground)', border: 'none', cursor: selected ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          {adding ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Adding…</> : <><Plus size={13} /> Add to Portfolio</>}
        </button>
      </div>
    </div>
  );
};

// ─── Holding Intelligence Drawer ──────────────────────────────────────────────

interface HoldingDrawerProps {
  holding: Holding;
  benchmarkId: string;
  onClose: () => void;
  onRemove: () => void;
}

const HoldingDrawer: React.FC<HoldingDrawerProps> = ({ holding, benchmarkId, onClose, onRemove }) => {
  const [bars, setBars] = useState<OHLCVBar[]>([]);
  const [benchBars, setBenchBars] = useState<OHLCVBar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      fetchOHLCV(holding.symbol, '1day', 120),
      fetchOHLCV(benchmarkId, '1day', 120),
    ]).then(([r1, r2]) => {
      if (r1.status === 'fulfilled') setBars(r1.value.bars);
      if (r2.status === 'fulfilled') setBenchBars(r2.value.bars);
      setLoading(false);
    });
  }, [holding.symbol, benchmarkId]);

  const { curve, bmCurve, volPct, mdd, trend } = useMemo(() => {
    if (bars.length < 10) return { curve: [], bmCurve: [], volPct: 0, mdd: 0, trend: 'neutral' };
    const closes = bars.map(b => b.close);
    const lr = logReturns(closes);
    const curve = rebase100(cumulativeLogReturns(lr)).map((v, i) => ({ ts: bars[i + 1]?.ts ?? 0, v }));
    const bmCloses = benchBars.map(b => b.close);
    const bmLr = logReturns(bmCloses);
    const bmCurve = rebase100(cumulativeLogReturns(bmLr)).map((v, i) => ({ ts: benchBars[i + 1]?.ts ?? 0, v }));
    const volArr = rollingAnnualisedVol(lr, 21);
    const volPct = volArr[volArr.length - 1] ?? 0;
    const { mdd } = computeMaxDrawdown(lr);
    const tl = trendLabel(closes);
    return { curve, bmCurve, volPct, mdd, trend: tl.label };
  }, [bars, benchBars]);

  // Align curves for comparison chart
  const comparisonData = useMemo(() => {
    const len = Math.min(curve.length, bmCurve.length);
    return curve.slice(-len).map((p, i) => ({
      ts: p.ts,
      symbol: p.v,
      benchmark: bmCurve[bmCurve.length - len + i]?.v ?? 100,
    }));
  }, [curve, bmCurve]);

  const totalReturn = curve.length > 1 ? (curve[curve.length - 1].v / 100 - 1) : 0;
  const bmReturn = bmCurve.length > 1 ? (bmCurve[bmCurve.length - 1].v / 100 - 1) : 0;

  const TREND_COLOR: Record<string, string> = { bull: 'var(--chart-2)', bear: 'var(--destructive)', neutral: 'var(--muted-foreground)' };
  const trendKey = (trend === 'strong-up' || trend === 'up') ? 'bull' : (trend === 'down' || trend === 'strong-down') ? 'bear' : 'neutral';

  return (
    <div
      style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 100,
        width: 400, background: 'var(--card)', borderLeft: '1px solid var(--border)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--foreground)' }}>{holding.symbol}</p>
            <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>{holding.assetClass}</span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-foreground)' }}>{holding.name}</p>
        </div>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex', padding: 4 }}><X size={16} /></button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
        </div>
      ) : (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Intelligence badges */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: `color-mix(in srgb, ${TREND_COLOR[trendKey]} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${TREND_COLOR[trendKey]} 25%, transparent)`, color: TREND_COLOR[trendKey], textTransform: 'uppercase' }}>
              {String(trend).replace('-', ' ')}
            </span>
            <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: 'color-mix(in srgb, var(--chart-4) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--chart-4) 25%, transparent)', color: 'var(--chart-4)', textTransform: 'uppercase' }}>
              Vol {volPct.toFixed(1)}%
            </span>
            {holding.conviction && (
              <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: `color-mix(in srgb, ${CONVICTION_COLORS[holding.conviction]} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${CONVICTION_COLORS[holding.conviction]} 20%, transparent)`, color: CONVICTION_COLORS[holding.conviction], textTransform: 'uppercase' }}>
                {holding.conviction} conviction
              </span>
            )}
          </div>

          {/* Quick metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: '120D Return', value: fmtPct(totalReturn), color: totalReturn >= 0 ? 'var(--chart-2)' : 'var(--destructive)' },
              { label: 'vs Benchmark', value: fmtPct(totalReturn - bmReturn), color: (totalReturn - bmReturn) >= 0 ? 'var(--chart-2)' : 'var(--destructive)' },
              { label: 'Max Drawdown', value: fmtPct(mdd), color: 'var(--destructive)' },
            ].map(m => (
              <div key={m.label} style={{ padding: '8px 10px', background: 'var(--muted)', borderRadius: 7, border: '1px solid var(--border)' }}>
                <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</p>
                <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 700, color: m.color, fontVariantNumeric: 'tabular-nums' }}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Benchmark comparison chart */}
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              120D Performance vs {benchmarkId}
            </p>
            {comparisonData.length > 5 ? (
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={comparisonData} margin={{ top: 2, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="ts" tickFormatter={fmtDate} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(0)} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const sym = payload.find(p => p.dataKey === 'symbol');
                      const bm = payload.find(p => p.dataKey === 'benchmark');
                      return (
                        <div style={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 10 }}>
                          {sym && <p style={{ margin: 0, color: 'var(--primary)', fontWeight: 700 }}>{holding.symbol}: {(sym.value as number).toFixed(1)}</p>}
                          {bm && <p style={{ margin: '2px 0 0', color: 'var(--chart-2)', fontWeight: 600 }}>{benchmarkId}: {(bm.value as number).toFixed(1)}</p>}
                        </div>
                      );
                    }}
                  />
                  <Line type="monotone" dataKey="symbol" stroke="var(--primary)" strokeWidth={2} dot={false} name={holding.symbol} />
                  <Line type="monotone" dataKey="benchmark" stroke="var(--chart-2)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name={benchmarkId} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0 }}>Insufficient data for chart.</p>
            )}
          </div>

          {/* Holding metadata */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {holding.sector && (
              <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--muted-foreground)', minWidth: 70 }}>Sector</span>
                <span style={{ fontWeight: 500 }}>{holding.sector}</span>
              </div>
            )}
            {holding.region && (
              <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--muted-foreground)', minWidth: 70 }}>Region</span>
                <span style={{ fontWeight: 500 }}>{holding.region}</span>
              </div>
            )}
            {holding.notes && (
              <div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--muted)', borderRadius: 6, fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                {holding.notes}
              </div>
            )}
          </div>

          {/* Remove */}
          <button
            onClick={onRemove}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--destructive) 35%, transparent)', background: 'color-mix(in srgb, var(--destructive) 8%, transparent)', color: 'var(--destructive)', cursor: 'pointer', fontSize: 12, fontWeight: 600, marginTop: 4 }}
          >
            <Trash2 size={12} /> Remove from Portfolio
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Holdings row ─────────────────────────────────────────────────────────────

const HoldingRow: React.FC<{
  holding: Holding;
  weight: number;
  index: number;
  onOpen: () => void;
}> = ({ holding, weight, index, onOpen }) => {
  const [bars, setBars] = useState<OHLCVBar[]>([]);

  useEffect(() => {
    fetchOHLCV(holding.symbol, '1day', 30).then(r => setBars(r.bars)).catch(() => {});
  }, [holding.symbol]);

  const { totalReturn, trendKey } = useMemo(() => {
    if (bars.length < 5) return { totalReturn: 0, trendKey: 'neutral' };
    const closes = bars.map(b => b.close);
    const lr = logReturns(closes);
    const totalReturn = Math.exp(lr.reduce((a, b) => a + b, 0)) - 1;
    const { label } = trendLabel(closes);
    const trendKey = (label === 'strong-up' || label === 'up') ? 'bull' : (label === 'down' || label === 'strong-down') ? 'bear' : 'neutral';
    return { totalReturn, trendKey };
  }, [bars]);

  const TREND_DOT: Record<string, string> = { bull: 'var(--chart-2)', bear: 'var(--destructive)', neutral: 'var(--muted-foreground)' };

  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: index % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--muted) 25%, transparent)',
        transition: 'background 120ms',
      }}
      onClick={onOpen}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
      onMouseLeave={e => (e.currentTarget.style.background = index % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--muted) 25%, transparent)')}
    >
      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--foreground)', fontSize: 13, letterSpacing: '-0.01em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: TREND_DOT[trendKey], flexShrink: 0 }} />
          {holding.symbol}
        </div>
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted-foreground)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{holding.name}</td>
      <td style={{ padding: '10px 12px', fontSize: 11 }}>
        <span style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)', fontWeight: 600 }}>
          {holding.assetClass}
        </span>
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted-foreground)' }}>{holding.sector ?? '—'}</td>
      <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{(weight * 100).toFixed(1)}%</td>
      <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 12, color: totalReturn >= 0 ? 'var(--chart-2)' : 'var(--destructive)', fontVariantNumeric: 'tabular-nums' }}>
        {bars.length > 3 ? fmtPct(totalReturn) : '—'}
      </td>
      <td style={{ padding: '10px 12px' }}>
        {bars.length > 5 ? <MiniSparkline bars={bars} color={totalReturn >= 0 ? 'var(--chart-2)' : 'var(--destructive)'} /> : <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>—</span>}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: CONVICTION_COLORS[holding.conviction ?? 'medium'] ?? 'var(--foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {holding.conviction ?? 'medium'}
        </span>
      </td>
      <td style={{ padding: '10px 12px' }}>
        <ChevronRight size={12} style={{ color: 'var(--muted-foreground)' }} />
      </td>
    </tr>
  );
};

// ─── Empty state ──────────────────────────────────────────────────────────────

const EmptyHoldings: React.FC<{ onAdd: () => void; portfolioName: string }> = ({ onAdd, portfolioName }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 24px', textAlign: 'center' }}>
    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'color-mix(in srgb, var(--chart-2) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--chart-2) 20%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
      <ListTree size={20} style={{ color: 'var(--chart-2)' }} />
    </div>
    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>{portfolioName} has no holdings</p>
    <p style={{ margin: '8px 0 20px', fontSize: 12, color: 'var(--muted-foreground)', maxWidth: 340, lineHeight: 1.6 }}>
      Add equities, ETFs, FX pairs, commodities, or any tradeable instrument. Intelligence overlays, volatility state, regime fit, and benchmark-relative analysis populate automatically.
    </p>
    <button onClick={onAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7, background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
      <Plus size={14} /> Add First Holding
    </button>
  </div>
);

// ─── Main page ────────────────────────────────────────────────────────────────

export const HoldingsWatchlist: React.FC = () => {
  const {
    portfolios, selectedPortfolio, holdings, loading, holdingsLoading,
    selectPortfolio, createNew,
    addNewHolding, removeExistingHolding,
    effectiveWeights,
  } = usePortfolioWorkspace();

  const [showAdd, setShowAdd] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [drawerHolding, setDrawerHolding] = useState<Holding | null>(null);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() =>
    holdings.filter(h =>
      !filter || h.symbol.toUpperCase().includes(filter.toUpperCase()) || h.name.toLowerCase().includes(filter.toLowerCase())
    ), [holdings, filter]);

  const benchmarkId = selectedPortfolio?.benchmarkId ?? DEFAULT_BENCHMARK_ID;

  const handleRemove = useCallback(async (holding: Holding) => {
    setDrawerHolding(null);
    await removeExistingHolding(holding.id);
  }, [removeExistingHolding]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
      </div>
    );
  }

  if (portfolios.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: 24 }}>
        <Briefcase size={24} style={{ color: 'var(--muted-foreground)', marginBottom: 12, opacity: 0.5 }} />
        <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>No portfolios yet</p>
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '0 0 20px' }}>Create a portfolio from the Portfolio Overview page first.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em' }}>Holdings & Watchlist</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
            {selectedPortfolio?.name} · {holdings.length} position{holdings.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Portfolio selector */}
          {portfolios.length > 1 && (
            <select
              value={selectedPortfolio?.id ?? ''}
              onChange={e => selectPortfolio(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer' }}
            >
              {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {/* Filter */}
          {holdings.length > 0 && (
            <div style={{ position: 'relative' }}>
              <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter holdings..."
                style={{ padding: '6px 10px 6px 24px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', outline: 'none', width: 160 }}
              />
            </div>
          )}

          <button
            onClick={() => setShowAdd(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            <Plus size={12} /> Add Holding
          </button>
        </div>
      </div>

      {/* Holdings table */}
      <div style={{ padding: '16px 24px' }}>
        {holdingsLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16, color: 'var(--muted-foreground)', fontSize: 12 }}>
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} /> Loading holdings…
          </div>
        ) : filtered.length === 0 && holdings.length === 0 ? (
          <EmptyHoldings onAdd={() => setShowAdd(true)} portfolioName={selectedPortfolio?.name ?? 'Portfolio'} />
        ) : (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>
                {filtered.length} Holding{filtered.length !== 1 ? 's' : ''}
                {filter && ` matching "${filter}"`}
              </p>
              <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Click a row to open intelligence drawer</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                    {['Symbol', 'Name', 'Class', 'Sector', 'Weight', '30D Return', 'Trend', 'Conviction', ''].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .sort((a, b) => (effectiveWeights[b.symbol] ?? 0) - (effectiveWeights[a.symbol] ?? 0))
                    .map((h, i) => (
                      <HoldingRow
                        key={h.id}
                        holding={h}
                        weight={effectiveWeights[h.symbol] ?? 0}
                        index={i}
                        onOpen={() => setDrawerHolding(h)}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals & drawers */}
      {showAdd && (
        <AddHoldingModal onClose={() => setShowAdd(false)} onAdd={(p) => addNewHolding(p).then(() => undefined)} />
      )}

      {drawerHolding && (
        <HoldingDrawer
          holding={drawerHolding}
          benchmarkId={benchmarkId}
          onClose={() => setDrawerHolding(null)}
          onRemove={() => handleRemove(drawerHolding)}
        />
      )}
    </div>
  );
};
