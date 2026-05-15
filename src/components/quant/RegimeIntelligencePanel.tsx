import React from 'react';
import { useInstrumentRegime } from '../../hooks/useInstrumentRegime';
import { describeVolPercentile, type MarketRegime } from '../../lib/quant';

const PILL_COLORS = {
  'risk-on':       { bg: 'rgba(78, 96, 64, 0.10)', fg: '#4E6040' },
  'risk-off':      { bg: 'rgba(193, 95, 60, 0.10)', fg: 'var(--primary)' },
  'neutral':       { bg: 'var(--muted)',            fg: 'var(--muted-foreground)' },
  'strong-up':     { bg: 'rgba(78, 96, 64, 0.10)', fg: '#4E6040' },
  'up':            { bg: 'rgba(78, 96, 64, 0.10)', fg: '#4E6040' },
  'range':         { bg: 'var(--muted)',            fg: 'var(--muted-foreground)' },
  'down':          { bg: 'rgba(193, 95, 60, 0.10)', fg: 'var(--primary)' },
  'strong-down':   { bg: 'rgba(193, 95, 60, 0.10)', fg: 'var(--primary)' },
  'compressed':    { bg: 'rgba(50, 95, 140, 0.10)', fg: '#325F8C' },
  'low':           { bg: 'rgba(50, 95, 140, 0.10)', fg: '#325F8C' },
  'normal':        { bg: 'var(--muted)',            fg: 'var(--muted-foreground)' },
  'elevated':      { bg: 'rgba(193, 95, 60, 0.10)', fg: 'var(--primary)' },
  'expanded':      { bg: 'rgba(193, 95, 60, 0.10)', fg: 'var(--primary)' },
} as const;

type PillKey = keyof typeof PILL_COLORS;

const Pill: React.FC<{ label: string; kind: PillKey }> = ({ label, kind }) => {
  const c = PILL_COLORS[kind];
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: 0.2,
      background: c.bg,
      color: c.fg,
    }}>{label}</span>
  );
};

const Stat: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="ds-surface" style={{ padding: '8px 10px', borderRadius: 8 }}>
    <div className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{label}</div>
    <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{value}</div>
    {sub && <div className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{sub}</div>}
  </div>
);

const ConfidenceBar: React.FC<{ value: number }> = ({ value }) => (
  <div style={{ height: 4, background: 'var(--muted)', borderRadius: 4, overflow: 'hidden' }}>
    <div style={{
      width: `${Math.max(0, Math.min(1, value)) * 100}%`,
      height: '100%',
      background: value > 0.7 ? '#4E6040' : value > 0.4 ? 'var(--primary)' : 'var(--muted-foreground)',
      transition: 'width 200ms ease',
    }} />
  </div>
);

const RegimeSummary: React.FC<{ regime: MarketRegime }> = ({ regime }) => {
  const volPctText = describeVolPercentile(regime.volatility.percentileRank);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Pill label={regime.trend} kind={regime.trend as PillKey} />
        <Pill label={`vol ${regime.volatility.state}`} kind={regime.volatility.state as PillKey} />
        {regime.riskRegime && regime.riskRegime !== 'neutral' && (
          <Pill label={regime.riskRegime} kind={regime.riskRegime as PillKey} />
        )}
      </div>
      <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.5 }}>
        {regime.description}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <Stat
          label="Realised Vol"
          value={`${(regime.volatility.realisedVol * 100).toFixed(1)}%`}
          sub={volPctText}
        />
        <Stat
          label="Trend Stability"
          value={`${(regime.trendStability * 100).toFixed(0)}%`}
          sub={regime.trend}
        />
        <Stat
          label="Momentum Persist."
          value={`${(regime.momentumPersistence * 100).toFixed(0)}%`}
          sub={regime.volatility.trend}
        />
      </div>
      <div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 10, color: 'var(--muted-foreground)', marginBottom: 4,
        }}>
          <span>Confidence</span>
          <span>{(regime.confidence * 100).toFixed(0)}%</span>
        </div>
        <ConfidenceBar value={regime.confidence} />
      </div>
    </div>
  );
};

export const RegimeIntelligencePanel: React.FC<{ symbol: string }> = ({ symbol }) => {
  const intel = useInstrumentRegime(symbol);

  if (intel.loading) {
    return (
      <section className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
        <h3 className="ds-heading" style={{ margin: 0, marginBottom: 8 }}>Regime intelligence</h3>
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Computing regime from 2-year history…
        </p>
      </section>
    );
  }

  if (intel.insufficient || !intel.regime) {
    return (
      <section className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
        <h3 className="ds-heading" style={{ margin: 0, marginBottom: 8 }}>Regime intelligence</h3>
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Insufficient history for {symbol} — need ≥280 daily bars, have {intel.barCount}.
        </p>
      </section>
    );
  }

  const anomalies = [
    ...intel.returnAnomalies.slice(0, 3),
    ...intel.volumeAnomalies.slice(0, 2),
  ].sort((a, b) => b.ts - a.ts).slice(0, 4);

  return (
    <section className="ds-surface" style={{ padding: 14, borderRadius: 10, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 className="ds-heading" style={{ margin: 0 }}>Regime intelligence</h3>
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
          {intel.barCount} bars · 2y
        </span>
      </div>
      <RegimeSummary regime={intel.regime} />

      {anomalies.length > 0 && (
        <div>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)',
            marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4,
          }}>
            Recent anomalies
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
            {anomalies.map((a) => {
              const sign = a.payload.direction === 'positive' ? '▲' : '▼';
              const color = a.payload.direction === 'positive' ? '#4E6040' : 'var(--primary)';
              return (
                <li key={a.id} style={{
                  display: 'flex', gap: 8, alignItems: 'baseline',
                  fontSize: 11, color: 'var(--foreground)',
                }}>
                  <span style={{ color, fontWeight: 700 }}>{sign}</span>
                  <span style={{ color: 'var(--muted-foreground)' }}>
                    {new Date(a.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span style={{ flex: 1 }}>{a.narrative}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
};
