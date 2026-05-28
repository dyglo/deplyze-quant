import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ComposedChart, Area, Line, Bar, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer, Tooltip, ReferenceLine,
} from 'recharts';
import { Loader2, BarChart2, LineChart, Plus, Lock } from 'lucide-react';
import { useOHLCV } from '../../hooks/useMarket';
import { useAnalystRatings } from '../../hooks/useAnalystRatings';
import { useMacroSeries } from '../../hooks/useMacro';
import { closes } from '../../lib/quant';
import {
  rsi, macd, stochastic, bollingerBands, williamsR,
  smaSignals, emaSignals, summariseSignals,
  type TechSignal, type TechnicalSummary,
} from '../../lib/quant/technicals';

type TFKey = '1' | '5' | '15' | '30' | '1H' | '5H' | '1D' | '1W' | '1M';
const TF_SIZES: Record<TFKey, number> = {
  '1': 1, '5': 5, '15': 15, '30': 30,
  '1H': 21, '5H': 63, '1D': 252, '1W': 504, '1M': 756,
};
const TF_LABELS: TFKey[] = ['1', '5', '15', '30', '1H', '5H', '1D', '1W', '1M'];

interface BBPoint { upper: number | null; middle: number | null; lower: number | null; }

function computeBollingerBands(cs: number[], period = 20, multiplier = 2): BBPoint[] {
  return cs.map((_, i) => {
    if (i < period - 1) return { upper: null, middle: null, lower: null };
    const slice = cs.slice(i - period + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b - avg) ** 2, 0) / period);
    return { upper: avg + multiplier * sd, middle: avg, lower: avg - multiplier * sd };
  });
}

