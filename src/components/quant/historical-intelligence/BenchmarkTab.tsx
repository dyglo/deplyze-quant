/**
 * BenchmarkTab — institutional benchmark-relative intelligence panel.
 *
 * Uses buildBenchmarkIntelligence() against the active symbol vs the user's
 * chosen benchmark and renders: beta / annualised alpha proxy / tracking
 * error / information ratio / hit ratio / up + down capture / rolling beta
 * trajectory / structural beta-shift flag.
 *
 * Probability + relative-tendency language only; no claims of guaranteed
 * outperformance.
 */

import React, { useMemo } from 'react';
import { Telescope, AlertTriangle } from 'lucide-react';
import { useOHLCV } from '../../../hooks/useMarket';
import { buildBenchmarkIntelligence, type BenchmarkIntelligence } from '../../../lib/quant';

const HISTORY_BARS = 1260; // ~5y

export const BenchmarkTab: React.FC<{ symbol: string; benchmark: string }> = ({ symbol, benchmark }) => {
  const primary = useOHLCV(symbol, '1day', HISTORY_BARS);
  const bench = useOHLCV(benchmark, '1day', HISTORY_BARS);
  const primaryBars = primary.data?.bars ?? [];
  const benchBars = bench.data?.bars ?? [];

  const intel = useMemo<BenchmarkIntelligence | null>(
    () => (primaryBars.length >= 60 && benchBars.length >= 60
      ? buildBenchmarkIntelligence(primaryBars, benchBars, { symbol, benchmark, rollingWindow: 60 })
      : null),
    [primaryBars, benchBars, symbol, benchmark],
  );

  if (primary.loading || bench.loading) return <Card label="Loading benchmark-aligned histories…" />;
  if (!intel) return <Card label={`Need ≥ 60 overlapping bars between ${symbol} and ${benchmark}.`} />;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={iconWrap}><Telescope size={14} color="var(--primary)" /></span>
        <div>
          <h2 className="ds-heading" style={{ margin: 0 }}>Benchmark intelligence · {symbol} vs {benchmark}</h2>
          <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            Risk-adjusted, regime-conditioned relative behaviour. Probabilistic — not a guarantee of outperformance.
          </p>
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        <Stat label={`β vs ${benchmark}`} value={intel.beta.toFixed(2)} hint={betaHint(intel.beta)} />
        <Stat label="Alpha (annualised)" value={`${(intel.alphaAnnualised * 100).toFixed(2)}%`} hint="Jensen's α proxy" tone={intel.alphaAnnualised >= 0 ? 'positive' : 'negative'} />
        <Stat label="Tracking error" value={`${(intel.trackingError * 100).toFixed(2)}%`} hint="annualised σ of α" />
        <Stat label="Information ratio" value={intel.informationRatio.toFixed(2)} hint="excess return / TE" tone={intel.informationRatio >= 0 ? 'positive' : 'negative'} />
        <Stat label="Hit rate vs bench" value={`${(intel.hitRatio * 100).toFixed(0)}%`} hint="days outperforming benchmark" />
        <Stat label="Up capture" value={`${(intel.upCapture * 100).toFixed(0)}%`} hint="benchmark-up-day capture" />
        <Stat label="Down capture" value={`${(intel.downCapture * 100).toFixed(0)}%`} hint="benchmark-down-day capture" tone={intel.downCapture <= 1 ? 'positive' : 'negative'} />
        <Stat label="Sample size" value={`${intel.sampleSize}`} hint="overlapping return bars" />
      </section>

      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
          <h3 className="ds-heading" style={{ margin: 0, fontSize: 13 }}>Rolling β trajectory (60-bar window)</h3>
          {intel.betaShiftFlagged && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 9px', borderRadius: 999,
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
              background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
              color: 'var(--primary)',
              border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
            }}>
              <AlertTriangle size={11} /> Structural β shift
            </span>
          )}
        </div>
        {intel.rollingBeta.length < 5 ? (
          <p className="ds-caption" style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>Not enough overlapping bars for rolling β.</p>
        ) : (
          <>
            <BetaSparkline values={intel.rollingBeta} />
            {intel.betaDrift && (
              <p className="ds-caption" style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>
                Latest β <strong style={{ color: 'var(--foreground)' }}>{intel.betaDrift.current.toFixed(2)}</strong>
                {' '}vs historical mean <strong style={{ color: 'var(--foreground)' }}>{intel.betaDrift.historicalMean.toFixed(2)}</strong>
                {' '}(Δ {intel.betaDrift.delta > 0 ? '+' : ''}{intel.betaDrift.delta.toFixed(2)}).
              </p>
            )}
          </>
        )}
      </section>

      <section style={{ ...cardStyle, fontSize: 11, color: 'var(--muted-foreground)' }}>
        Risk-adjusted relative metrics describe historical tendency only. They do not imply that {symbol} will continue to outperform or underperform {benchmark}.
      </section>
    </div>
  );
};

const BetaSparkline: React.FC<{ values: number[] }> = ({ values }) => {
  const w = 600, h = 80, pad = 8;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  const baselineY = pad + (1 - (1 - min) / span) * (h - pad * 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 100, marginTop: 8 }}>
      {1 >= min && 1 <= max && (
        <line x1={pad} x2={w - pad} y1={baselineY} y2={baselineY} stroke="var(--muted-foreground)" strokeDasharray="3 3" strokeOpacity={0.5} />
      )}
      <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth={1.5} />
    </svg>
  );
};

function betaHint(b: number): string {
  if (b > 1.2) return 'high market beta';
  if (b < 0.8 && b > 0) return 'lower market beta';
  if (b < 0) return 'negative correlation to benchmark';
  return 'roughly market-like';
}

const Stat: React.FC<{ label: string; value: string; hint?: string; tone?: 'positive' | 'negative' }> = ({ label, value, hint, tone }) => (
  <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)', display: 'grid', gap: 4 }}>
    <span className="ds-caption" style={{ fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-foreground)', fontWeight: 700 }}>{label}</span>
    <span style={{
      fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
      color: tone === 'positive' ? '#4E6040' : tone === 'negative' ? 'var(--primary)' : 'var(--foreground)',
    }}>{value}</span>
    {hint && <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{hint}</span>}
  </div>
);

const cardStyle: React.CSSProperties = { padding: 14, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)' };
const iconWrap: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
  border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const Card: React.FC<{ label: string }> = ({ label }) => (
  <div style={cardStyle}><p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>{label}</p></div>
);
