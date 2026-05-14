import React from 'react';
import { FlaskConical } from 'lucide-react';

/**
 * MockBanner — explicit visual marker that a page or section is showing
 * placeholder data because the backing system (BigQuery features, agentic
 * runs, etc.) is not yet wired up. Phase-1 honesty signal.
 */
export const MockBanner: React.FC<{ note?: string }> = ({ note }) => (
  <div
    role="note"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 12px',
      borderRadius: 8,
      background: 'rgba(201, 162, 39, 0.08)',
      border: '1px solid rgba(201, 162, 39, 0.24)',
      color: '#9A7B1D',
    }}
  >
    <FlaskConical size={14} />
    <span className="ds-caption">
      <strong style={{ fontWeight: 600, marginRight: 4 }}>Placeholder data.</strong>
      {note ?? 'This view ships in a later phase; the design and structure are real, the numbers are not.'}
    </span>
  </div>
);
