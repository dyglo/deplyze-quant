/**
 * RelatedSection — correlated / linked assets.
 *
 * Wave B: renders payload list + click-through.
 * Wave D/G: payloads populated from `quant/crossAsset.ts` + correlation engine.
 */
import React from 'react';
import { SectionShell, SectionEmpty } from './SectionShell';
import type { IntelligenceSectionProps, RelatedPayload } from './types';

interface Props extends IntelligenceSectionProps {
  payload?: RelatedPayload;
}

export const RelatedSection: React.FC<Props> = ({ payload }) => {
  const assets = payload?.assets ?? [];
  return (
    <SectionShell label="Related Assets" badge={assets.length ? <Count n={assets.length} /> : null}>
      {!assets.length && <SectionEmpty message="No correlated assets surfaced yet." />}
      {assets.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {assets.map((a) => {
            const corr = a.correlation;
            const cp = a.changePercent;
            return (
              <button
                key={a.symbol}
                onClick={a.onClick}
                disabled={!a.onClick}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 7,
                  border: '1px solid var(--border)',
                  background: 'var(--muted)',
                  cursor: a.onClick ? 'pointer' : 'default',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'border-color 120ms',
                }}
                onMouseEnter={(e) => {
                  if (a.onClick) (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                }}
              >
                <span style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--foreground)',
                  letterSpacing: '0.02em',
                  minWidth: 60,
                }}>
                  {a.symbol}
                </span>
                {a.label && (
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.label}
                  </span>
                )}
                {corr != null && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'var(--card)',
                    color: corr > 0 ? '#4E6040' : 'var(--primary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    ρ {corr >= 0 ? '+' : ''}{corr.toFixed(2)}
                  </span>
                )}
                {cp != null && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: cp >= 0 ? '#4E6040' : 'var(--primary)',
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 56,
                    textAlign: 'right',
                  }}>
                    {cp >= 0 ? '+' : ''}{cp.toFixed(2)}%
                  </span>
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

const Count: React.FC<{ n: number }> = ({ n }) => (
  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)' }}>{n}</span>
);
