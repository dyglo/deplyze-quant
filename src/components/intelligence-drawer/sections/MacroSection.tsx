/**
 * MacroSection — current macro context (regime / curve / dollar / real-rate).
 *
 * Wave B: scaffold with payload renderer.
 * Wave C/D: macro selectors share state across dashboards via lightweight hook
 * (`lib/intelligence/macroContext.ts`).
 */
import React from 'react';
import { SectionShell, SectionEmpty } from './SectionShell';
import type { IntelligenceSectionProps, MacroPayload, MacroIndicator } from './types';

interface Props extends IntelligenceSectionProps {
  payload?: MacroPayload;
}

const TONE_COLOR: Record<NonNullable<MacroIndicator['tone']>, string> = {
  positive: '#4E6040',
  negative: 'var(--primary)',
  warning: '#C9A227',
  neutral: 'var(--muted-foreground)',
};

export const MacroSection: React.FC<Props> = ({ payload }) => {
  const indicators = payload?.indicators ?? [];
  return (
    <SectionShell label="Macro Context" badge={payload?.regime ? <RegimePill label={payload.regime} /> : null}>
      {!indicators.length && !payload?.note && (
        <SectionEmpty message="No macro indicators wired for this instrument yet." />
      )}
      {indicators.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {indicators.map((ind, i) => {
            const color = TONE_COLOR[ind.tone ?? 'neutral'];
            return (
              <div
                key={i}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'var(--muted)',
                  border: '1px solid var(--border)',
                }}
              >
                <p style={{
                  margin: 0,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--muted-foreground)',
                }}>
                  {ind.label}
                </p>
                <p style={{
                  margin: '3px 0 0',
                  fontSize: 13,
                  fontWeight: 700,
                  color,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {ind.value ?? '—'}
                </p>
                {ind.hint && (
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>{ind.hint}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {payload?.note && (
        <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
          {payload.note}
        </p>
      )}
    </SectionShell>
  );
};

const RegimePill: React.FC<{ label: string }> = ({ label }) => (
  <span style={{
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 999,
    background: 'color-mix(in srgb, var(--primary) 10%, var(--card))',
    color: 'var(--primary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }}>
    {label}
  </span>
);
