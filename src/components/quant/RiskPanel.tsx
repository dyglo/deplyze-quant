import React, { useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Play, Loader2, Copy, Check, AlertTriangle } from 'lucide-react';

import {
  closes, logReturns, annualisedVol, maxDrawdown, stdev,
  downsideDeviation, historicalVaR, parametricVaR, sharpeRatio,
  sortinoRatio, calmarRatio, equityCurve,
} from '../../lib/quant';
import { STRESS_PRESETS, applyShock, fmtShock } from '../../lib/stressScenarios';
import { fetchOHLCV } from '../../services/marketService';
import type { OHLCVBar, Timeframe } from '../../types';

import { StatTile } from './StatTile';
import { FreshnessBadge } from './FreshnessBadge';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RiskResult {
  symbol: string;
  timeframe: Timeframe;
  fetchedAt: number;
  bars: OHLCVBar[];
  annVol: number;
  histVol30: number;
  mdd: number;
  downsideDev: number;
  hVar95: number;
  hVar99: number;
  pVar95: number;
  pVar99: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  annReturn: number;
  curve: number[];
  currentPrice: number;
}

interface RiskPanelProps {
  defaultSymbol?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMEFRAMES: Timeframe[] = ['1day', '1week', '1month'];
const TF_LABEL: Record<Timeframe, string> = {
  '1min': '1m', '5min': '5m', '15min': '15m', '30min': '30m',
  '1h': '1H', '4h': '4H', '1day': '1D', '1week': '1W', '1month': '1M',
};
const SIZE_MAP: Partial<Record<Timeframe, number>> = {
  '1day': 250, '1week': 200, '1month': 120,
};
const PPY_MAP: Partial<Record<Timeframe, number>> = {
  '1day': 252, '1week': 52, '1month': 12,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return isFinite(n) ? n.toFixed(decimals) : '—';
}
function fmtPct(n: number, decimals = 2): string {
  return isFinite(n) ? `${n.toFixed(decimals)}%` : '—';
}
function fmtRatio(n: number): string {
  if (!isFinite(n)) return '—';
  if (Math.abs(n) > 999) return n > 0 ? '>999' : '<-999';
  return n.toFixed(2);
}

// ─── Component ───────────────────────────────────────────────────────────────

export const RiskPanel: React.FC<RiskPanelProps> = ({ defaultSymbol = 'SPY' }) => {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [timeframe, setTimeframe] = useState<Timeframe>('1day');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RiskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = useCallback(async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setRunning(true);
    setError(null);
    try {
      const outputsize = SIZE_MAP[timeframe] ?? 200;
      const { bars } = await fetchOHLCV(sym, timeframe, outputsize);
      if (bars.length < 5) throw new Error(`Only ${bars.length} bars returned for ${sym}. Check the symbol.`);

      const cs = closes(bars);
      const lr = logReturns(cs);
      const ppy = PPY_MAP[timeframe] ?? 252;

      const annVol = annualisedVol(lr, ppy) * 100;
      const histVol30 = lr.length >= 30
        ? stdev(lr.slice(-30)) * Math.sqrt(ppy) * 100
        : 0;
      const { mdd } = maxDrawdown(equityCurve(lr));
      const dd = downsideDeviation(lr);
      const downsideDev = dd * Math.sqrt(ppy) * 100;
      const hVar95 = historicalVaR(lr, 0.95) * 100;
      const hVar99 = historicalVaR(lr, 0.99) * 100;
      const pVar95 = parametricVaR(lr, 0.95) * 100;
      const pVar99 = parametricVaR(lr, 0.99) * 100;
      const sharpe = sharpeRatio(lr, 0, ppy);
      const sortino = sortinoRatio(lr, 0, ppy);
      const lrSum = lr.reduce((a, b) => a + b, 0);
      const annReturn = (Math.exp((lrSum / lr.length) * ppy) - 1) * 100;
      const calmar = calmarRatio(annReturn / 100, mdd);
      const curve = equityCurve(lr);
      const currentPrice = cs[cs.length - 1];

      setResult({
        symbol: sym,
        timeframe,
        fetchedAt: Date.now(),
        bars,
        annVol, histVol30, mdd: mdd * 100, downsideDev,
        hVar95, hVar99, pVar95, pVar99,
        sharpe, sortino, calmar, annReturn,
        curve, currentPrice,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [symbol, timeframe]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') run();
  }, [run]);

  const copyJSON = useCallback(() => {
    if (!result) return;
    const payload = {
      symbol: result.symbol,
      timeframe: result.timeframe,
      fetchedAt: new Date(result.fetchedAt).toISOString(),
      annVol: +result.annVol.toFixed(4),
      histVol30: +result.histVol30.toFixed(4),
      maxDrawdown: +result.mdd.toFixed(4),
      downsideDeviation: +result.downsideDev.toFixed(4),
      historicalVaR95: +result.hVar95.toFixed(4),
      historicalVaR99: +result.hVar99.toFixed(4),
      parametricVaR95: +result.pVar95.toFixed(4),
      parametricVaR99: +result.pVar99.toFixed(4),
      sharpe: +result.sharpe.toFixed(4),
      sortino: +result.sortino.toFixed(4),
      calmar: +result.calmar.toFixed(4),
      annReturn: +result.annReturn.toFixed(4),
      currentPrice: result.currentPrice,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  const hasInsufficient = result && result.bars.length < 30;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 4px' }}>

      {/* Controls */}
      <section
        className="ds-surface"
        style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
            alignItems: 'end',
          }}
        >
          {/* Symbol input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Symbol</span>
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. SPY"
              style={{
                padding: '6px 8px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--card)',
                color: 'var(--foreground)',
                fontSize: 13,
              }}
            />
          </div>

          {/* Timeframe toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Timeframe</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    background: timeframe === tf ? 'var(--primary)' : 'var(--card)',
                    color: timeframe === tf ? '#fff' : 'var(--foreground)',
                    transition: 'background 0.15s',
                  }}
                >
                  {TF_LABEL[tf]}
                </button>
              ))}
            </div>
          </div>

          {/* Run button */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <button
              onClick={run}
              disabled={running || !symbol.trim()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                borderRadius: 6,
                border: 'none',
                cursor: running || !symbol.trim() ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                background: running || !symbol.trim() ? 'var(--muted)' : 'var(--primary)',
                color: running || !symbol.trim() ? 'var(--muted-foreground)' : '#fff',
                transition: 'background 0.15s',
              }}
            >
              {running
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : <Play size={14} />}
              {running ? 'Running…' : 'Run'}
            </button>
          </div>
        </div>
      </section>

      {/* Error state */}
      {error && (
        <section
          className="ds-surface"
          style={{
            padding: 14, borderRadius: 10, marginBottom: 16,
            border: '1px solid rgba(176,72,72,0.4)',
            background: 'rgba(176,72,72,0.07)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <AlertTriangle size={16} style={{ color: '#b04848', flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <span className="ds-label" style={{ color: '#b04848' }}>Error</span>
              <p className="ds-caption" style={{ margin: '4px 0 8px', color: 'var(--foreground)' }}>{error}</p>
              <button
                onClick={run}
                style={{
                  padding: '5px 12px', borderRadius: 6, border: '1px solid #b04848',
                  background: 'transparent', color: '#b04848', fontSize: 12,
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Insufficient data warning */}
      {hasInsufficient && (
        <section
          className="ds-surface"
          style={{
            padding: 12, borderRadius: 10, marginBottom: 16,
            border: '1px solid rgba(193,95,60,0.35)',
            background: 'rgba(193,95,60,0.06)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <AlertTriangle size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <span className="ds-caption" style={{ color: 'var(--foreground)' }}>
            Only {result.bars.length} bars loaded — some metrics (30-bar vol, VaR) need at least 30 bars and may show 0 or be unreliable.
          </span>
        </section>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Result header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="ds-heading" style={{ margin: 0 }}>{result.symbol}</span>
              <FreshnessBadge status="live" fetchedAt={result.fetchedAt} />
            </div>
            <button
              onClick={copyJSON}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--card)',
                color: 'var(--foreground)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {copied ? <Check size={12} style={{ color: '#4E6040' }} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy JSON'}
            </button>
          </div>

          {/* Section 1 — Stats grid */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <h2 className="ds-heading" style={{ margin: '0 0 10px' }}>Risk Metrics</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <StatTile
                label="Ann. Volatility"
                value={fmtPct(result.annVol)}
                hint="1-yr annualised stdev"
              />
              <StatTile
                label="30-bar Hist. Vol"
                value={result.histVol30 > 0 ? fmtPct(result.histVol30) : '—'}
                hint="Trailing 30-bar realised vol"
              />
              <StatTile
                label="Max Drawdown"
                value={result.mdd > 0 ? `-${fmtPct(result.mdd)}` : '—'}
                delta={result.mdd > 0 ? -result.mdd : undefined}
                hint="Peak-to-trough equity loss"
              />
              <StatTile
                label="Downside Dev"
                value={result.downsideDev > 0 ? fmtPct(result.downsideDev) : '—'}
                hint="Annualised semi-stdev (below 0)"
              />
              <StatTile
                label="Sharpe"
                value={fmtRatio(result.sharpe)}
                delta={isFinite(result.sharpe) ? result.sharpe * 10 : undefined}
                hint="Ann. excess return / vol"
              />
              <StatTile
                label="Sortino"
                value={fmtRatio(result.sortino)}
                delta={isFinite(result.sortino) ? result.sortino * 10 : undefined}
                hint="Ann. return / downside dev"
              />
              <StatTile
                label="Calmar"
                value={fmtRatio(result.calmar)}
                delta={isFinite(result.calmar) ? result.calmar * 10 : undefined}
                hint="Ann. return / max drawdown"
              />
              <StatTile
                label="Ann. Return"
                value={fmtPct(result.annReturn)}
                delta={isFinite(result.annReturn) ? result.annReturn : undefined}
                hint="Geometric annualised return"
              />
            </div>
          </section>

          {/* Section 2 — VaR */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <h2 className="ds-heading" style={{ margin: '0 0 10px' }}>Value at Risk</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <StatTile
                label="Hist. VaR 95%"
                value={result.hVar95 > 0 ? fmtPct(result.hVar95) : '—'}
                delta={result.hVar95 > 0 ? -result.hVar95 : undefined}
                hint="1-period loss at 95% CI"
              />
              <StatTile
                label="Hist. VaR 99%"
                value={result.hVar99 > 0 ? fmtPct(result.hVar99) : '—'}
                delta={result.hVar99 > 0 ? -result.hVar99 : undefined}
                hint="1-period loss at 99% CI"
              />
              <StatTile
                label="Param. VaR 95%"
                value={result.pVar95 > 0 ? fmtPct(result.pVar95) : '—'}
                delta={result.pVar95 > 0 ? -result.pVar95 : undefined}
                hint="Normal dist. VaR at 95% CI"
              />
              <StatTile
                label="Param. VaR 99%"
                value={result.pVar99 > 0 ? fmtPct(result.pVar99) : '—'}
                delta={result.pVar99 > 0 ? -result.pVar99 : undefined}
                hint="Normal dist. VaR at 99% CI"
              />
            </div>
          </section>

          {/* Section 3 — Equity curve */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <h2 className="ds-heading" style={{ margin: '0 0 10px' }}>Equity Curve (normalized)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={result.curve.map((v, i) => ({ i, v }))}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="i"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  dataKey="v"
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={v => v.toFixed(2)}
                />
                <Tooltip
                  formatter={(val: number) => [val.toFixed(4), 'Value']}
                  labelFormatter={l => `Bar ${l}`}
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                />
                <ReferenceLine y={1} stroke="var(--muted-foreground)" strokeDasharray="4 3" />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="var(--chart-1)"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </section>

          {/* Section 4 — Stress scenarios */}
          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <h2 className="ds-heading" style={{ margin: '0 0 10px' }}>Historical Stress Test</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Scenario', 'Period', 'Equity Shock', 'Shocked Price', '$ Change'].map(h => (
                      <th
                        key={h}
                        className="ds-caption"
                        style={{
                          padding: '6px 8px',
                          textAlign: 'left',
                          color: 'var(--muted-foreground)',
                          borderBottom: '1px solid var(--border)',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STRESS_PRESETS.map(scenario => {
                    const shock = scenario.shocks.equity;
                    const { shocked, change } = applyShock(result.currentPrice, shock);
                    const isNeg = shock < 0;
                    const isPos = shock > 0;
                    const shockBg = isNeg
                      ? 'rgba(176,72,72,0.10)'
                      : isPos
                        ? 'rgba(78,96,64,0.10)'
                        : 'transparent';
                    const shockFg = isNeg ? '#b04848' : isPos ? '#4E6040' : 'var(--foreground)';
                    return (
                      <tr
                        key={scenario.id}
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        <td style={{ padding: '7px 8px', fontWeight: 600, color: 'var(--foreground)' }}>
                          {scenario.label}
                        </td>
                        <td style={{ padding: '7px 8px', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                          {scenario.period}
                        </td>
                        <td
                          style={{
                            padding: '7px 8px',
                            color: shockFg,
                            background: shockBg,
                            fontWeight: 700,
                            borderRadius: 4,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {fmtShock(shock)}
                        </td>
                        <td style={{ padding: '7px 8px', color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>
                          {shocked.toFixed(2)}
                        </td>
                        <td
                          style={{
                            padding: '7px 8px',
                            color: change < 0 ? '#b04848' : change > 0 ? '#4E6040' : 'var(--foreground)',
                            fontVariantNumeric: 'tabular-nums',
                            fontWeight: 600,
                          }}
                        >
                          {change >= 0 ? '+' : ''}{change.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p
              className="ds-caption"
              style={{ margin: '10px 0 0', color: 'var(--muted-foreground)', fontStyle: 'italic' }}
            >
              Equity-proxy shocks applied to last close. Illustrative only — not predictions.
            </p>
          </section>
        </>
      )}

      {/* Spin keyframe (inline) */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
