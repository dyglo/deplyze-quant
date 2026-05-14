import React from 'react';
import { SourceBadge } from './FreshnessBadge';

export interface DatasetInfo {
  zone: string;
  name: string;
  provider: string;
  cadence: string;
  description: string;
  schema: Array<{ field: string; type: string; note?: string }>;
  qualityNotes: string[];
  status: 'planned' | 'wired' | 'partial';
}

const STATUS_COLOR: Record<DatasetInfo['status'], string> = {
  planned: 'var(--muted-foreground)',
  partial: '#9e7e3a',
  wired:   '#4E6040',
};

export const DatasetDrawerBody: React.FC<{ ds: DatasetInfo }> = ({ ds }) => (
  <div style={{ display: 'grid', gap: 14 }}>
    <section style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <SourceBadge source={ds.provider} />
      <span style={{
        padding: '2px 8px', borderRadius: 999,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: STATUS_COLOR[ds.status],
        background: `color-mix(in srgb, ${STATUS_COLOR[ds.status]} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${STATUS_COLOR[ds.status]} 30%, transparent)`,
      }}>
        {ds.status}
      </span>
      <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
        cadence · {ds.cadence}
      </span>
    </section>

    <p className="ds-body" style={{ margin: 0, color: 'var(--foreground)', lineHeight: 1.5 }}>
      {ds.description}
    </p>

    <section>
      <h3 className="ds-heading" style={{ margin: '0 0 6px' }}>Schema</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ color: 'var(--muted-foreground)', textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.06em' }}>
            <th style={{ textAlign: 'left', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Field</th>
            <th style={{ textAlign: 'left', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Type</th>
            <th style={{ textAlign: 'left', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Note</th>
          </tr>
        </thead>
        <tbody>
          {ds.schema.map((f) => (
            <tr key={f.field}>
              <td style={{ padding: '5px 0', fontFamily: 'ui-monospace, monospace', color: 'var(--foreground)' }}>{f.field}</td>
              <td style={{ padding: '5px 0', color: 'var(--muted-foreground)' }}>{f.type}</td>
              <td style={{ padding: '5px 0', color: 'var(--muted-foreground)' }}>{f.note ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>

    <section>
      <h3 className="ds-heading" style={{ margin: '0 0 6px' }}>Data quality notes</h3>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
        {ds.qualityNotes.map((n, i) => (
          <li key={i} className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>{n}</li>
        ))}
      </ul>
    </section>

    <section className="ds-surface" style={{ padding: 10, borderRadius: 8 }}>
      <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
        Sample rows are not yet wired — BigQuery zones land in a later phase. Data already flowing through the
        gateway cache for this provider is read on-demand by the relevant page (Intelligence Terminal,
        Instrument Detail, Macro Regime Desk).
      </p>
    </section>
  </div>
);
