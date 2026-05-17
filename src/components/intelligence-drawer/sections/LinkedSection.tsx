/**
 * LinkedSection — cross-dashboard navigation that preserves context.
 *
 * Wave B: renders link list. Wave G: pages compute relevant links via
 * `lib/intelligence/crossLinks.ts` rules.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { SectionShell, SectionEmpty } from './SectionShell';
import type { IntelligenceSectionProps, LinkedPayload } from './types';

interface Props extends IntelligenceSectionProps {
  payload?: LinkedPayload;
}

export const LinkedSection: React.FC<Props> = ({ payload }) => {
  const dashboards = payload?.dashboards ?? [];
  return (
    <SectionShell label="Linked Dashboards">
      {!dashboards.length && <SectionEmpty message="No cross-dashboard links available." />}
      {dashboards.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {dashboards.map((d, i) => (
            <Link
              key={i}
              to={d.to}
              state={d.state}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 11px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--muted)',
                textDecoration: 'none',
                color: 'var(--foreground)',
                transition: 'border-color 120ms',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>{d.label}</p>
                {d.description && (
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>{d.description}</p>
                )}
                {d.filter && (
                  <p style={{ margin: '3px 0 0', fontSize: 9, color: 'var(--primary)', fontWeight: 600 }}>
                    Pre-filter: {d.filter}
                  </p>
                )}
              </div>
              <ArrowUpRight size={14} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
            </Link>
          ))}
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
