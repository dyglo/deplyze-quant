import React from 'react';
import { useHistoricalAnalogs } from '../../hooks/useHistoricalAnalogs';

const SimilarityBar: React.FC<{ value: number }> = ({ value }) => {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = value > 0.75 ? '#4E6040' : value > 0.55 ? '#C7884A' : 'var(--muted-foreground)';
  return (
    <div style={{
      width: 60, height: 4, background: 'var(--muted)', borderRadius: 4, overflow: 'hidden',
    }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color }} />
    </div>
  );
};

export const HistoricalAnalogPanel: React.FC<{ symbol: string }> = ({ symbol }) => {
  const result = useHistoricalAnalogs(symbol, { window: 60, step: 21, topK: 4 });

  if (result.loading) {
    return (
      <section className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
        <h3 className="ds-heading" style={{ margin: 0, marginBottom: 8 }}>Historical analogs</h3>
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Searching 10-year history for fingerprint matches…
        </p>
      </section>
    );
  }

  if (!result.ready || !result.matches.length) {
    return (
      <section className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
        <h3 className="ds-heading" style={{ margin: 0, marginBottom: 8 }}>Historical analogs</h3>
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Not enough history for {symbol} — found {result.barCount} bars, need ≥180.
        </p>
      </section>
    );
  }

  return (
    <section className="ds-surface" style={{ padding: 14, borderRadius: 10, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 className="ds-heading" style={{ margin: 0 }}>Historical analogs</h3>
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
          60-bar fingerprint · {result.barCount} bars scanned
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {result.matches.map((m) => (
          <li key={`${m.windowEnd}`} style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            alignItems: 'center',
            gap: 12,
            fontSize: 12,
            padding: '6px 8px',
            background: 'var(--card)',
            borderRadius: 6,
            border: '1px solid var(--border)',
          }}>
            <div>
              <div style={{ fontWeight: 600 }}>{m.label}</div>
              <div className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
                vol {(m.fingerprint.realisedVol * 100).toFixed(1)}%
                {' · '}
                drift {(m.fingerprint.meanReturn * 252 * 100).toFixed(1)}%/yr
              </div>
            </div>
            <SimilarityBar value={m.similarity} />
            <span style={{
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 600,
              color: m.similarity > 0.75 ? '#4E6040' : 'var(--foreground)',
              minWidth: 36,
              textAlign: 'right',
            }}>
              {Math.round(m.similarity * 100)}%
            </span>
          </li>
        ))}
      </ul>
      <p className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10, margin: 0 }}>
        Fingerprint: realised vol, mean return, trend slope, skew, range compression, vol-of-vol.
        Cosine similarity over z-score-normalised features.
      </p>
    </section>
  );
};
