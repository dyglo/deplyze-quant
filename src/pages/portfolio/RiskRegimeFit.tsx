import React, { useState, useMemo, useEffect } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { ShieldAlert, Loader2, Activity, TrendingUp, AlertCircle } from 'lucide-react';
import { usePortfolioWorkspace } from '../../hooks/usePortfolioWorkspace';
import { usePortfolioIntelligence } from '../../hooks/usePortfolioIntelligence';
import { fetchOHLCV } from '../../services/marketService';
import { logReturns, cumulativeLogReturns, rebase100 } from '../../lib/quant/returns';
import { rollingAnnualisedVol, volatilityRegime } from '../../lib/quant/volatility';
import { rollingBeta } from '../../lib/quant/risk';
import { correlationMatrix } from '../../lib/quant/correlation';
import { portfolioReturnSeries } from '../../lib/quant/portfolio';
import type { OHLCVBar } from '../../types';
import { PortfolioIntelligencePanel } from '../../components/portfolio/PortfolioIntelligencePanel';

// ─── Helpers ─────────────────────��───────────────────────────────────────────

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtPct(v: number, sign = true): string {
  if (!isFinite(v)) return '—';
  const s = (v * 100).toFixed(2);
  return sign && v >= 0 ? `+${s}%` : `${s}%`;
}

// ─── Section Card ────────────────────────���─────────────────────────��──────────

const SectionCard: React.FC<{
  title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties;
}> = ({ title, subtitle, icon, children, style }) => (
  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', ...style }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 16px 10px', borderBottom: '1px solid var(--border)' }}>
      {icon && <div style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }}>{icon}</div>}
      <div>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>{title}</p>
        {subtitle && <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>{subtitle}</p>}
      </div>
    </div>
    <div style={{ padding: '14px 16px' }}>{children}</div>
  </div>
);

// ─── Regime Interpretation panel ─────────────────────���───────────────────────

const RegimePanel: React.FC<{
  volRegime: string;
  currentVol: number;
  currentBeta: number;
  mdd: number;
  corrInstability: string;
}> = ({ volRegime, currentVol, currentBeta, mdd, corrInstability }) => {
  const observations: Array<{ text: string; severity: 'info' | 'medium' | 'high' }> = [];

  if (volRegime === 'expansion' || volRegime === 'high') {
    observations.push({ text: `Portfolio volatility is in ${volRegime} regime (${currentVol.toFixed(1)}% annualised). Historically, elevated vol regimes have been associated with increased drawdown risk and broader market stress.`, severity: 'high' });
  } else if (volRegime === 'compression') {
    observations.push({ text: `Volatility compression detected (${currentVol.toFixed(1)}% ann.). Low-vol regimes have historically preceded sharp reversals — portfolio may be under-pricing near-term risk.`, severity: 'medium' });
  } else {
    observations.push({ text: `Portfolio volatility is in ${volRegime} regime (${currentVol.toFixed(1)}% annualised). Current conditions are broadly consistent with historical norms.`, severity: 'info' });
  }

  if (Math.abs(currentBeta) > 1.3) {
    observations.push({ text: `Portfolio beta of ${currentBeta.toFixed(2)} indicates elevated systematic sensitivity. Portfolio would be expected to amplify benchmark directional moves.`, severity: 'medium' });
  } else if (Math.abs(currentBeta) < 0.6) {
    observations.push({ text: `Low portfolio beta (${currentBeta.toFixed(2)}) indicates reduced systematic exposure. Portfolio may diverge materially from benchmark during broad market moves.`, severity: 'info' });
  }

  if (mdd < -0.20) {
    observations.push({ text: `Maximum drawdown of ${fmtPct(mdd)} exceeds −20%. Historical stress events with similar drawdown profiles have often preceded extended risk-off periods.`, severity: 'high' });
  }

  if (corrInstability === 'elevated') {
    observations.push({ text: 'Cross-holding correlation has elevated recently. Increased correlation typically reduces diversification benefit and may indicate concentrated macro factor exposure.', severity: 'medium' });
  }

  const SEVERITY_COLORS: Record<string, string> = { high: 'var(--destructive)', medium: 'var(--chart-4)', info: 'var(--chart-2)' };
  const SEVERITY_BG: Record<string, string> = {
    high: 'color-mix(in srgb, var(--destructive) 8%, transparent)',
    medium: 'color-mix(in srgb, var(--chart-4) 8%, transparent)',
    info: 'color-mix(in srgb, var(--chart-2) 6%, transparent)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {observations.map((obs, i) => (
        <div key={i} style={{
          padding: '10px 14px',
          background: SEVERITY_BG[obs.severity],
          borderLeft: `3px solid ${SEVERITY_COLORS[obs.severity]}`,
          borderRadius: '0 7px 7px 0',
        }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--foreground)', lineHeight: 1.6 }}>{obs.text}</p>
        </div>
      ))}
    </div>
  );
};

