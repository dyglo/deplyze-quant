import React, { useState } from 'react';
import { useBenchmarkIntelligence } from '../../hooks/useBenchmarkIntelligence';

const BENCHMARKS = ['SPY', 'QQQ', 'IWM', 'DIA'] as const;
type BenchmarkChoice = typeof BENCHMARKS[number];

const Stat: React.FC<{ label: string; value: string; sub?: string; emphasised?: boolean }> = ({ label, value, sub, emphasised }) => (
  <div className="ds-surface" style={{
    padding: '10px 12px',
    borderRadius: 8,
    border: emphasised ? '1px solid var(--primary)' : '1px solid var(--border)',
  }}>
    <div className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{label}</div>
    <div style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{value}</div>
    {sub && <div className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{sub}</div>}
  </div>
);

function fmtPct(x: number, digits = 1): string {
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`;
}

function fmtNum(x: number, digits = 2): string {
  return x.toFixed(digits);
}

export const BenchmarkIntelligencePanel: React.FC<{ symbol: string; flat?: boolean }> = ({ symbol, flat }) => {
  const [benchmark, setBenchmark] = useState<BenchmarkChoice>('SPY');
  const intel = useBenchmarkIntelligence(symbol, benchmark);

  const outerStyle = flat
    ? { marginBottom: 32, display: 'grid' as const, gap: 12 }
    : { padding: 16, borderRadius: 10, display: 'grid' as const, gap: 12 };
  const outerClass = flat ? undefined : 'ds-surface';

  return (
    <section className={outerClass} style={outerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...(flat ? { paddingBottom: 10, borderBottom: '1px solid var(--border)', marginBottom: 16 } : {}) }}>
        {flat
          ? <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Benchmark Intelligence</h2>
          : <h3 className="ds-heading" style={{ margin: 0 }}>Benchmark intelligence</h3>
        }
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {BENCHMARKS.map((b) => (
            <button
              key={b}
              onClick={() => setBenchmark(b)}
              style={{
                padding: '3px 9px', fontSize: 11, fontWeight: 600,
                background: benchmark === b ? 'var(--primary)' : 'transparent',
                color: benchmark === b ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                border: 'none', cursor: 'pointer',
              }}
            >{b}</button>
          ))}
        </div>
      </div>

      {symbol === benchmark && (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Select a different benchmark to compute relative intelligence — {symbol} is the chosen benchmark.
        </p>
      )}

      {intel.loading && (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Aligning {symbol} against {benchmark} on 2-year history…
        </p>
      )}

      {intel.insufficient && !intel.loading && symbol !== benchmark && (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Insufficient overlapping history for {symbol} ↔ {benchmark} — need ≥60 aligned bars.
        </p>
      )}

      {intel.snapshot && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <Stat
              label="Beta"
              value={fmtNum(intel.snapshot.beta)}
              sub={`vs ${benchmark}`}
              emphasised={intel.snapshot.betaShiftFlagged}
            />
            <Stat
              label="Alpha (ann.)"
              value={fmtPct(intel.snapshot.alphaAnnualised)}
              sub="Jensen's"
            />
            <Stat
              label="Tracking Error"
              value={fmtPct(intel.snapshot.trackingError)}
              sub="annualised"
            />
            <Stat
              label="Info Ratio"
              value={fmtNum(intel.snapshot.informationRatio)}
              sub={`hit ${(intel.snapshot.hitRatio * 100).toFixed(0)}%`}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <Stat
              label="Up capture"
              value={fmtNum(intel.snapshot.upCapture)}
              sub="vs benchmark up days"
            />
            <Stat
              label="Down capture"
              value={fmtNum(intel.snapshot.downCapture)}
              sub="vs benchmark down days"
            />
          </div>

          {intel.snapshot.betaDrift && (
            <div style={{
              padding: '8px 10px',
              borderRadius: 6,
              background: intel.snapshot.betaShiftFlagged ? 'rgba(193, 95, 60, 0.06)' : 'var(--muted)',
              border: intel.snapshot.betaShiftFlagged ? '1px solid var(--primary)' : '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              fontSize: 12,
            }}>
              <div>
                <span style={{ fontWeight: 600 }}>Rolling beta drift</span>
                <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginLeft: 6 }}>
                  60-bar window
                </span>
              </div>
              <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtNum(intel.snapshot.betaDrift.historicalMean)} →{' '}
                <span style={{ fontWeight: 600, color: intel.snapshot.betaShiftFlagged ? 'var(--primary)' : 'var(--foreground)' }}>
                  {fmtNum(intel.snapshot.betaDrift.current)}
                </span>
                {' '}({intel.snapshot.betaDrift.delta >= 0 ? '+' : ''}{fmtNum(intel.snapshot.betaDrift.delta)})
                {intel.snapshot.betaShiftFlagged && (
                  <span style={{
                    marginLeft: 8, padding: '1px 6px', borderRadius: 4,
                    fontSize: 10, fontWeight: 600,
                    background: 'rgba(193, 95, 60, 0.12)', color: 'var(--primary)',
                    textTransform: 'uppercase', letterSpacing: 0.3,
                  }}>shift</span>
                )}
              </div>
            </div>
          )}

          <p className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10, margin: 0 }}>
            Computed from {intel.snapshot.sampleSize} aligned log-return bars.
            Beta-shift flag triggers when |Δ| &gt; 0.25 vs historical rolling mean.
          </p>
        </>
      )}
    </section>
  );
};
