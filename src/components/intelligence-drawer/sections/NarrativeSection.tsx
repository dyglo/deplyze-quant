/**
 * NarrativeSection — active themes affecting the instrument / dashboard.
 *
 * Wave B: scaffold with payload renderer.
 * Wave E: `lib/intelligence/narrativeOverlays.ts` derives payload from
 * `narrativeProducer` output and `narrative_memory` Firestore.
 */
import React from 'react';
import { SectionShell, SectionEmpty } from './SectionShell';
import type { IntelligenceSectionProps, NarrativePayload } from './types';

interface Props extends IntelligenceSectionProps {
  payload?: NarrativePayload;
}

export const NarrativeSection: React.FC<Props> = ({ payload }) => {
  const themes = payload?.themes ?? [];
  return (
    <SectionShell label="Narrative Exposure">
      {!themes.length && <SectionEmpty message="No active narrative themes attached to this instrument." />}
      {themes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {themes.map((t, i) => {
            const strength = t.strength ?? 0;
            return (
              <button
                key={i}
                onClick={t.onClick}
                disabled={!t.onClick}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 7,
                  border: '1px solid var(--border)',
                  background: 'var(--muted)',
                  cursor: t.onClick ? 'pointer' : 'default',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>{t.label}</span>
                  {strength > 0 && (
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 999,
                      background: `color-mix(in srgb, var(--primary) ${Math.round(strength * 30)}%, var(--card))`,
                      color: 'var(--primary)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {Math.round(strength * 100)}
                    </span>
                  )}
                </div>
                {t.body && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                    {t.body}
                  </p>
                )}
              </button>
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