// ─── Risk regime heatmap (rolling monthly vol by period) ─────────────────────

const RiskRegimeHeatmap: React.FC<{ monthlyVol: Array<{ label: string; vol: number }> }> = ({ monthlyVol }) => {
  if (monthlyVol.length === 0) return null;
  const maxVol = Math.max(...monthlyVol.map(m => m.vol));
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {monthlyVol.map(m => {
        const intensity = maxVol > 0 ? m.vol / maxVol : 0;
        const bg = intensity > 0.75 ? 'var(--destructive)' : intensity > 0.5 ? 'var(--chart-4)' : intensity > 0.25 ? 'color-mix(in srgb, var(--chart-4) 50%, var(--chart-2))' : 'var(--chart-2)';
        return (
          <div
            key={m.label}
            title={`${m.label}: ${m.vol.toFixed(1)}% vol`}
            style={{
              padding: '4px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700,
              background: `color-mix(in srgb, ${bg} ${Math.round(30 + intensity * 60)}%, transparent)`,
              border: `1px solid color-mix(in srgb, ${bg} 50%, transparent)`,
              color: intensity > 0.5 ? '#fff' : 'var(--foreground)',
              cursor: 'default',
            }}
          >
            {m.label}
          </div>
        );
      })}
    </div>
  );
};

// ─── Main page ─────────────────────────────────��──────────────────────────────

