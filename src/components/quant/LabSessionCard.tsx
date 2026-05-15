import React from 'react';
import { Trash2, FlaskConical } from 'lucide-react';
import type { LabSession } from '../../types';

export const LabSessionCard: React.FC<{
  session: LabSession;
  onDelete: (id: string) => void;
}> = ({ session, onDelete }) => (
  <article
    className="ds-surface"
    style={{ padding: '14px 16px', borderRadius: 10, display: 'grid', gap: 8 }}
  >
    <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <FlaskConical size={14} style={{ color: 'var(--muted-foreground)' }} />
        <span className="ds-label" style={{ color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>
          {session.panel} · {session.timeframe}
        </span>
      </div>
      <button
        onClick={() => onDelete(session.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 2, display: 'flex' }}
        title="Delete session"
      >
        <Trash2 size={13} />
      </button>
    </header>

    <h4 className="ds-body" style={{ margin: 0, fontWeight: 700 }}>{session.name}</h4>

    <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
      {session.symbols.join(', ')}
    </p>

    {Object.keys(session.summary).length > 0 && (
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        {Object.entries(session.summary).map(([k, v]) => (
          <li key={k} className="ds-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: 'var(--muted-foreground)' }}>{k}:</span> {String(v)}
          </li>
        ))}
      </ul>
    )}

    <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
      {new Date(session.createdAt).toLocaleString()}
    </p>
  </article>
);
