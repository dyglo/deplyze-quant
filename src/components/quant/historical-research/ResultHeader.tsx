/**
 * ResultHeader — Deep Research result header strip.
 *
 * Sits at the top of the result surface and gives the user three explicit
 * affordances they're missing in V1: go back to landing, edit the query that
 * produced this result, or discard and start fresh.
 *
 * Save is rendered but inert in Slice A (wired in Slice C).
 */

import React from 'react';
import { ArrowLeft, Pencil, Plus, Bookmark } from 'lucide-react';

interface Props {
  query: string;
  onBack: () => void;
  onEdit: () => void;
  onNew: () => void;
  onSave?: () => void;
  saveDisabled?: boolean;
  saveLabel?: string;
}

export const ResultHeader: React.FC<Props> = ({
  query, onBack, onEdit, onNew, onSave, saveDisabled = true, saveLabel = 'Save',
}) => (
  <div style={wrap}>
    <button type="button" onClick={onBack} style={iconBtn} aria-label="Back to landing">
      <ArrowLeft size={14} />
      <span style={{ fontSize: 12 }}>Back</span>
    </button>

    <span style={separator} />

    <div style={{
      flex: 1, minWidth: 0,
      fontSize: 13, color: 'var(--foreground)',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }} title={query}>
      “{query}”
    </div>

    <button type="button" onClick={onEdit} style={ghostBtn} aria-label="Edit query">
      <Pencil size={12} />
      <span>Edit</span>
    </button>
    {onSave && (
      <button
        type="button"
        onClick={onSave}
        disabled={saveDisabled}
        style={{ ...ghostBtn, opacity: saveDisabled ? 0.45 : 1, cursor: saveDisabled ? 'not-allowed' : 'pointer' }}
        aria-label="Save report"
        title={saveDisabled ? 'Saving comes in a follow-up release' : 'Save report'}
      >
        <Bookmark size={12} />
        <span>{saveLabel}</span>
      </button>
    )}
    <button type="button" onClick={onNew} style={primaryGhost} aria-label="New report">
      <Plus size={12} />
      <span>New</span>
    </button>
  </div>
);

const wrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--card)',
};

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '4px 8px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--foreground)',
  cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 8px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--muted-foreground)',
  fontSize: 12,
  cursor: 'pointer',
};

const primaryGhost: React.CSSProperties = {
  ...ghostBtn,
  color: 'var(--foreground)',
};

const separator: React.CSSProperties = {
  width: 1, height: 16, background: 'var(--border)',
};
