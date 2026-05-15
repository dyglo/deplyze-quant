import React, { useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { Play, Loader2, Copy, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import {
  closes, logReturns, annualisedVol, rollingAnnualisedVol,
  rollingZScore, smaCross, pearson, rollingPearson,
  alignClosesByTs, mean, type SmaCrossState,
} from '../../lib/quant';
import { fetchOHLCV } from '../../services/marketService';
import type { OHLCVBar, Timeframe } from '../../types';
import { StatTile } from './StatTile';
import { FreshnessBadge } from './FreshnessBadge';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AlphaResult {
  symbol: string;
  benchmarkSymbol: string | null;
  timeframe: Timeframe;
  fetchedAt: number;
  bars: OHLCVBar[];
  // series (pre-computed for charts)
  rollingVol: number[];      // 30-bar rolling ann. vol %
  zScores: number[];         // rolling z-score on price
  fastSma: number[];
  slowSma: number[];
  fastWindow: number;
  slowWindow: number;
  zWindow: number;
  smaState: SmaCrossState;
  lastFast: number;
  lastSlow: number;
  // scalars
  annVol: number;
  totalReturn: number;
  currentZ: number;
  // benchmark
  benchCorr: number | null;
  rollingCorr: number[];
}

interface AlphaPanelProps {
  defaultSymbol?: string;
  onSaveSession?: (payload: { name: string; panel: 'alpha'; symbols: string[]; timeframe: string; summary: Record<string, string | number> }) => Promise<void>;
}

const SaveSessionInline: React.FC<{ onSave: (name: string) => Promise<void> }> = ({ onSave }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const defaultName = `Alpha session ${new Date().toLocaleDateString()}`;

  if (!open) {
    return (
      <button
        onClick={() => { setName(defaultName); setOpen(true); }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
      >
        Save Session
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Session name"
        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', width: 180 }}
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      />
      <button
        onClick={async () => { setSaving(true); try { await onSave(name || defaultName); setOpen(false); } catch { toast.error('Failed to save session'); } finally { setSaving(false); } }}
        disabled={saving}
        style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button onClick={() => setOpen(false)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
    </div>
  );
};

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMEFRAMES: Timeframe[] = ['1day', '1week', '1month'];
const TF_LABEL: Partial<Record<Timeframe, string>> = { '1day': '1D', '1week': '1W', '1month': '1M' };
const SIZE_MAP: Partial<Record<Timeframe, number>> = { '1day': 250, '1week': 200, '1month': 120 };
const PPY_MAP: Partial<Record<Timeframe, number>> = { '1day': 252, '1week': 52, '1month': 12 };

function fmt2(n: number): string { return isFinite(n) ? n.toFixed(2) : '—'; }
function fmtPct(n: number): string { return isFinite(n) ? `${n.toFixed(2)}%` : '—'; }

const SMA_STATE_COLOR: Record<SmaCrossState, string> = {
  bullish: '#788C5D',
  bearish: 'var(--primary)',
  neutral: 'var(--muted-foreground)',
  insufficient: 'var(--muted-foreground)',
};
const SMA_STATE_LABEL: Record<SmaCrossState, string> = {
  bullish: '▲ Bullish',
  bearish: '▼ Bearish',
  neutral: '· Neutral',
  insufficient: '— Insufficient data',
};

// ─── Component ───────────────────────────────────────────────────────────────

export const AlphaPanel: React.FC<AlphaPanelProps> = ({ defaultSymbol = 'SPY', onSaveSession }) => {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [benchmark, setBenchmark] = useState('');
  const [timeframe, setTimeframe] = useState<Timeframe>('1day');
  const [fastWindow, setFastWindow] = useState(20);
  const [slowWindow, setSlowWindow] = useState(50);
  const [zWindow, setZWindow] = useState(30);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AlphaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = useCallback(async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    const bench = benchmark.trim().toUpperCase() || null;
    setRunning(true);
    setError(null);
    try {
      const outputsize = SIZE_MAP[timeframe] ?? 200;
      const ppy = PPY_MAP[timeframe] ?? 252;
      const fast = Math.max(5, Math.min(fastWindow, 100));
      const slow = Math.max(fast + 1, Math.min(slowWindow, 200));
      const zw = Math.max(10, Math.min(zWindow, 120));

      const [primaryRes, secondaryRes] = await Promise.allSettled([
        fetchOHLCV(sym, timeframe, outputsize),
        bench ? fetchOHLCV(bench, timeframe, outputsize) : Promise.resolve(null),
      ]);

      if (primaryRes.status === 'rejected') {
        throw primaryRes.reason instanceof Error ? primaryRes.reason : new Error(String(primaryRes.reason));
      }
      const { bars } = primaryRes.value;
      if (bars.length < 10) throw new Error(`Only ${bars.length} bars returned for ${sym}.`);

      const cs = closes(bars);
      const lr = logReturns(cs);
      const annVol = annualisedVol(lr, ppy) * 100;
      const totalReturn = ((cs[cs.length - 1] / cs[0]) - 1) * 100;
      const rollingVol = rollingAnnualisedVol(lr, Math.min(30, lr.length - 1), ppy);
      const zScores = rollingZScore(cs, Math.min(zw, cs.length - 1));
      const currentZ = zScores.length > 0 ? zScores[zScores.length - 1] : 0;
      const { state: smaState, fastSma, slowSma, lastFast, lastSlow } = smaCross(cs, fast, slow);

      // Benchmark
      let benchCorr: number | null = null;
      let rollingCorr: number[] = [];
      if (bench && secondaryRes.status === 'fulfilled' && secondaryRes.value) {
        const aligned = alignClosesByTs(bars, secondaryRes.value.bars);
        if (aligned.a.length >= 20) {
          const ra = logReturns(aligned.a);
          const rb = logReturns(aligned.b);
          benchCorr = pearson(ra, rb);
          rollingCorr = rollingPearson(ra, rb, Math.min(60, ra.length));
        }
      }

      setResult({
        symbol: sym, benchmarkSymbol: bench, timeframe, fetchedAt: Date.now(),
        bars, rollingVol, zScores, fastSma, slowSma, fastWindow: fast, slowWindow: slow,
        zWindow: zw, smaState, lastFast, lastSlow,
        annVol, totalReturn, currentZ, benchCorr, rollingCorr,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [symbol, benchmark, timeframe, fastWindow, slowWindow, zWindow]);

  const copyJSON = useCallback(() => {
    if (!result) return;
    const payload = {
      symbol: result.symbol, benchmark: result.benchmarkSymbol, timeframe: result.timeframe,
      fetchedAt: new Date(result.fetchedAt).toISOString(),
      annVol: +result.annVol.toFixed(4), totalReturn: +result.totalReturn.toFixed(4),
      currentZScore: +result.currentZ.toFixed(4), smaState: result.smaState,
      fastSmaLast: +result.lastFast.toFixed(4), slowSmaLast: +result.lastSlow.toFixed(4),
      benchmarkCorrelation: result.benchCorr != null ? +result.benchCorr.toFixed(4) : null,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  // Build SMA overlay chart data aligned to price array
  const smaChartData = result
    ? result.bars.map((_, i) => {
        const fOffset = result.fastWindow - 1;
        const sOffset = result.slowWindow - 1;
        return {
          i,
          price: closes(result.bars)[i],
          fast: i >= fOffset ? result.fastSma[i - fOffset] ?? null : null,
          slow: i >= sOffset ? result.slowSma[i - sOffset] ?? null : null,
        };
      })
    : [];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 4px' }}>

      {/* Controls */}
      <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Symbol</span>
            <input
              value={symbol} onChange={e => setSymbol(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run()}
              placeholder="e.g. AAPL"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Benchmark (opt.)</span>
            <input
              value={benchmark} onChange={e => setBenchmark(e.target.value)}
              placeholder="e.g. SPY"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Timeframe</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {TIMEFRAMES.map(tf => (
                <button key={tf} onClick={() => setTimeframe(tf)} style={tfBtnStyle(tf === timeframe)}>
                  {TF_LABEL[tf]}
                </button>
              ))}
            </div>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>SMA Fast</span>
            <input
              type="number" value={fastWindow} min={5} max={100}
              onChange={e => setFastWindow(Math.max(5, Math.min(100, +e.target.value)))}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>SMA Slow</span>
            <input
              type="number" value={slowWindow} min={20} max={200}
              onChange={e => setSlowWindow(Math.max(20, Math.min(200, +e.target.value)))}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Z-score window</span>
            <input
              type="number" value={zWindow} min={10} max={120}
              onChange={e => setZWindow(Math.max(10, Math.min(120, +e.target.value)))}
              style={inputStyle}
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={run} disabled={running || !symbol.trim()} style={runBtnStyle(running || !symbol.trim())}>
              {running ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={13} />}
              {running ? 'Running…' : 'Run'}
            </button>
          </div>
        </div>
      </section>

      {/* Error */}
      {error && (
        <section className="ds-surface" style={{ padding: 12, borderRadius: 10, marginBottom: 16, border: '1px solid rgba(176,72,72,0.35)', background: 'rgba(176,72,72,0.06)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={15} style={{ color: '#b04848', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="ds-caption" style={{ margin: '0 0 6px', color: 'var(--foreground)' }}>{error}</p>
            <button onClick={run} style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid #b04848', background: 'transparent', color: '#b04848', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Retry</button>
          </div>
        </section>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="ds-heading" style={{ margin: 0 }}>{result.symbol}</span>
              {result.benchmarkSymbol && <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>vs {result.benchmarkSymbol}</span>}
              <FreshnessBadge status="live" fetchedAt={result.fetchedAt} />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {onSaveSession && (
                <SaveSessionInline
                  onSave={async (name) => {
                    const syms = [result.symbol, ...(result.benchmarkSymbol ? [result.benchmarkSymbol] : [])];
                    await onSaveSession({
                      name,
                      panel: 'alpha',
                      symbols: syms,
                      timeframe: result.timeframe,
                      summary: {
                        annVol: +result.annVol.toFixed(2),
                        currentZ: +result.currentZ.toFixed(2),
                        totalReturn: +result.totalReturn.toFixed(2),
                        ...(result.benchCorr != null ? { benchCorr: +result.benchCorr.toFixed(2) } : {}),
                      },
                    });
                    toast.success('Session saved');
                  }}
                />
              )}
              <button onClick={copyJSON} style={copyBtnStyle}>
                {copied ? <Check size={12} style={{ color: '#4E6040' }} /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy JSON'}
              </button>
            </div>
          </div>

          {/* Section 1 — Stats */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <h2 className="ds-heading" style={{ margin: '0 0 10px' }}>Alpha Signals</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 10 }}>
              <StatTile label="Ann. Volatility" value={fmtPct(result.annVol)} hint="Full-window annualised σ" />
              <StatTile label="Total Return" value={fmtPct(result.totalReturn)} delta={result.totalReturn} hint="Window start-to-end" />
              <StatTile
                label="SMA State"
                value={
                  <span style={{ color: SMA_STATE_COLOR[result.smaState], fontWeight: 700 }}>
                    {SMA_STATE_LABEL[result.smaState]}
                  </span>
                }
                hint={`${result.fastWindow}/${result.slowWindow} crossover`}
              />
              <StatTile
                label="Current Z-score"
                value={isFinite(result.currentZ) ? result.currentZ.toFixed(2) : '—'}
                delta={isFinite(result.currentZ) ? result.currentZ * 10 : undefined}
                hint={`${result.zWindow}-bar mean-reversion signal`}
              />
              <StatTile label={`Fast SMA (${result.fastWindow})`} value={result.lastFast > 0 ? result.lastFast.toFixed(2) : '—'} hint="Last bar fast SMA value" />
              <StatTile label={`Slow SMA (${result.slowWindow})`} value={result.lastSlow > 0 ? result.lastSlow.toFixed(2) : '—'} hint="Last bar slow SMA value" />
              {result.benchCorr != null && (
                <StatTile
                  label={`Corr. vs ${result.benchmarkSymbol}`}
                  value={fmt2(result.benchCorr)}
                  delta={result.benchCorr * 20}
                  hint="Pearson on full aligned window"
                />
              )}
            </div>
          </section>

          {/* Section 2 — Rolling Vol chart */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <h2 className="ds-heading" style={{ margin: '0 0 10px' }}>30-bar Rolling Volatility (Ann. %)</h2>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={result.rollingVol.map((v, i) => ({ i, v: +v.toFixed(2) }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="i" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={44} tickFormatter={v => `${v.toFixed(0)}%`} />
                <Tooltip formatter={(v: any) => [`${v.toFixed(2)}%`, 'Ann. Vol']} labelFormatter={l => `Bar ${l}`} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="v" stroke="var(--chart-1)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </section>

          {/* Section 3 — Z-score chart */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <h2 className="ds-heading" style={{ margin: 0 }}>Mean-Reversion Z-Score ({result.zWindow}-bar)</h2>
              {isFinite(result.currentZ) && Math.abs(result.currentZ) > 1.5 && (
                <span className="ds-caption" style={{
                  color: result.currentZ > 0 ? '#b04848' : '#4E6040',
                  fontWeight: 600, padding: '2px 8px',
                  background: result.currentZ > 0 ? 'rgba(176,72,72,0.1)' : 'rgba(78,96,64,0.1)',
                  borderRadius: 4,
                }}>
                  {result.currentZ > 1.5 ? '⚠ Elevated — potential mean reversion' : '↑ Depressed — potential bounce signal'}
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={result.zScores.map((v, i) => ({ i, v: +v.toFixed(3) }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="i" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={36} tickFormatter={v => v.toFixed(1)} />
                <Tooltip formatter={(v: any) => [v.toFixed(3), 'Z-score']} labelFormatter={l => `Bar ${l}`} contentStyle={tooltipStyle} />
                <ReferenceLine y={2} stroke="#b04848" strokeDasharray="4 3" label={{ value: '+2σ', position: 'right', fontSize: 10, fill: '#b04848' }} />
                <ReferenceLine y={1} stroke="rgba(176,72,72,0.4)" strokeDasharray="4 3" />
                <ReferenceLine y={0} stroke="var(--border)" />
                <ReferenceLine y={-1} stroke="rgba(78,96,64,0.4)" strokeDasharray="4 3" />
                <ReferenceLine y={-2} stroke="#4E6040" strokeDasharray="4 3" label={{ value: '−2σ', position: 'right', fontSize: 10, fill: '#4E6040' }} />
                <Line type="monotone" dataKey="v" stroke="var(--chart-3)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </section>

          {/* Section 4 — SMA overlay chart */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <h2 className="ds-heading" style={{ margin: '0 0 10px' }}>
              SMA {result.fastWindow} / {result.slowWindow} Crossover
              {result.smaState !== 'insufficient' && (
                <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 10, color: SMA_STATE_COLOR[result.smaState] }}>
                  {SMA_STATE_LABEL[result.smaState]}
                </span>
              )}
            </h2>
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={smaChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="i" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={52} tickFormatter={v => v.toFixed(0)} />
                <Tooltip
                  formatter={(v: any, name: string) => [v != null ? v.toFixed(2) : '—', name === 'price' ? 'Price' : name === 'fast' ? `SMA ${result.fastWindow}` : `SMA ${result.slowWindow}`]}
                  labelFormatter={l => `Bar ${l}`}
                  contentStyle={tooltipStyle}
                />
                <Legend formatter={name => name === 'price' ? 'Price' : name === 'fast' ? `SMA ${result.fastWindow}` : `SMA ${result.slowWindow}`} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="price" stroke="var(--muted-foreground)" strokeWidth={1} dot={false} isAnimationActive={false} connectNulls={false} />
                <Line type="monotone" dataKey="fast" stroke="var(--chart-1)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
                <Line type="monotone" dataKey="slow" stroke="#788C5D" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </section>

          {/* Section 5 — Rolling benchmark correlation */}
          {result.benchmarkSymbol && result.rollingCorr.length > 0 && (
            <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
              <h2 className="ds-heading" style={{ margin: '0 0 10px' }}>
                Rolling 60-bar Correlation vs {result.benchmarkSymbol}
                {result.benchCorr != null && (
                  <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 10, color: 'var(--muted-foreground)' }}>
                    Full-window ρ = {result.benchCorr.toFixed(3)}
                  </span>
                )}
              </h2>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={result.rollingCorr.map((v, i) => ({ i, v: +v.toFixed(3) }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="i" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                  <YAxis domain={[-1, 1]} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={36} tickFormatter={v => v.toFixed(1)} />
                  <Tooltip formatter={(v: any) => [v.toFixed(3), 'ρ']} labelFormatter={l => `Bar ${l}`} contentStyle={tooltipStyle} />
                  <ReferenceLine y={0.5} stroke="rgba(193,95,60,0.35)" strokeDasharray="4 3" />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <ReferenceLine y={-0.5} stroke="rgba(106,155,204,0.35)" strokeDasharray="4 3" />
                  <Line type="monotone" dataKey="v" stroke="#788C5D" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </section>
          )}
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--card)', color: 'var(--foreground)', fontSize: 13,
  width: '100%', boxSizing: 'border-box',
};

const tfBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
  cursor: 'pointer', fontSize: 12, fontWeight: 600,
  background: active ? 'var(--primary)' : 'var(--card)',
  color: active ? '#fff' : 'var(--foreground)',
  transition: 'background 0.15s',
});

const runBtnStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 16px', borderRadius: 6, border: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
  background: disabled ? 'var(--muted)' : 'var(--primary)',
  color: disabled ? 'var(--muted-foreground)' : '#fff',
  width: '100%', justifyContent: 'center',
});

const copyBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--card)', color: 'var(--foreground)',
  fontSize: 11, fontWeight: 600, cursor: 'pointer',
};

const tooltipStyle: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11,
};
