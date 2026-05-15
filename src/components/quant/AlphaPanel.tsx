import React, { useState, useCallback, useId } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, BarChart, Bar,
} from 'recharts';
import { Play, Loader2, Copy, Check, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { ChartDownloadButton, useChartExport } from './ChartDownloadButton';
import { toast } from 'sonner';

import {
  closes, logReturns, annualisedVol, rollingAnnualisedVol,
  rollingZScore, smaCross, pearson, alignClosesByTs, mean, stdev,
  rebase100, beta as calcBeta, jensensAlpha, trackingError, informationRatio,
  sharpeRatio,
  type SmaCrossState,
} from '../../lib/quant';
import { fetchOHLCV } from '../../services/marketService';
import type { OHLCVBar, Timeframe } from '../../types';
import { StatTile } from './StatTile';
import { FreshnessBadge } from './FreshnessBadge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetRow { id: string; symbol: string; isBenchmark: boolean; }

interface AssetResult {
  symbol: string;
  isBenchmark: boolean;
  bars: OHLCVBar[];
  lr: number[];
  annVol: number;
  annReturn: number;
  sharpe: number;
  beta: number | null;
  alpha: number | null;
  infoRatio: number | null;
  trackingError: number | null;
  rebased: number[];  // rebased to 100
}

interface AlphaPanelProps {
  defaultSymbol?: string;
  onSaveSession?: (payload: {
    name: string; panel: 'alpha'; symbols: string[]; timeframe: string;
    summary: Record<string, string | number>;
    rawSnapshot?: { alphaMetrics?: import('../../types').LabSessionAssetSnapshot[] };
  }) => Promise<void>;
}

// ─── Constants & helpers ──────────────────────────────────────────────────────

const TIMEFRAMES: Timeframe[] = ['1day', '1week', '1month'];
const TF_LABEL: Partial<Record<Timeframe, string>> = { '1day': '1D', '1week': '1W', '1month': '1M' };
const SIZE_MAP: Partial<Record<Timeframe, number>> = { '1day': 250, '1week': 200, '1month': 120 };
const PPY_MAP: Partial<Record<Timeframe, number>> = { '1day': 252, '1week': 52, '1month': 12 };
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)',
  '#B87333', '#7c5cbf', '#2aa198', '#d33682', '#6c71c4'];
const MAX_ASSETS = 10;

function fmt2(n: number | null): string { return n != null && isFinite(n) ? n.toFixed(2) : '—'; }
function fmtPct(n: number | null): string { return n != null && isFinite(n) ? `${n.toFixed(2)}%` : '—'; }

const inputStyle: React.CSSProperties = {
  fontSize: 12, padding: '5px 8px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', width: '100%',
};
const tfBtn = (active: boolean): React.CSSProperties => ({
  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
  border: '1px solid var(--border)',
  background: active ? 'var(--primary)' : 'var(--card)',
  color: active ? 'var(--primary-foreground)' : 'var(--foreground)',
});
const runBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  background: 'var(--primary)', color: 'var(--primary-foreground)',
  display: 'inline-flex', alignItems: 'center', gap: 6,
});

const SMA_STATE_LABEL: Record<SmaCrossState, string> = {
  bullish: '▲ Bullish', bearish: '▼ Bearish', neutral: '· Neutral', insufficient: '—',
};
const SMA_STATE_COLOR: Record<SmaCrossState, string> = {
  bullish: '#788C5D', bearish: 'var(--chart-1)', neutral: 'var(--muted-foreground)', insufficient: 'var(--muted-foreground)',
};

// ─── Save inline ─────────────────────────────────────────────────────────────