function fmtPrice(v: number) {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Maps TechnicalSummary overall → needle rotation angle (-90=strong sell, 0=neutral, +90=strong buy)
function summaryToAngle(summary: TechnicalSummary): number {
  const total = summary.buy + summary.neutral + summary.sell || 1;
  // Net score from -1 (all sell) to +1 (all buy)
  const net = (summary.buy - summary.sell) / total;
  return net * 85; // max ±85°
}

const SIGNAL_COLOR: Record<TechSignal, string> = {
  buy: 'var(--ds-gain)',
  neutral: 'var(--muted-foreground)',
  sell: 'var(--ds-loss)',
};

// ─── Signal5 gauge helpers ─────────────────────────────────────────────────
type Signal5 = 'strong_sell' | 'sell' | 'neutral' | 'buy' | 'strong_buy';

function toSignal5(s: TechnicalSummary): Signal5 {
  const total = s.buy + s.neutral + s.sell || 1;
  const bp = s.buy / total, sp = s.sell / total;
  if (bp >= 0.6) return 'strong_buy';
  if (bp >= 0.4) return 'buy';
  if (sp >= 0.6) return 'strong_sell';
  if (sp >= 0.4) return 'sell';
  return 'neutral';
}

const S5_COLOR: Record<Signal5, string> = {
  strong_sell: '#ef4444', sell: '#f97316', neutral: '#94a3b8', buy: '#84cc16', strong_buy: '#22c55e',
};
const S5_LABEL: Record<Signal5, string> = {
  strong_sell: 'Strong Sell', sell: 'Sell', neutral: 'Neutral', buy: 'Buy', strong_buy: 'Strong Buy',
};
const S5_BG: Record<Signal5, string> = {
  strong_sell: 'rgba(239,68,68,0.12)', sell: 'rgba(249,115,22,0.12)', neutral: 'rgba(148,163,184,0.12)',
  buy: 'rgba(132,204,18,0.12)', strong_buy: 'rgba(34,197,94,0.12)',
};

// Gauge arc: math-convention angles (0°=right, 90°=top, 180°=left), sweep=0=CCW=upward
function gaugeSegArc(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = (cx + r * Math.cos(rad(a1))).toFixed(2);
  const y1 = (cy - r * Math.sin(rad(a1))).toFixed(2);
  const x2 = (cx + r * Math.cos(rad(a2))).toFixed(2);
  const y2 = (cy - r * Math.sin(rad(a2))).toFixed(2);
  return `M ${x1} ${y1} A ${r} ${r} 0 0 0 ${x2} ${y2}`;
}

interface Props { symbol: string; earningsDates?: string[]; }

export const InstrumentAdvancedChart: React.FC<Props> = ({ symbol, earningsDates = [] }) => {
  const [tf, setTf] = useState<TFKey>('1D');
  const [showBB, setShowBB] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareSymbol, setCompareSymbol] = useState<'SPY' | 'QQQ'>('SPY');
  const [showMacro, setShowMacro] = useState(false);
  const [macroId, setMacroId] = useState<string>('FEDFUNDS');
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');

  // Price data
  const ohlcv = useOHLCV(symbol, '1day', TF_SIZES[tf]);
  const bars = ohlcv.data?.bars ?? [];
  const benchOhlcv = useOHLCV(showCompare ? compareSymbol : null, '1day', TF_SIZES[tf]);
  const benchBars = benchOhlcv.data?.bars ?? [];
  const macro = useMacroSeries(showMacro ? macroId : null);
  const macroPoints = macro.data?.points ?? [];

  // Always use 252 bars for technicals (independent of TF selector)
  const techOhlcv = useOHLCV(symbol, '1day', 252);
  const techBars = techOhlcv.data?.bars ?? [];

  // Analyst ratings
  const analystRatings = useAnalystRatings(symbol);
  const ratings = analystRatings.data;

  // Compute technical summary from real indicators
  const techSummary = useMemo((): TechnicalSummary | null => {
    const cs = closes(techBars);
    if (cs.length < 30) return null;
    const smaRows = smaSignals(cs, [20, 50, 100, 200]);
    const emaRows = emaSignals(cs, [10, 20, 50]);
    const rsiResult = rsi(cs, 14);
    const macdResult = macd(cs);
    const stochResult = stochastic(techBars, 14, 3);
    const bbResult = bollingerBands(cs, 20, 2);
    const wrResult = williamsR(techBars, 14);
    const allSignals: TechSignal[] = [
      ...smaRows.map(r => r.signal),
      ...emaRows.map(r => r.signal),
      ...(rsiResult ? [rsiResult.signal] : []),
      ...(macdResult ? [macdResult.crossSignal] : []),
      ...(stochResult ? [stochResult.signal] : []),
      ...(bbResult ? [bbResult.signal] : []),
      ...(wrResult ? [wrResult.signal] : []),
    ];
    return summariseSignals(allSignals);
  }, [techBars]);

  // Analyst consensus
  const analystConsensus = useMemo(() => {
    const rec = ratings?.recommendations;
    if (!rec) return null;
    const total = rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell;
    if (!total) return null;
    const score = (rec.strongBuy * 5 + rec.buy * 4 + rec.hold * 3 + rec.sell * 2 + rec.strongSell * 1) / total;
    const label = score >= 4.5 ? 'Strong Buy' : score >= 3.5 ? 'Buy' : score >= 2.5 ? 'Hold' : score >= 1.5 ? 'Sell' : 'Strong Sell';
    const isPositive = score >= 3.5;
    return { label, isPositive, score };
  }, [ratings]);

  const priceTarget = ratings?.priceTargets;

  // Chart data
  const chartData = useMemo(() => {
    if (!bars.length) return [];
    const closesList = bars.map(b => b.close);
    const bbPoints = computeBollingerBands(closesList);
    const benchMap = new Map(benchBars.map(b => [b.ts, b.close] as const));
    let firstAssetClose = 1, firstBenchClose = 1;
    if (showCompare && benchBars.length) {
      for (const bar of bars) {
        const bClose = benchMap.get(bar.ts);
        if (bClose != null) { firstAssetClose = bar.close; firstBenchClose = bClose; break; }
      }
    }
    return bars.map((b, i) => {
      const dateLabel = new Date(b.ts).toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
      const bb = bbPoints[i];
      const bClose = benchMap.get(b.ts);
      let macroVal: number | null = null;
      if (showMacro && macroPoints.length) {
        let best = macroPoints[0], minDiff = Math.abs(b.ts - best.ts);
        for (const pt of macroPoints) { const d = Math.abs(b.ts - pt.ts); if (d < minDiff) { minDiff = d; best = pt; } }
        if (minDiff < 45 * 86400000) macroVal = best.value;
      }
      const barDateStr = new Date(b.ts).toISOString().slice(0, 10);
      const isEarnings = earningsDates.some(d => d.slice(0, 10) === barDateStr);
      return {
        ts: b.ts, date: dateLabel, close: b.close, volume: b.volume,
        bbUpper: bb?.upper ?? null, bbLower: bb?.lower ?? null, bbMiddle: bb?.middle ?? null,
        assetRebased: showCompare && bClose != null ? (b.close / firstAssetClose) * 100 : null,
        benchRebased: showCompare && bClose != null ? (bClose / firstBenchClose) * 100 : null,
        macroVal, isEarnings,
      };
    });
  }, [bars, benchBars, showCompare, showMacro, macroPoints, earningsDates]);

  const isLoading = ohlcv.loading || (showCompare && benchOhlcv.loading) || (showMacro && macro.loading);
  const isUp = bars.length > 1 && bars[bars.length - 1].close >= bars[0].close;
  const strokeColor = isUp ? 'var(--ds-gain)' : 'var(--ds-loss)';
  const areaGradientId = `chartGrad_${symbol}`.replace(/[^a-zA-Z0-9]/g, '_');
  const lastClose = bars.length ? bars[bars.length - 1].close : null;

  // Gauge needle angle from real technical summary
  const needleAngle = techSummary ? summaryToAngle(techSummary) : 0;
  const techOverall = techSummary?.overall ?? 'neutral';
  const gaugeSignal5 = techSummary ? toSignal5(techSummary) : null;

  // Upside calculation
  const currentPrice = lastClose;
  const avgTarget = priceTarget?.avg;
  const upside = currentPrice && avgTarget ? ((avgTarget - currentPrice) / currentPrice) * 100 : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12, marginBottom: 28, alignItems: 'start' }}>

      {/* ── LEFT: chart panel ── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--card)', minWidth: 0 }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 4 }}>
          {/* Chart type toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 8 }}>
            <button onClick={() => setChartType('bar')} title="Bar chart"
              style={{ padding: '3px 6px', borderRadius: 4, border: 'none', cursor: 'pointer', background: chartType === 'bar' ? 'var(--secondary)' : 'transparent', color: chartType === 'bar' ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
              <BarChart2 size={14} />
            </button>
            <button onClick={() => setChartType('area')} title="Area chart"
              style={{ padding: '3px 6px', borderRadius: 4, border: 'none', cursor: 'pointer', background: chartType === 'area' ? 'var(--secondary)' : 'transparent', color: chartType === 'area' ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
              <LineChart size={14} />
            </button>
          </div>

          {/* Compare */}
          <button onClick={() => setShowCompare(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', border: '1px solid var(--border)', borderRadius: 4, background: showCompare ? 'var(--secondary)' : 'transparent', fontSize: 11.5, fontWeight: 600, color: 'var(--foreground)', cursor: 'pointer', marginRight: 4 }}>
            <Plus size={11} /> Compare
          </button>
          {showCompare && (
            <select value={compareSymbol} onChange={e => setCompareSymbol(e.target.value as 'SPY' | 'QQQ')}
              style={{ fontSize: 10, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 3, background: 'var(--card)', color: 'var(--foreground)', marginRight: 8 }}>
              <option value="SPY">SPY</option>
              <option value="QQQ">QQQ</option>
            </select>
          )}

          {/* Timeframes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {TF_LABELS.map(t => (
              <button key={t} onClick={() => setTf(t)}
                style={{ padding: '3px 7px', fontSize: 11.5, fontWeight: tf === t ? 700 : 500, background: 'transparent', border: 'none', borderBottom: tf === t ? '2px solid var(--primary)' : '2px solid transparent', color: tf === t ? 'var(--primary)' : 'var(--muted-foreground)', cursor: 'pointer' }}>
                {t}
              </button>
            ))}
          </div>

          {/* Overlays on right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', fontSize: 11, color: 'var(--muted-foreground)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
              <input type="checkbox" checked={showBB} onChange={e => setShowBB(e.target.checked)} style={{ width: 11, height: 11 }} />
              Bollinger Bands
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
              <input type="checkbox" checked={showMacro} onChange={e => setShowMacro(e.target.checked)} style={{ width: 11, height: 11 }} />
              Macro FRED
            </label>
            {showMacro && (
              <select value={macroId} onChange={e => setMacroId(e.target.value)}
                style={{ fontSize: 10, padding: '1px 4px', border: '1px solid var(--border)', borderRadius: 3, background: 'var(--card)', color: 'var(--foreground)' }}>
                <option value="FEDFUNDS">Fed Funds Rate</option>
                <option value="CPIAUCSL">CPI Inflation</option>
                <option value="GDPC1">Real GDP Growth</option>
                <option value="UNRATE">Unemployment</option>
              </select>
            )}
            {isLoading && <Loader2 size={12} className="animate-spin" style={{ color: 'var(--primary)' }} />}
            <span style={{ color: 'var(--muted-foreground)', fontSize: 11, cursor: 'default' }}>Technical Ch… »</span>
          </div>
        </div>

        {/* Symbol + price + AI link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px 4px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>{symbol} Corporation</span>
          {lastClose != null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: isUp ? 'var(--ds-gain)' : 'var(--ds-loss)', display: 'flex', alignItems: 'center', gap: 3 }}>
              {isUp
                ? <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M4 1L8 7H0Z" /></svg>
                : <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M4 7L0 1H8Z" /></svg>
              }
              {fmtPrice(lastClose)}
            </span>
          )}
          <Link to={`/copilot?symbol=${symbol}&mode=chart`}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', border: '1px solid var(--primary)', borderRadius: 4, background: 'transparent', fontSize: 10.5, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
            AI Analyze chart
          </Link>
        </div>

        {/* Main price chart */}
        <div style={{ width: '100%', height: 260, padding: '0 4px' }}>
          {ohlcv.loading && !bars.length ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
              <Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} />
              Loading price series…
            </div>
          ) : chartData.length > 1 ? (
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 8, right: 56, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokeColor} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={9} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis yAxisId="price" orientation="right" stroke="var(--muted-foreground)" fontSize={9} tickLine={false} axisLine={false}
                  domain={showCompare ? [80, 'auto'] : ['auto', 'auto']}
                  tickFormatter={v => showCompare ? `${v.toFixed(0)}` : `${v.toFixed(2)}`} width={52} />
                {showMacro && <YAxis yAxisId="macro" orientation="left" stroke="var(--primary)" fontSize={9} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={v => `${v}%`} width={32} />}
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                  labelStyle={{ color: 'var(--muted-foreground)', fontSize: 10, fontWeight: 600 }}
                  formatter={(value: number, name: string) => {
                    if (name === 'assetRebased') return [`${value.toFixed(1)}%`, symbol];
                    if (name === 'benchRebased') return [`${value.toFixed(1)}%`, compareSymbol];
                    if (name === 'macroVal') return [`${value.toFixed(2)}%`, macroId];
                    if (name === 'close') return [`$${fmtPrice(value)}`, symbol];
                    if (name === 'bbUpper') return [`$${fmtPrice(value)}`, 'BB Upper'];
                    if (name === 'bbLower') return [`$${fmtPrice(value)}`, 'BB Lower'];
                    if (name === 'bbMiddle') return [`$${fmtPrice(value)}`, 'BB Basis'];
                    return [value, name];
                  }}
                />
                {lastClose != null && (
                  <ReferenceLine yAxisId="price" y={lastClose} stroke="var(--foreground)" strokeWidth={1} strokeDasharray="3 3"
                    label={{ value: fmtPrice(lastClose), position: 'right', fill: 'var(--background)', fontSize: 9, fontWeight: 700, dx: 2 }}
                  />
                )}
                {showBB && <Area yAxisId="price" dataKey="bbUpper" stroke="transparent" fill="rgba(177,173,161,0.08)" dot={false} />}
                {showBB && <Area yAxisId="price" dataKey="bbLower" stroke="transparent" fill="transparent" dot={false} />}
                {!showCompare ? (
                  <Area yAxisId="price" type="monotone" dataKey="close" name="close" stroke={strokeColor} strokeWidth={1.5} fill={`url(#${areaGradientId})`} dot={false} />
                ) : (
                  <>
                    <Line yAxisId="price" type="monotone" dataKey="assetRebased" name="assetRebased" stroke="var(--foreground)" strokeWidth={1.8} dot={false} />
                    <Line yAxisId="price" type="monotone" dataKey="benchRebased" name="benchRebased" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  </>
                )}
                {showBB && <Line yAxisId="price" type="monotone" dataKey="bbMiddle" name="bbMiddle" stroke="var(--muted-foreground)" strokeWidth={0.8} strokeDasharray="3 3" dot={false} />}
                {showMacro && <Line yAxisId="macro" type="monotone" dataKey="macroVal" name="macroVal" stroke="var(--primary)" strokeWidth={1.5} dot={false} />}
                {chartData.map((d, idx) => d.isEarnings ? (
                  <ReferenceLine key={`earn-${idx}`} yAxisId="price" x={d.date} stroke="var(--primary)" strokeWidth={1} strokeDasharray="2 2"
                    label={{ value: 'D', position: 'insideTopLeft', fill: 'var(--muted-foreground)', fontSize: 8 }} />
                ) : null)}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
              No price history available.
            </div>
          )}
        </div>

        {/* Volume bars */}
        <div style={{ width: '100%', height: 56, padding: '0 4px' }}>
          {chartData.length > 1 && (
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 0, right: 56, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <YAxis yAxisId="vol" orientation="right" hide width={52} />
                <Bar yAxisId="vol" dataKey="volume" fill="var(--muted-foreground)" opacity={0.35} radius={[1, 1, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Date footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 60px 8px 12px', fontSize: 9, color: 'var(--muted-foreground)' }}>
          {chartData.length > 0 && <>
            <span>{chartData[0]?.date}</span>
            <span>{chartData[Math.floor(chartData.length / 4)]?.date}</span>
            <span>{chartData[Math.floor(chartData.length / 2)]?.date}</span>
            <span>{chartData[Math.floor(chartData.length * 3 / 4)]?.date}</span>
            <span>{chartData[chartData.length - 1]?.date}</span>
          </>}
        </div>
      </div>

      {/* ── RIGHT: Scorecard panel ── */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--card)' }}>

        {/* Header */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>{symbol} Scorecard</span>
        </div>

        {/* Company's Health — uses fundamentals availability as signal */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>Company's Health</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>
              <Lock size={9} /> Unlock
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'linear-gradient(to right, #ef4444 0%, #f97316 25%, #eab308 50%, #84cc16 75%, #22c55e 100%)' }} />
        </div>

        {/* Fair Value */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>Fair Value</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <Lock size={9} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 10.5, color: 'var(--primary)', fontWeight: 500 }}>Unlock Price</span>
          </div>
          {['Fair Price', 'Upside'].map(label => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 3 }}>
              <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)' }}>{label}</span>
              <Lock size={9} style={{ color: 'var(--muted-foreground)' }} />
            </div>
          ))}
        </div>

        {/* Technical Analysis — speedometer gauge */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>Technical Analysis</span>
          </div>
          {techSummary && gaugeSignal5 ? (() => {
            const sigColor = S5_COLOR[gaugeSignal5];
            const sigBg    = S5_BG[gaugeSignal5];
            // Dimensions to fill the 220px panel (24px total padding → ~192px usable)
            const W = 192, H = 112, GCX = 96, GCY = 102, GR = 82, GSW = 11;
            const rad = (d: number) => (d * Math.PI) / 180;
            // needleAngle: -85=strong sell, 0=neutral, +85=strong buy → math angle 90-x
            const mathAngle = 90 - needleAngle;
            const nLen = GR - GSW / 2 - 4;
            const nx = (GCX + nLen * Math.cos(rad(mathAngle))).toFixed(2);
            const ny = (GCY - nLen * Math.sin(rad(mathAngle))).toFixed(2);
            const segs = [
              { a1: 180, a2: 144, c: '#ef4444' },
              { a1: 144, a2: 108, c: '#f97316' },
              { a1: 108, a2:  72, c: '#94a3b8' },
              { a1:  72, a2:  36, c: '#84cc16' },
              { a1:  36, a2:   0, c: '#22c55e' },
            ];
            const ticks = [180, 144, 108, 72, 36, 0];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
                  {/* Background track — two 90° arcs */}
                  <path
                    d={`M ${GCX - GR} ${GCY} A ${GR} ${GR} 0 0 0 ${GCX} ${GCY - GR} A ${GR} ${GR} 0 0 0 ${GCX + GR} ${GCY}`}
                    stroke="var(--border)" strokeWidth={GSW + 3} fill="none" strokeLinecap="butt"
                  />
                  {segs.map((s, i) => (
                    <path key={i} d={gaugeSegArc(GCX, GCY, GR, s.a1, s.a2)} stroke={s.c} strokeWidth={GSW} fill="none" opacity={0.9} />
                  ))}
                  {ticks.map(angle => {
                    const inner = GR - GSW / 2 - 1, outer = GR + GSW / 2 + 1;
                    return (
                      <line key={angle}
                        x1={(GCX + inner * Math.cos(rad(angle))).toFixed(2)} y1={(GCY - inner * Math.sin(rad(angle))).toFixed(2)}
                        x2={(GCX + outer * Math.cos(rad(angle))).toFixed(2)} y2={(GCY - outer * Math.sin(rad(angle))).toFixed(2)}
                        stroke="var(--card)" strokeWidth={1.5}
                      />
                    );
                  })}
                  {/* Shadow + needle */}
                  <line x1={GCX} y1={GCY} x2={nx} y2={ny} stroke="rgba(0,0,0,0.18)" strokeWidth={3.5} strokeLinecap="round" />
                  <line x1={GCX} y1={GCY} x2={nx} y2={ny} stroke="var(--foreground)" strokeWidth={2.5} strokeLinecap="round" />
                  <circle cx={GCX} cy={GCY} r={5} fill="var(--card)" stroke="var(--foreground)" strokeWidth={2} />
                  <circle cx={nx} cy={ny} r={2.5} fill={sigColor} />
                </svg>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: sigColor, background: sigBg,
                  padding: '4px 18px', borderRadius: 6, letterSpacing: 0.2,
                }}>
                  {S5_LABEL[gaugeSignal5]}
                </span>
                <div style={{ fontSize: 9, color: 'var(--muted-foreground)', marginTop: -2 }}>
                  {techSummary.buy}B · {techSummary.neutral}N · {techSummary.sell}S
                </div>
              </div>
            );
          })() : (
            <div style={{ fontSize: 10.5, color: 'var(--muted-foreground)' }}>
              {techOhlcv.loading ? 'Computing…' : 'Insufficient data'}
            </div>
          )}
        </div>

        {/* Analysts Sentiment — real data */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>Analysts Sentiment</span>
          </div>
          {analystRatings.loading ? (
            <div style={{ fontSize: 10.5, color: 'var(--muted-foreground)' }}>Loading…</div>
          ) : analystConsensus ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: analystConsensus.isPositive ? 'var(--ds-gain)' : 'var(--ds-loss)', marginBottom: 6 }}>
                {analystConsensus.label}
              </div>
              {priceTarget?.avg != null && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 2 }}>
                    <span style={{ color: 'var(--muted-foreground)' }}>Price Target</span>
                    <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{fmtPrice(priceTarget.avg)}</span>
                  </div>
                  {upside != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5 }}>
                      <span style={{ color: 'var(--muted-foreground)' }}>Upside</span>
                      <span style={{ fontWeight: 600, color: upside >= 0 ? 'var(--ds-gain)' : 'var(--ds-loss)' }}>
                        {upside >= 0 ? '+' : ''}{upside.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div style={{ fontSize: 10.5, color: 'var(--muted-foreground)' }}>No analyst coverage</div>
          )}
        </div>

      </div>
    </div>
  );
};
