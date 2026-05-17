/**
 * HistoricalSection — percentile + analog episodes.
 *
 * Wave B: scaffold with payload renderer + empty state.
 * Wave F: `lib/intelligence/historicalContext.ts` wraps `contextualAnalog`
 * and feeds the payload.
 */
import React from 'react';
import { SectionShell, SectionEmpty, SectionLoading } from './SectionShell';
import type { IntelligenceSectionProps, HistoricalPayload } from './types';

interface Props extends IntelligenceSectionProps {
  payload?: HistoricalPayload;
}

export const HistoricalSection: React.FC<Props> = ({ payload, state, error }) => {
  return (
    <SectionShell label="Historical Context">
      {state === 'loading' && <SectionLoading />}
      {state === 'error' && <SectionEmpty message={error ?? 'Could not load historical context.'} />}
      {!state && !payload && (
        <SectionEmpty message="No historical analogs yet — fills in once the analog engine has indexed this instrument." />
      )}
      {payload && <HistoricalBody payload={payload} />}
    </SectionShell>
  );
};

const HistoricalBody: React.FC<{ payload: HistoricalPayload }> = ({ payload }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {payload.percentile != null && (
        <PercentileBar value={payload.percentile} label={payload.percentileLabel} />
      )}

      {payload.analogs && payload.analogs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {payload.analogs.map((a, i) => (
            <div
              key={i}
              style={{
                padding: '9px 11px',
                borderRadius: 8,
                background: 'var(--muted)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>{a.label}</span>
                {a.similarity != null && (
                  <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(a.similarity * 100)}% match
                  </span>
                )}
              </div>
              {a.windowLabel && (
                <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>{a.windowLabel}</p>
              )}
              {a.forwardReturn60d != null && (
                <p style={{
                  margin: '4px 0 0',
                  fontSize: 11,
                  fontWeight: 600,
                  color: a.forwardReturn60d >= 0 ? '#4E6040' : 'var(--primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  Forward 60d: {a.forwardReturn60d >= 0 ? '+' : ''}{a.forwardReturn60d.toFixed(2)}%
                </p>
              )}
              {a.note && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                  {a.note}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {payload.note && (
        <p style={{ margin: 0, fontSize: 10, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
          {payload.note}
        </p>
      )}
    </div>
  );
};

const PercentileBar: React.FC<{ value: number; label?: string }> = ({ value, label }) => {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 600 }}>
          {label ?? 'Percentile vs lookback'}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(pct * 100)}th
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--muted)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct * 100}%`,
            background: pct > 0.85 || pct < 0.15 ? 'var(--primary)' : 'var(--muted-foreground)',
            borderRadius: 999,
            transition: 'width 400ms ease',
          }}
        />
      </div>
    </div>
  );
};