const SaveInline: React.FC<{ onSave: (name: string) => Promise<void> }> = ({ onSave }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const def = `Alpha ${new Date().toLocaleDateString()}`;
  if (!open) return (
    <button onClick={() => { setName(def); setOpen(true); }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
      Save Session
    </button>
  );
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Session name"
        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', width: 180 }}
        autoFocus onKeyDown={e => e.key === 'Escape' && setOpen(false)} />
      <button onClick={async () => { setSaving(true); try { await onSave(name || def); setOpen(false); } catch { toast.error('Failed'); } finally { setSaving(false); } }}
        disabled={saving} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button onClick={() => setOpen(false)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export const AlphaPanel: React.FC<AlphaPanelProps> = ({ defaultSymbol = 'SPY', onSaveSession }) => {
  const uid = useId();
  const [rows, setRows] = useState<AssetRow[]>([
    { id: `${uid}-0`, symbol: defaultSymbol, isBenchmark: false },
    { id: `${uid}-1`, symbol: 'SPY', isBenchmark: true },
  ]);
  const [timeframe, setTimeframe] = useState<Timeframe>('1day');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<AssetResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [failedSymbols, setFailedSymbols] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const rebasedExport  = useChartExport('alpha-rebased-equity.png');
  const zscoreExport   = useChartExport('alpha-zscore.png');
  const smaExport      = useChartExport('alpha-sma-crossover.png');

  const addRow = useCallback(() => {
    if (rows.length >= MAX_ASSETS) return;
    setRows(r => [...r, { id: `${uid}-${Date.now()}`, symbol: '', isBenchmark: false }]);
  }, [rows.length, uid]);

  const removeRow = useCallback((id: string) => {
    setRows(r => r.length > 1 ? r.filter(x => x.id !== id) : r);
  }, []);

  const updateRow = useCallback((id: string, field: 'symbol' | 'isBenchmark', val: string | boolean) => {
    setRows(r => r.map(x => x.id === id ? { ...x, [field]: val } : x));
  }, []);

  const setBenchmarkRow = useCallback((id: string) => {
    setRows(r => r.map(x => ({ ...x, isBenchmark: x.id === id })));
  }, []);

  const run = useCallback(async () => {
    const validRows = rows.filter(r => r.symbol.trim());
    if (!validRows.length) return;
    setRunning(true); setError(null); setFailedSymbols([]);
    try {
      const ppy = PPY_MAP[timeframe] ?? 252;
      const outputsize = SIZE_MAP[timeframe] ?? 250;
      const settled = await Promise.allSettled(
        validRows.map(r => fetchOHLCV(r.symbol.trim().toUpperCase(), timeframe, outputsize))
      );
      const benchRow = validRows.find(r => r.isBenchmark);
      const benchIdx = benchRow ? validRows.indexOf(benchRow) : -1;
      const benchResult = benchIdx >= 0 && settled[benchIdx].status === 'fulfilled'
        ? (settled[benchIdx] as PromiseFulfilledResult<{ bars: OHLCVBar[] }>).value
        : null;
      const benchLr = benchResult ? logReturns(closes(benchResult.bars)) : null;
      const benchAnnReturn = benchLr
        ? (Math.exp(mean(benchLr) * ppy) - 1)
        : null;

      const newFailed: string[] = [];
      const computed: AssetResult[] = settled.map((res, i) => {
        const row = validRows[i];
        const sym = row.symbol.trim().toUpperCase();
        if (res.status === 'rejected') { newFailed.push(sym); return null; }
        const { bars } = res.value;
        if (bars.length < 5) { newFailed.push(sym); return null; }
        const cs = closes(bars);
        const lr = logReturns(cs);
        const annVol = annualisedVol(lr, ppy) * 100;
        const annReturn = Math.exp(mean(lr) * ppy) - 1;
        const sharpe = sharpeRatio(lr, 0, ppy);
        const rebased = rebase100(cs);

        let b: number | null = null, alpha: number | null = null;
        let te: number | null = null, ir: number | null = null;
        if (benchLr && benchAnnReturn != null && !row.isBenchmark) {
          const aligned = alignClosesByTs(bars, benchResult!.bars);
          if (aligned.a.length >= 20) {
            const ra = logReturns(aligned.a), rb = logReturns(aligned.b);
            b = calcBeta(ra, rb);
            alpha = jensensAlpha(annReturn, benchAnnReturn, b);
            te = trackingError(ra, rb, ppy);
            ir = informationRatio(annReturn, benchAnnReturn, te);
          }
        }
        return { symbol: sym, isBenchmark: row.isBenchmark, bars, lr, annVol, annReturn, sharpe, beta: b, alpha, infoRatio: ir, trackingError: te, rebased };
      }).filter((x): x is AssetResult => x !== null);

      setFailedSymbols(newFailed);
      setResults(computed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setRunning(false); }
  }, [rows, timeframe]);

  // ── Indexed chart data ──────────────────────────────────────────────────────
  const indexedData = results.length
    ? Array.from({ length: Math.max(...results.map(r => r.rebased.length)) }, (_, i) => {
        const pt: Record<string, number | null> = { i };
        for (const r of results) pt[r.symbol] = r.rebased[i] ?? null;
        return pt;
      })
    : [];

  // ── Return distribution (primary asset) ────────────────────────────────────
  const primary = results.find(r => !r.isBenchmark) ?? results[0];
  const distData = primary ? (() => {
    const bins = 30;
    const lr = primary.lr;
    const lo = Math.min(...lr), hi = Math.max(...lr);
    const step = (hi - lo) / bins || 0.001;
    const counts = new Array(bins).fill(0);
    for (const v of lr) {
      const idx = Math.min(bins - 1, Math.floor((v - lo) / step));
      counts[idx]++;
    }
    const m = mean(lr), s = stdev(lr);
    return counts.map((count, i) => {
      const x = lo + (i + 0.5) * step;
      const normal = (lr.length * step) * (1 / (s * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - m) / s) ** 2);
      return { x: `${(x * 100).toFixed(1)}%`, count, normal: +normal.toFixed(1) };
    });
  })() : [];

  // ── Z-score (primary) ───────────────────────────────────────────────────────
  const zData = primary ? (() => {
    const zs = rollingZScore(closes(primary.bars), 30);
    return zs.map((z, i) => ({ i, z }));
  })() : [];

  // ── SMA cross (primary) ─────────────────────────────────────────────────────
  const smaResult = primary ? smaCross(closes(primary.bars), 20, 50) : null;

  const handleSave = useCallback(async (name: string) => {
    if (!onSaveSession || !results.length) return;
    const primary = results.find(r => !r.isBenchmark) ?? results[0];
    await onSaveSession({
      name, panel: 'alpha',
      symbols: results.map(r => r.symbol),
      timeframe,
      summary: {
        assets: results.length,
        primaryReturn: +primary.annReturn.toFixed(4),
        primarySharpe: +primary.sharpe.toFixed(4),
        primaryVol: +primary.annVol.toFixed(2),
      },
      rawSnapshot: {
        alphaMetrics: results.map(r => ({
          symbol: r.symbol,
          annVol: r.annVol,
          annReturn: r.annReturn,
          sharpe: r.sharpe,
          beta: r.beta ?? undefined,
          alpha: r.alpha ?? undefined,
          infoRatio: r.infoRatio ?? undefined,
          trackingError: r.trackingError ?? undefined,
          equityCurve: r.rebased.filter((_, i) => i % 5 === 0),
        })),
      },
    });
    toast.success('Alpha session saved');
  }, [results, timeframe, onSaveSession]);

  const AXIS = { fontSize: 10, fill: 'var(--muted-foreground)' };
  const GRID = { stroke: 'var(--border)', strokeDasharray: '2 4' };
  const TIP: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, padding: '6px 10px' };

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '0 4px' }}>

      {/* ── Controls ─────────────────────────────────────────────────────────── */}
      <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Assets (up to {MAX_ASSETS})</span>
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {TIMEFRAMES.map(tf => <button key={tf} onClick={() => setTimeframe(tf)} style={tfBtn(tf === timeframe)}>{TF_LABEL[tf]}</button>)}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {rows.map((row, i) => (
            <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 24, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
              <input
                value={row.symbol}
                onChange={e => updateRow(row.id, 'symbol', e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && run()}
                placeholder={i === 0 ? 'Subject (e.g. AAPL)' : 'Peer / benchmark'}
                style={{ ...inputStyle, width: 160 }}
              />
              <button
                onClick={() => setBenchmarkRow(row.id)}
                title="Set as primary benchmark"
                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: row.isBenchmark ? 'var(--primary)' : 'var(--card)', color: row.isBenchmark ? 'var(--primary-foreground)' : 'var(--muted-foreground)', cursor: 'pointer', flexShrink: 0 }}
              >
                {row.isBenchmark ? '★ Bench' : '☆ Set bench'}
              </button>
              {rows.length > 1 && (
                <button onClick={() => removeRow(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 2 }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          {rows.length < MAX_ASSETS && (
            <button onClick={addRow} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: 11, cursor: 'pointer' }}>
              <Plus size={11} /> Add asset
            </button>
          )}
          <button onClick={run} disabled={running || rows.every(r => !r.symbol.trim())} style={runBtn(running || rows.every(r => !r.symbol.trim()))}>
            {running ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Running…</> : <><Play size={13} /> Run</>}
          </button>
          {results.length > 0 && onSaveSession && <SaveInline onSave={handleSave} />}
          {results.length > 0 && (
            <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(results.map(r => ({ symbol: r.symbol, annReturn: r.annReturn.toFixed(4), sharpe: r.sharpe.toFixed(4), annVol: r.annVol.toFixed(4), beta: r.beta, alpha: r.alpha, infoRatio: r.infoRatio })), null, 2)); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 11, cursor: 'pointer', color: 'var(--foreground)' }}>
              {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy JSON</>}
            </button>
          )}
        </div>
        {error && <p style={{ color: 'var(--chart-1)', fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={13} />{error}</p>}
        {failedSymbols.length > 0 && (
          <p style={{ color: 'var(--chart-1)', fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={13} />
            Could not load: <strong>{failedSymbols.join(', ')}</strong> — check symbols or retry (may be rate-limited).
          </p>
        )}
      </section>

      {results.length === 0 && !running && (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '16px 0' }}>
          Add assets above and click Run. Set one as the benchmark to compute Beta, Jensen's α, and Information Ratio.
        </p>
      )}

      {results.length > 0 && (
        <>
          {/* ── KPI tiles ────────────────────────────────────────────────────── */}
          {primary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
              <StatTile label="Ann. Return" value={fmtPct(primary.annReturn * 100)} delta={primary.annReturn} />
              <StatTile label="Ann. Vol" value={fmtPct(primary.annVol)} />
              <StatTile label="Sharpe" value={fmt2(primary.sharpe)} />
              {primary.beta != null && <StatTile label="Beta" value={fmt2(primary.beta)} />}
              {primary.alpha != null && <StatTile label="Jensen's α" value={fmtPct(primary.alpha * 100)} delta={primary.alpha} />}
              {primary.infoRatio != null && <StatTile label="Info. Ratio" value={fmt2(primary.infoRatio)} />}
            </div>
          )}

          {/* ── Indexed Performance Chart ─────────────────────────────────── */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p className="ds-label" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
                Indexed Performance (rebased to 100)
                {results.length > 1 && <span style={{ fontWeight: 400 }}> — {results.length} assets</span>}
              </p>
              <ChartDownloadButton onDownload={rebasedExport.download} downloading={rebasedExport.downloading} position="inline" />
            </div>
            <div ref={rebasedExport.chartRef}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={indexedData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="i" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={() => ''} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={v => `${v.toFixed(0)}`} />
                <Tooltip contentStyle={TIP} formatter={(v: number, name: string) => [`${v.toFixed(1)}`, name]} />
                <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="3 3" />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {results.map((r, i) => (
                  <Line key={r.symbol} type="monotone" dataKey={r.symbol}
                    stroke={COLORS[i % COLORS.length]} strokeWidth={r.isBenchmark ? 1 : 1.8}
                    strokeDasharray={r.isBenchmark ? '4 3' : undefined}
                    dot={false} name={r.isBenchmark ? `${r.symbol} (bench)` : r.symbol}
                    connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
            </div>
            <FreshnessBadge status="cached" fetchedAt={results[0] ? Date.now() : null} compact />
          </section>

          {/* ── Metrics Table ─────────────────────────────────────────────── */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16, overflowX: 'auto' }}>
            <p className="ds-label" style={{ margin: '0 0 10px', color: 'var(--muted-foreground)' }}>Comparative Metrics</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Asset', 'Ann. Return', 'Ann. Vol', 'Sharpe', 'Beta', "Jensen's α", 'Info. Ratio', 'Track. Error'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--muted-foreground)', fontSize: 10, fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.symbol} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontWeight: 600 }}>{r.symbol}</span>
                      {r.isBenchmark && <span style={{ fontSize: 9, color: 'var(--muted-foreground)', background: 'var(--muted)', borderRadius: 3, padding: '1px 4px' }}>BENCH</span>}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: r.annReturn >= 0 ? '#788C5D' : 'var(--chart-1)' }}>{fmtPct(r.annReturn * 100)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmtPct(r.annVol)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: r.sharpe > 1 ? '#788C5D' : r.sharpe < 0 ? 'var(--chart-1)' : 'inherit' }}>{fmt2(r.sharpe)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt2(r.beta)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: r.alpha != null ? (r.alpha > 0 ? '#788C5D' : 'var(--chart-1)') : 'inherit' }}>{r.alpha != null ? fmtPct(r.alpha * 100) : '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt2(r.infoRatio)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{r.trackingError != null ? fmtPct(r.trackingError * 100) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ── Return Distribution (primary) ─────────────────────────────── */}
          {distData.length > 0 && (
            <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
              <p className="ds-label" style={{ margin: '0 0 10px', color: 'var(--muted-foreground)' }}>
                Return Distribution · {primary?.symbol} <span style={{ fontWeight: 400 }}>(daily log-returns)</span>
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={distData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={6}>
                  <CartesianGrid {...GRID} vertical={false} />
                  <XAxis dataKey="x" tick={AXIS} axisLine={false} tickLine={false} interval={Math.floor(distData.length / 6)} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TIP} />
                  <Bar dataKey="count" fill="var(--chart-3)" opacity={0.7} name="Observed" />
                  <Line type="monotone" dataKey="normal" stroke="var(--chart-1)" strokeWidth={1.5} dot={false} name="Normal" />
                </BarChart>
              </ResponsiveContainer>
            </section>
          )}

          {/* ── Z-score ───────────────────────────────────────────────────── */}
          {zData.length > 0 && (
            <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p className="ds-label" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
                  Rolling Z-Score · {primary?.symbol} <span style={{ fontWeight: 400 }}>(30-bar window)</span>
                </p>
                <ChartDownloadButton onDownload={zscoreExport.download} downloading={zscoreExport.downloading} position="inline" />
              </div>
              <div ref={zscoreExport.chartRef}>
              <ResponsiveContainer width="100%" height={130}>
                <LineChart data={zData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="i" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={() => ''} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TIP} formatter={(v: number) => [v.toFixed(2), 'Z-Score']} />
                  <ReferenceLine y={2} stroke="rgba(193,95,60,0.5)" strokeDasharray="3 3" label={{ value: '+2σ', fontSize: 9, fill: 'var(--muted-foreground)', position: 'right' }} />
                  <ReferenceLine y={-2} stroke="rgba(106,155,204,0.5)" strokeDasharray="3 3" label={{ value: '-2σ', fontSize: 9, fill: 'var(--muted-foreground)', position: 'right' }} />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <Line type="monotone" dataKey="z" stroke="var(--chart-2)" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* ── SMA Cross (primary) ───────────────────────────────────────── */}
          {smaResult && smaResult.state !== 'insufficient' && (
            <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <p className="ds-label" style={{ margin: 0, color: 'var(--muted-foreground)' }}>SMA Cross · {primary?.symbol}</p>
                  <span style={{ fontSize: 12, fontWeight: 700, color: SMA_STATE_COLOR[smaResult.state] }}>
                    {SMA_STATE_LABEL[smaResult.state]}
                  </span>
                </div>
                <ChartDownloadButton onDownload={smaExport.download} downloading={smaExport.downloading} position="inline" />
              </div>
              <div ref={smaExport.chartRef}>
              <ResponsiveContainer width="100%" height={130}>
                <LineChart data={closes(primary!.bars).map((p, i) => ({
                  i, price: p,
                  fast: i >= 19 ? smaResult.fastSma[i - 19] ?? null : null,
                  slow: i >= 49 ? smaResult.slowSma[i - 49] ?? null : null,
                }))} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="i" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={() => ''} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TIP} formatter={(v: number) => [v.toFixed(2), '']} />
                  <Line type="monotone" dataKey="price" stroke="var(--chart-4)" strokeWidth={1} dot={false} name="Price" opacity={0.6} />
                  <Line type="monotone" dataKey="fast" stroke="var(--chart-2)" strokeWidth={1.5} dot={false} name="SMA 20" connectNulls />
                  <Line type="monotone" dataKey="slow" stroke="var(--chart-1)" strokeWidth={1.5} dot={false} name="SMA 50" connectNulls />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </LineChart>
              </ResponsiveContainer>
              </div>
            </section>
          )}
        </>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
};
