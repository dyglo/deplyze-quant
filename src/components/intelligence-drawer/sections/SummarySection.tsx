/**
 * SummarySection — the lead interpretation banner.
 *
 * Wave B: renders payload-driven banner. Wave C populates payloads from
 * `lib/intelligence/summaries/*` (per-page narrative generators).
 */
import React from 'react';
import { SectionShell, SectionEmpty, SectionLoading } from './SectionShell';
import type { IntelligenceSectionProps, SummaryPayload } from './types';

interface Props extends IntelligenceSectionProps {
  payload?: SummaryPayload;
}

const TONE_COLOR: Record<NonNullable<SummaryPayload['tone']>, string> = {
  positive: 'var(--ds-gain, #4E6040)',
  negative: 'var(--ds-loss, var(--primary))',
  warning: '#C9A227',
  neutral: 'var(--muted-foreground)',
};

export const SummarySection: React.FC<Props> = ({ payload, state, error }) => {
  return (
    <SectionShell label="Summary" flush>
      {state === 'loading' && <SectionLoading />}
      {state === 'error' && <SectionEmpty message={error ?? 'Could not load summary.'} />}
      {!state && !payload && <SectionEmpty message="Summary unavailable for this instrument." />}
      {payload && (
        <SummaryBanner payload={payload} />
      )}
    </SectionShell>
  );
};

const SummaryBanner: React.FC<{ payload: SummaryPayload }> = ({ payload }) => {
  const color = TONE_COLOR[payload.tone ?? 'neutral'];
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 10,
        background: `color-mix(in srgb, ${color} 8%, var(--card))`,
        border: `1px solid color-mix(in srgb, ${color} 22%, var(--border))`,
      }}
    >
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.35 }}>
        {payload.headline}
      </p>
      {payload.body && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
          {payload.body}
        </p>
      )}
      {payload.signals && payload.signals.length > 0 && (
        <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {payload.signals.map((s, i) => (
            <li key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: color, marginTop: 6, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--foreground)', lineHeight: 1.45 }}>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