export const RiskRegimeFit: React.FC = () => {
  const { selectedPortfolio, holdings, loading, holdingsLoading, effectiveWeights } = usePortfolioWorkspace();
  const benchmarkId = selectedPortfolio?.benchmarkId ?? 'SPY';

  const [barsMap, setBarsMap] = useState<Record<string, OHLCVBar[]>>({});
  const [fetching, setFetching] = useState(false);

  const symbols = useMemo(() => holdings.map(h => h.symbol), [holdings]);

  useEffect(() => {
    if (symbols.length === 0) { setBarsMap({}); return; }
    setFetching(true);
    const toFetch = [...new Set([...symbols, benchmarkId])];
    Promise.allSettled(toFetch.map(s => fetchOHLCV(s, '1day', 252))).then(results => {
      const m: Record<string, OHLCVBar[]> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.bars.length >= 20) m[toFetch[i]] = r.value.bars;
      });
      setBarsMap(m);
      setFetching(false);
    });
  }, [symbols.join(','), benchmarkId]);

  // ── Compute portfolio return series ──────────────────���─────────────────────
  const { portLogReturns, bmLogReturns, refTs } = useMemo(() => {
    const validSymbols = symbols.filter(s => barsMap[s]);
    if (validSymbols.length === 0) return { portLogReturns: [], bmLogReturns: [], refTs: [] };
    const minLen = Math.min(...validSymbols.map(s => barsMap[s].length));
    const logReturnArrays = validSymbols.map(s => logReturns(barsMap[s].slice(-minLen).map(b => b.close)));
    const weights = validSymbols.map(s => effectiveWeights[s] ?? 1 / validSymbols.length);
    const total = weights.reduce((a, b) => a + b, 0);
    const normWeights = weights.map(w => w / total);
    const portLR = portfolioReturnSeries(logReturnArrays, normWeights);

    const bmBars = barsMap[benchmarkId];
    const bmLR = bmBars ? logReturns(bmBars.slice(-minLen).map(b => b.close)) : portLR.map(() => 0);

    const refBars = barsMap[validSymbols[0]].slice(-minLen);
    const ts = refBars.slice(1).map(b => b.ts);
    return { portLogReturns: portLR, bmLogReturns: bmLR, refTs: ts };
  }, [symbols, barsMap, effectiveWeights, benchmarkId]);

  // ── Rolling vol (21-day, already in %) ────────────────────────────────────
  const volSeries = useMemo(() => {
    const vols = rollingAnnualisedVol(portLogReturns, 21);
    const bmVols = rollingAnnualisedVol(bmLogReturns, 21);
    return refTs.map((ts, i) => ({
      ts,
      vol: vols[i] ?? 0,
      bmVol: bmVols[i] ?? 0,
    })).filter(v => v.vol > 0);
  }, [portLogReturns, bmLogReturns, refTs]);

  // ── Rolling beta (63-day window) ────────────────────────���─────────────────
  const betaSeries = useMemo(() => {
    if (portLogReturns.length < 63 || bmLogReturns.length < 63) return [];
    const len = Math.min(portLogReturns.length, bmLogReturns.length);
    const portTrimmed = portLogReturns.slice(-len);
    const bmTrimmed = bmLogReturns.slice(-len);
    const betas = rollingBeta(portTrimmed, bmTrimmed, 63);
    return refTs.slice(-len).map((ts, i) => ({ ts, beta: betas[i] ?? null })).filter(d => d.beta !== null);
  }, [portLogReturns, bmLogReturns, refTs]);

  // ── Drawdown series ──────────────────────��────────────────────────────���────
  const drawdownSeries = useMemo(() => {
    let cum = 0, peak = 0, bmCum = 0, bmPeak = 0;
    const len = Math.min(portLogReturns.length, bmLogReturns.length, refTs.length);
    return refTs.slice(-len).map((ts, i) => {
      cum += portLogReturns[portLogReturns.length - len + i] ?? 0;
      if (cum > peak) peak = cum;
      const dd = Math.exp(cum - peak) - 1;
      bmCum += bmLogReturns[bmLogReturns.length - len + i] ?? 0;
      if (bmCum > bmPeak) bmPeak = bmCum;
      const bmDd = Math.exp(bmCum - bmPeak) - 1;
      return { ts, drawdown: dd, bmDrawdown: bmDd };
    });
  }, [portLogReturns, bmLogReturns, refTs]);

  // ── Volatility regime ────────────────────────────��─────────────────────���──
  const { volRegime, currentVol } = useMemo(() => {
    if (portLogReturns.length < 21) return { volRegime: 'unknown', currentVol: 0 };
    const regime = volatilityRegime(portLogReturns);
    const volArr = rollingAnnualisedVol(portLogReturns, 21);
    const currentVol = volArr[volArr.length - 1] ?? 0;
    return { volRegime: regime?.state ?? 'unknown', currentVol };
  }, [portLogReturns]);

  // ── Current beta ────────────────────────────���─────────────────────────────
  const currentBeta = betaSeries[betaSeries.length - 1]?.beta ?? 0;

  // ── Max drawdown ───────────────��───────────────────────────��──────────────
  const mdd = drawdownSeries.length > 0 ? Math.min(...drawdownSeries.map(d => d.drawdown)) : 0;

  // ── Correlation instability ───────────────────────────────────────────────
  const corrInstability = useMemo(() => {
    const validSymbols = symbols.filter(s => barsMap[s] && barsMap[s].length >= 30);
    if (validSymbols.length < 2) return 'unknown';
    const minLen = Math.min(...validSymbols.map(s => barsMap[s].length));
    const recentLR = validSymbols.map(s => logReturns(barsMap[s].slice(-30).map(b => b.close)));
    const olderLR = validSymbols.map(s => logReturns(barsMap[s].slice(-90, -30).map(b => b.close)));
    if (olderLR[0].length < 5) return 'unknown';
    const recentMat = correlationMatrix(recentLR);
    const olderMat = correlationMatrix(olderLR);
    let drift = 0, count = 0;
    for (let i = 0; i < validSymbols.length; i++) {
      for (let j = i + 1; j < validSymbols.length; j++) {
        drift += Math.abs((recentMat[i]?.[j] ?? 0) - (olderMat[i]?.[j] ?? 0));
        count++;
      }
    }
    const avgDrift = count > 0 ? drift / count : 0;
    return avgDrift > 0.2 ? 'elevated' : 'stable';
  }, [symbols, barsMap]);

  // ── Monthly vol heatmap data ────────────────────���──────────────────────���──
  const monthlyVol = useMemo(() => {
    if (volSeries.length < 20) return [];
    const byMonth: Record<string, number[]> = {};
    for (const v of volSeries) {
      const key = new Date(v.ts).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(v.vol);
    }
    return Object.entries(byMonth).slice(-12).map(([label, vols]) => ({
      label,
      vol: vols.reduce((a, b) => a + b, 0) / vols.length,
    }));
  }, [volSeries]);

  // ── Correlation instability as numeric values for intelligence engine ────────
  const { recentCorrAvg, priorCorrAvg } = useMemo(() => {
    const validSymbols = symbols.filter(s => barsMap[s] && barsMap[s].length >= 90);
    if (validSymbols.length < 2) return { recentCorrAvg: undefined, priorCorrAvg: undefined };
    const recentLR = validSymbols.map(s => logReturns(barsMap[s].slice(-30).map(b => b.close)));
    const olderLR  = validSymbols.map(s => logReturns(barsMap[s].slice(-90, -30).map(b => b.close)));
    if (olderLR[0].length < 5) return { recentCorrAvg: undefined, priorCorrAvg: undefined };
    const recentMat = correlationMatrix(recentLR);
    const olderMat  = correlationMatrix(olderLR);
    const avg = (mat: number[][]): number => {
      let sum = 0, count = 0;
      for (let i = 0; i < mat.length; i++)
        for (let j = i + 1; j < mat.length; j++) { sum += mat[i]?.[j] ?? 0; count++; }
      return count > 0 ? sum / count : 0;
    };
    return { recentCorrAvg: avg(recentMat), priorCorrAvg: avg(olderMat) };
  }, [symbols, barsMap]);

  const shortVol = volSeries.length > 0 ? (volSeries[volSeries.length - 1]?.vol ?? 0) / 100 : undefined;
  const longVol  = volSeries.length > 20
    ? volSeries.slice(-90).reduce((s, v) => s + v.vol, 0) / Math.min(90, volSeries.length) / 100
    : undefined;

  const { observations, acknowledge } = usePortfolioIntelligence(
    selectedPortfolio?.id,
    holdings.length > 0
      ? {
          holdings,
          effectiveWeights,
          annVol: currentVol / 100,
          shortVol,
          longVol,
          rollingBeta: currentBeta,
          maxDrawdownPct: mdd,
          recentCorr: recentCorrAvg,
          priorCorr: priorCorrAvg,
        }
      : null,
  );

  if (loading || holdingsLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', textAlign: 'center', padding: 24 }}>
        <ShieldAlert size={24} style={{ color: 'var(--muted-foreground)', marginBottom: 12, opacity: 0.4 }} />
        <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>No holdings for risk analysis</p>
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, maxWidth: 300 }}>Add holdings to enable rolling volatility, beta, drawdown, and regime fit analysis.</p>
      </div>
    );
  }

  const hasSeries = volSeries.length > 5;

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px 14px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em' }}>Risk & Regime Fit</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
          {selectedPortfolio?.name} · Portfolio surveillance infrastructure · 252D lookback
        </p>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Risk metrics strip ─────────────���─────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Vol Regime', value: volRegime.replace('-', ' '), color: volRegime === 'expansion' ? 'var(--destructive)' : volRegime === 'compression' ? 'var(--chart-4)' : 'var(--chart-2)' },
            { label: 'Current Vol', value: `${currentVol.toFixed(1)}%`, color: currentVol > 30 ? 'var(--destructive)' : currentVol > 20 ? 'var(--chart-4)' : 'var(--chart-2)' },
            { label: 'Portfolio Beta', value: currentBeta.toFixed(2), color: Math.abs(currentBeta) > 1.3 ? 'var(--destructive)' : 'var(--foreground)' },
            { label: 'Max Drawdown', value: fmtPct(mdd), color: 'var(--destructive)' },
            { label: 'Corr Stability', value: corrInstability, color: corrInstability === 'elevated' ? 'var(--destructive)' : 'var(--chart-2)' },
          ].map(m => (
            <div key={m.label} style={{ padding: '8px 12px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 80 }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</p>
              <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 700, color: m.color, textTransform: 'capitalize', fontVariantNumeric: 'tabular-nums' }}>{m.value}</p>
            </div>
          ))}
        </div>

        {fetching && !hasSeries && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted-foreground)' }}>
            <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
            Computing risk metrics from 252 days of price history…
          </div>
        )}

        {/* ── Row 1: Rolling Vol + Rolling Beta ───────────────────────────── */}
        {hasSeries && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            <SectionCard title="Rolling Volatility" subtitle="21-day annualised · Portfolio vs Benchmark" icon={<Activity size={13} />}>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={volSeries} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="ts" tickFormatter={fmtDate} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
                  <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10 }}
                    formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name === 'vol' ? 'Portfolio' : benchmarkId]} />
                  <Line type="monotone" dataKey="vol" stroke="var(--chart-4)" strokeWidth={2} dot={false} name="vol" />
                  <Line type="monotone" dataKey="bmVol" stroke="var(--chart-2)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="bmVol" />
                </LineChart>
              </ResponsiveContainer>
            </SectionCard>

            <SectionCard title="Rolling Beta" subtitle="63-day window · vs Benchmark" icon={<TrendingUp size={13} />}>
              {betaSeries.length > 5 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={betaSeries} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                    <XAxis dataKey="ts" tickFormatter={fmtDate} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(1)} />
                    <ReferenceLine y={1} stroke="var(--border)" strokeDasharray="3 3" label={{ value: 'β=1', fill: 'var(--muted-foreground)', fontSize: 9 }} />
                    <ReferenceLine y={0} stroke="var(--border)" />
                    <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10 }}
                      formatter={(v: number) => [v.toFixed(2), 'Beta']} />
                    <Line type="monotone" dataKey="beta" stroke="var(--primary)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>Insufficient history for rolling beta (need 63+ days).</p>
              )}
            </SectionCard>
          </div>
        )}

        {/* ── Row 2: Drawdown ──────────────────────────────────────────────── */}
        {hasSeries && drawdownSeries.length > 5 && (
          <SectionCard title="Drawdown" subtitle={`Max: ${fmtPct(mdd)} · Portfolio vs ${benchmarkId}`} icon={<ShieldAlert size={13} />}>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={drawdownSeries} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="riskDdGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.02} />
                    <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0.3} />
                  </linearGradient>
                  <linearGradient id="riskBmDdGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.02} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="ts" tickFormatter={fmtDate} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
                <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="2 2" />
                <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10 }}
                  formatter={(v: number, name: string) => [fmtPct(v), name === 'drawdown' ? 'Portfolio' : benchmarkId]} />
                <Area type="monotone" dataKey="drawdown" stroke="var(--destructive)" strokeWidth={1.5} fill="url(#riskDdGrad)" dot={false} />
                <Area type="monotone" dataKey="bmDrawdown" stroke="var(--chart-2)" strokeWidth={1} strokeDasharray="4 3" fill="url(#riskBmDdGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </SectionCard>
        )}

        {/* ── Row 3: Vol regime heatmap ──────────────���──────────────────────── */}
        {monthlyVol.length > 0 && (
          <SectionCard title="Volatility Regime Calendar" subtitle="Monthly average volatility — colour intensity = vol level" icon={<Activity size={13} />}>
            <RiskRegimeHeatmap monthlyVol={monthlyVol} />
          </SectionCard>
        )}

        {/* ── Row 4: Regime interpretation ──────────────���──────────────────── */}
        {hasSeries && (
          <SectionCard title="Regime Interpretation" subtitle="Contextual portfolio surveillance intelligence" icon={<AlertCircle size={13} />}>
            <RegimePanel
              volRegime={volRegime}
              currentVol={currentVol}
              currentBeta={currentBeta}
              mdd={mdd}
              corrInstability={corrInstability}
            />
          </SectionCard>
        )}
      </div>
    </div>
  );
};
