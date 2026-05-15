import React, { useState, useCallback, useId } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, ReferenceLine, Cell,
} from 'recharts';
import { Play, Loader2, Plus, Trash2, Copy, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import {
  closes, logReturns, annualisedVol, maxDrawdown, equityCurve,
  pearson, covarianceMatrix, portfolioVol, riskContributions,
  portfolioAnnualisedReturn, portfolioReturnSeries, sharpeRatio,
} from '../../lib/quant';
import { fetchOHLCV } from '../../services/marketService';
import type { OHLCVBar, Timeframe } from '../../types';
import { StatTile } from './StatTile';
import { FreshnessBadge } from './FreshnessBadge';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BasketRow {
  id: string;
  symbol: string;
  weight: number; // 0–100
}

interface AssetResult {
  symbol: string;
  weight: number; // normalized 0–1
  annVol: number;
  annReturn: number;
  bars: OHLCVBar[];
  lr: number[];
}

interface PortfolioResult {
  fetchedAt: number;
  timeframe: Timeframe;
  assets: AssetResult[];
  failed: string[];
  portVol: number;
  portReturn: number;
  portSharpe: number;
  portMdd: number;
  riskContribs: number[];
  corrMatrix: number[][];
  portCurve: number[];
  diversification: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMEFRAMES: Timeframe[] = ['1day', '1week', '1month'];
const TF_LABEL: Partial<Record<Timeframe, string>> = { '1day': '1D', '1week': '1W', '1month': '1M' };
const SIZE_MAP: Partial<Record<Timeframe, number>> = { '1day': 250, '1week': 200, '1month': 120 };
const PPY_MAP: Partial<Record<Timeframe, number>> = { '1day': 252, '1week': 52, '1month': 12 };
const CHART_COLORS = ['var(--chart-1)', '#788C5D', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', '#B87333'];

const DEFAULT_BASKET: BasketRow[] = [
  { id: '1', symbol: 'SPY', weight: 60 },
  { id: '2', symbol: 'TLT', weight: 30 },
  { id: '3', symbol: 'GLD', weight: 10 },
];

function fmtPct(n: number, d = 2): string { return isFinite(n) ? `${n.toFixed(d)}%` : '—'; }
function fmt2(n: number): string { return isFinite(n) ? n.toFixed(2) : '—'; }
function corrColor(r: number, isDiag: boolean): string {
  if (isDiag) return 'rgba(120,140,93,0.25)';
  if (r >= 0.7) return 'rgba(193,95,60,0.65)';
  if (r >= 0.4) return 'rgba(193,95,60,0.35)';
  if (r >= 0.1) return 'rgba(193,95,60,0.12)';
  if (r >= -0.1) return 'transparent';
  if (r >= -0.4) return 'rgba(106,155,204,0.18)';
  if (r >= -0.7) return 'rgba(106,155,204,0.38)';
  return 'rgba(106,155,204,0.65)';
}

// ─── Save session inline ─────────────────────────────────────────────────────

const SaveSessionInline: React.FC<{ onSave: (name: string) => Promise<void> }> = ({ onSave }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const defaultName = `Portfolio session ${new Date().toLocaleDateString()}`;

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
        onClick={async () => { setSaving(true); try { await onSave(name || defaultName); setOpen(false); } finally { setSaving(false); } }}
        disabled={saving}
        style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button onClick={() => setOpen(false)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
    </div>
  );
};

interface PortfolioPanelProps {
  onSaveSession?: (payload: { name: string; panel: 'portfolio'; symbols: string[]; timeframe: string; summary: Record<string, string | number> }) => Promise<void>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const PortfolioPanel: React.FC<PortfolioPanelProps> = ({ onSaveSession }) => {
  const uid = useId();
  const [basket, setBasket] = useState<BasketRow[]>(DEFAULT_BASKET);
  const [timeframe, setTimeframe] = useState<Timeframe>('1day');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PortfolioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const weightSum = basket.reduce((s, r) => s + r.weight, 0);
  const canRun = weightSum > 0 && basket.some(r => r.symbol.trim());

  const addRow = useCallback(() => {
    if (basket.length >= 8) return;
    setBasket(b => [...b, { id: `${Date.now()}`, symbol: '', weight: 0 }]);
  }, [basket.length]);

  const removeRow = useCallback((id: string) => {
    setBasket(b => b.length > 2 ? b.filter(r => r.id !== id) : b);
  }, []);

  const updateRow = useCallback((id: string, field: 'symbol' | 'weight', val: string | number) => {
    setBasket(b => b.map(r => r.id === id ? { ...r, [field]: val } : r));
  }, []);

  const run = useCallback(async () => {
    const validRows = basket.filter(r => r.symbol.trim() && r.weight > 0);
    if (validRows.length < 2) { setError('Add at least 2 symbols with weight > 0.'); return; }
    setRunning(true);
    setError(null);

    try {
      const ppy = PPY_MAP[timeframe] ?? 252;
      const outputsize = SIZE_MAP[timeframe] ?? 200;
      const totalW = validRows.reduce((s, r) => s + r.weight, 0);
      const normalized = validRows.map(r => ({ ...r, weight: r.weight / totalW }));

      const fetches = await Promise.allSettled(
        normalized.map(r => fetchOHLCV(r.symbol.trim().toUpperCase(), timeframe, outputsize))
      );

      const assets: AssetResult[] = [];
      const failed: string[] = [];

      for (let i = 0; i < normalized.length; i++) {
        const row = normalized[i];
        const res = fetches[i];
        if (res.status === 'rejected' || (res.status === 'fulfilled' && res.value.bars.length < 5)) {
          failed.push(row.symbol.trim().toUpperCase());
        } else if (res.status === 'fulfilled') {
          const bars = res.value.bars;
          const cs = closes(bars);
          const lr = logReturns(cs);
          const lrSum = lr.reduce((a, b) => a + b, 0);
          assets.push({
            symbol: row.symbol.trim().toUpperCase(),
            weight: row.weight,
            annVol: annualisedVol(lr, ppy) * 100,
            annReturn: (Math.exp((lrSum / lr.length) * ppy) - 1) * 100,
            bars, lr,
          });
        }
      }

      if (assets.length < 2) throw new Error('At least 2 assets need valid data to compute portfolio metrics.');

      // Re-normalize weights after failures
      const totalValid = assets.reduce((s, a) => s + a.weight, 0);
      const reNorm = assets.map(a => ({ ...a, weight: a.weight / totalValid }));
      const weights = reNorm.map(a => a.weight);
      const minLen = Math.min(...reNorm.map(a => a.lr.length));
      const returnSeries = reNorm.map(a => a.lr.slice(-minLen));
      const covMat = covarianceMatrix(returnSeries);

      const portVolFrac = portfolioVol(weights, covMat, ppy);
      const portReturn = portfolioAnnualisedReturn(returnSeries, weights, ppy) * 100;
      const portReturnSer = portfolioReturnSeries(returnSeries, weights);
      const portSharpe = sharpeRatio(portReturnSer, 0, ppy);
      const portCurve = equityCurve(portReturnSer);
      const { mdd } = maxDrawdown(portCurve);
      const rc = riskContributions(weights, covMat);

      // Pairwise correlation matrix
      const n = reNorm.length;
      const corrMatrix = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (__, j) =>
          i === j ? 1 : pearson(returnSeries[i], returnSeries[j])
        )
      );

      const avgIndivVol = reNorm.reduce((s, a) => s + a.weight * a.annVol / 100, 0);
      const diversification = avgIndivVol > 0
        ? (1 - (portVolFrac / avgIndivVol)) * 100
        : 0;

      setResult({
        fetchedAt: Date.now(), timeframe,
        assets: reNorm.map((a, i) => ({ ...a, weight: weights[i] })),
        failed, portVol: portVolFrac * 100, portReturn,
        portSharpe, portMdd: mdd * 100, riskContribs: rc,
        corrMatrix, portCurve, diversification,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [basket, timeframe]);

  const copyJSON = useCallback(() => {
    if (!result) return;
    const payload = {
      fetchedAt: new Date(result.fetchedAt).toISOString(),
      timeframe: result.timeframe,
      assets: result.assets.map((a, i) => ({
        symbol: a.symbol, weight: +(a.weight * 100).toFixed(1),
        annVol: +a.annVol.toFixed(2), annReturn: +a.annReturn.toFixed(2),
        riskContrib: +(result.riskContribs[i] * 100).toFixed(2),
      })),
      portfolio: {
        annReturn: +result.portReturn.toFixed(2), annVol: +result.portVol.toFixed(2),
        sharpe: +result.portSharpe.toFixed(3), maxDrawdown: +result.portMdd.toFixed(2),
        diversification: +result.diversification.toFixed(2),
      },
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 4px' }}>

      {/* Basket editor */}
      <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
        <h2 className="ds-heading" style={{ margin: '0 0 12px' }}>Portfolio Basket</h2>

        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px 32px', gap: 8, marginBottom: 6 }}>
          <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Symbol</span>
          <span className="ds-label" style={{ color: 'var(--muted-foreground)', textAlign: 'right' }}>Weight %</span>
          <span />
        </div>

        {basket.map(row => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 88px 32px', gap: 8, marginBottom: 6 }}>
            <input
              value={row.symbol}
              onChange={e => updateRow(row.id, 'symbol', e.target.value.toUpperCase())}
              placeholder="e.g. AAPL"
              style={inputStyle}
            />
            <input
              type="number" min={0} max={100} value={row.weight}
              onChange={e => updateRow(row.id, 'weight', Math.max(0, Math.min(100, +e.target.value)))}
              style={{ ...inputStyle, textAlign: 'right' }}
            />
            <button
              onClick={() => removeRow(row.id)}
              disabled={basket.length <= 2}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--card)',
                cursor: basket.length <= 2 ? 'not-allowed' : 'pointer',
                color: basket.length <= 2 ? 'var(--muted-foreground)' : '#b04848',
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        {/* Weight sum indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 10 }}>
          <span className="ds-caption" style={{
            color: weightSum === 100 ? '#4E6040' : weightSum === 0 ? '#b04848' : '#B8860B',
            fontWeight: 600,
          }}>
            Weights sum to {weightSum.toFixed(0)}%
            {weightSum !== 100 && weightSum > 0 && ' — will be normalized on run'}
          </span>
        </div>

        {/* Add row + controls row */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={addRow}
            disabled={basket.length >= 8}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: basket.length >= 8 ? 'var(--muted-foreground)' : 'var(--foreground)',
              fontSize: 12, fontWeight: 600, cursor: basket.length >= 8 ? 'not-allowed' : 'pointer',
            }}
          >
            <Plus size={12} /> Add asset
          </button>

          {/* Timeframe */}
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {TIMEFRAMES.map(tf => (
              <button key={tf} onClick={() => setTimeframe(tf)} style={tfBtnStyle(tf === timeframe)}>
                {TF_LABEL[tf]}
              </button>
            ))}
          </div>

          <button onClick={run} disabled={running || !canRun} style={runBtnStyle(running || !canRun)}>
            {running ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={13} />}
            {running ? 'Analyzing…' : 'Run Portfolio Analysis'}
          </button>
        </div>
      </section>

      {/* Error */}
      {error && (
        <section className="ds-surface" style={{ padding: 12, borderRadius: 10, marginBottom: 16, border: '1px solid rgba(176,72,72,0.35)', background: 'rgba(176,72,72,0.06)', display: 'flex', gap: 8 }}>
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
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="ds-heading" style={{ margin: 0 }}>
                {result.assets.map(a => a.symbol).join(' / ')}
              </span>
              <FreshnessBadge status="live" fetchedAt={result.fetchedAt} />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {onSaveSession && (
                <SaveSessionInline
                  onSave={async (name) => {
                    await onSaveSession({
                      name,
                      panel: 'portfolio',
                      symbols: result.assets.map((a) => a.symbol),
                      timeframe: result.timeframe,
                      summary: {
                        portVol: +result.portVol.toFixed(2),
                        portReturn: +result.portReturn.toFixed(2),
                        portSharpe: +result.portSharpe.toFixed(2),
                        diversification: +result.diversification.toFixed(2),
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

          {/* Failed assets warning */}
          {result.failed.length > 0 && (
            <div className="ds-surface" style={{ padding: 10, borderRadius: 8, marginBottom: 12, border: '1px solid rgba(184,134,11,0.35)', background: 'rgba(184,134,11,0.06)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertTriangle size={13} style={{ color: '#B8860B', flexShrink: 0 }} />
              <span className="ds-caption" style={{ color: 'var(--foreground)' }}>
                Could not fetch {result.failed.join(', ')} — excluded from analysis.
              </span>
            </div>
          )}

          {/* Section 1 — Portfolio summary */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <h2 className="ds-heading" style={{ margin: '0 0 10px' }}>Portfolio Summary</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <StatTile label="Ann. Return" value={fmtPct(result.portReturn)} delta={result.portReturn} hint="Geometric annualised" />
              <StatTile label="Ann. Volatility" value={fmtPct(result.portVol)} hint="Portfolio σ × √ppy" />
              <StatTile label="Sharpe" value={fmt2(result.portSharpe)} delta={result.portSharpe * 10} hint="Ann. return / portfolio vol" />
              <StatTile label="Max Drawdown" value={result.portMdd > 0 ? `-${fmtPct(result.portMdd)}` : '—'} delta={result.portMdd > 0 ? -result.portMdd : undefined} hint="Peak-to-trough equity loss" />
              <StatTile label="Assets" value={result.assets.length} hint="After successful fetches" />
              <StatTile label="Diversification" value={fmtPct(result.diversification)} delta={result.diversification} hint="Vol reduction vs weighted avg" />
            </div>
          </section>

          {/* Section 2 — Asset breakdown table */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <h2 className="ds-heading" style={{ margin: '0 0 10px' }}>Asset Breakdown</h2>
            <div style={{ overflowX: 'auto' }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 80px 100px 100px 140px', gap: 8, padding: '0 4px 6px', borderBottom: '1px solid var(--border)' }}>
                {['Symbol', 'Weight', 'Ann. Return', 'Ann. Vol', 'Risk Contrib'].map(h => (
                  <span key={h} className="ds-label" style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>{h}</span>
                ))}
              </div>
              {result.assets.map((a, i) => {
                const rc = result.riskContribs[i] ?? 0;
                const isEven = i % 2 === 0;
                return (
                  <div
                    key={a.symbol}
                    style={{
                      display: 'grid', gridTemplateColumns: '80px 80px 100px 100px 140px',
                      gap: 8, padding: '8px 4px',
                      borderBottom: '1px solid var(--border)',
                      background: isEven ? 'rgba(232,230,220,0.25)' : 'transparent',
                      borderRadius: isEven ? 4 : 0,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: CHART_COLORS[i % CHART_COLORS.length], fontSize: 12 }}>{a.symbol}</span>
                    <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{(a.weight * 100).toFixed(1)}%</span>
                    <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: a.annReturn >= 0 ? '#4E6040' : '#b04848' }}>
                      {a.annReturn >= 0 ? '+' : ''}{a.annReturn.toFixed(2)}%
                    </span>
                    <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{a.annVol.toFixed(2)}%</span>
                    {/* Risk contrib bar */}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                        width: `${Math.min(rc * 100, 100)}%`, height: 14,
                        background: CHART_COLORS[i % CHART_COLORS.length],
                        opacity: 0.2, borderRadius: 2,
                      }} />
                      <span style={{ position: 'relative', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {(rc * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 3 — Correlation matrix */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <h2 className="ds-heading" style={{ margin: '0 0 10px' }}>Return Correlation Matrix</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: 11 }}>
                <thead>
                  <tr>
                    <td style={{ width: 44 }} />
                    {result.assets.map(a => (
                      <td key={a.symbol} style={{ padding: '3px 6px', textAlign: 'center', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                        {a.symbol.slice(0, 5)}
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.assets.map((rowAsset, i) => (
                    <tr key={rowAsset.symbol}>
                      <td style={{ padding: '3px 6px', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {rowAsset.symbol.slice(0, 5)}
                      </td>
                      {result.assets.map((_, j) => {
                        const r = result.corrMatrix[i][j];
                        return (
                          <td
                            key={j}
                            title={`${result.assets[i].symbol} / ${result.assets[j].symbol}: ${r.toFixed(3)}`}
                            style={{
                              padding: '5px 8px',
                              borderRadius: 4,
                              background: corrColor(r, i === j),
                              textAlign: 'center',
                              fontVariantNumeric: 'tabular-nums',
                              fontWeight: i === j ? 700 : 400,
                              color: 'var(--foreground)',
                              minWidth: 44,
                            }}
                          >
                            {r.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              {[
                { color: 'rgba(193,95,60,0.65)', label: 'High +corr (>0.7)' },
                { color: 'rgba(193,95,60,0.35)', label: 'Mod +corr' },
                { color: 'transparent', label: 'Uncorrelated', border: '1px solid var(--border)' },
                { color: 'rgba(106,155,204,0.38)', label: 'Mod −corr' },
                { color: 'rgba(106,155,204,0.65)', label: 'High −corr (<−0.7)' },
              ].map(({ color, label, border }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, background: color, border: border ?? 'none', flexShrink: 0 }} />
                  <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Section 4 — Risk contribution bar chart */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <h2 className="ds-heading" style={{ margin: '0 0 10px' }}>Risk Contribution</h2>
            <ResponsiveContainer width="100%" height={Math.max(160, result.assets.length * 36)}>
              <BarChart
                layout="vertical"
                data={result.assets.map((a, i) => ({ symbol: a.symbol, contrib: +((result.riskContribs[i] ?? 0) * 100).toFixed(2), color: CHART_COLORS[i % CHART_COLORS.length] }))}
                margin={{ top: 4, right: 40, left: 20, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="symbol" tick={{ fontSize: 11, fill: 'var(--foreground)', fontWeight: 600 }} tickLine={false} axisLine={false} width={48} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, 'Risk Contrib']} contentStyle={tooltipStyle} />
                <Bar dataKey="contrib" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, formatter: (v: number) => `${v.toFixed(1)}%` }}>
                  {result.assets.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="ds-caption" style={{ margin: '8px 0 0', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
              Marginal risk contribution to portfolio variance.
            </p>
          </section>

          {/* Section 5 — Portfolio equity curve */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <h2 className="ds-heading" style={{ margin: '0 0 10px' }}>Portfolio Equity Curve (normalized)</h2>
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={result.portCurve.map((v, i) => ({ i, v }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="i" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={48} tickFormatter={v => v.toFixed(2)} />
                <Tooltip formatter={(v: number) => [v.toFixed(4), 'Portfolio']} labelFormatter={l => `Bar ${l}`} contentStyle={tooltipStyle} />
                <ReferenceLine y={1} stroke="var(--muted-foreground)" strokeDasharray="4 3" />
                <Line type="monotone" dataKey="v" stroke="var(--chart-1)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </section>
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
});

const runBtnStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 16px', borderRadius: 6, border: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
  background: disabled ? 'var(--muted)' : 'var(--primary)',
  color: disabled ? 'var(--muted-foreground)' : '#fff',
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
