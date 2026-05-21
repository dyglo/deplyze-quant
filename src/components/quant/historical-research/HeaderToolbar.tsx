/**
 * HeaderToolbar — right-aligned pill controls that sit in the page header,
 * mirroring the "This Month / Compare: Last Month / Edit Widget" pattern in
 * the Bagus Fikri reference.
 *
 * Reused on both landing (with a minimal set: Edit widgets + ⋮) and result
 * surfaces (with the full set: Lookback / Refine / Edit widgets / ⋮).
 *
 * Visual model: every control is a pill the same height. Active state
 * inverts foreground/background.
 */

import React, { useState } from 'react';
import { ChevronDown, SlidersHorizontal, ArrowLeft, Plus, Bookmark, Pencil } from 'lucide-react';
import { OptionsMenu, type MenuItem } from './OptionsMenu';

interface LookbackPillProps {
  value: number;            // years
  options?: number[];
  onChange: (years: number) => void;
}

const LookbackPill: React.FC<LookbackPillProps> = ({ value, options = [1, 3, 5, 10, 20], onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={pillStyle(true)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>Lookback: {value}Y</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          role="listbox"
          style={popoverStyle}
          onMouseLeave={() => setOpen(false)}
        >
          {options.map((y) => (
            <button
              key={y}
              type="button"
              role="option"
              aria-selected={y === value}
              onClick={() => { setOpen(false); onChange(y); }}
              style={{
                ...popoverItem,
                background: y === value ? 'var(--muted)' : 'transparent',
                fontWeight: y === value ? 500 : 400,
              }}
            >
              {y}Y
            </button>
          ))}
        </div>
      )}
    </span>
  );
};

// ─── Result toolbar ──────────────────────────────────────────────────────

interface ResultToolbarProps {
  lookbackYears: number;
  onLookbackChange: (years: number) => void;
  onRefine: () => void;
  refineDirty?: boolean;
  editWidgetsSlot?: React.ReactNode;
  onBack: () => void;
  onEditQuery: () => void;
  onNew: () => void;
  onSave?: () => void;
  saveDisabled?: boolean;
}

export const ResultToolbar: React.FC<ResultToolbarProps> = ({
  lookbackYears, onLookbackChange, onRefine, refineDirty,
  editWidgetsSlot, onBack, onEditQuery, onNew, onSave, saveDisabled = true,
}) => {
  const menu: MenuItem[] = [
    { id: 'back',  label: 'Back to landing', icon: <ArrowLeft size={12} />, onSelect: onBack },
    { id: 'edit',  label: 'Edit query',      icon: <Pencil size={12} />,    onSelect: onEditQuery },
    { id: 'save',  label: saveDisabled ? 'Save (soon)' : 'Save investigation', icon: <Bookmark size={12} />, onSelect: () => { if (!saveDisabled) onSave?.(); } },
    { id: 'new',   label: 'New investigation', icon: <Plus size={12} />,    onSelect: onNew },
  ];

  return (
    <div style={toolbar}>
      <LookbackPill value={lookbackYears} onChange={onLookbackChange} />
      <button type="button" onClick={onRefine} style={pillStyle(false)}>
        <SlidersHorizontal size={12} />
        <span>Refine</span>
        {refineDirty && <span style={dirtyDot} />}
      </button>
      {editWidgetsSlot}
      <OptionsMenu items={menu} ariaLabel="Investigation actions" />
    </div>
  );
};

// ─── Landing toolbar ─────────────────────────────────────────────────────

interface LandingToolbarProps {
  rightSlot?: React.ReactNode;
}

export const LandingToolbar: React.FC<LandingToolbarProps> = ({ rightSlot }) => {
  return <div style={toolbar}>{rightSlot}</div>;
};

// ─── shared styles ───────────────────────────────────────────────────────

const toolbar: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
};

const pillStyle = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 12px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 500,
  border: '1px solid ' + (active ? 'var(--foreground)' : 'var(--border)'),
  background: active ? 'var(--foreground)' : 'transparent',
  color: active ? 'var(--background)' : 'var(--foreground)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

const dirtyDot: React.CSSProperties = {
  width: 6, height: 6, borderRadius: '50%',
  background: 'var(--primary)',
  marginLeft: 2,
};

const popoverStyle: React.CSSProperties = {
  position: 'absolute', top: '100%', right: 0,
  marginTop: 4,
  minWidth: 100,
  border: '1px solid var(--border)',
  background: 'var(--popover, var(--card))',
  borderRadius: 8,
  padding: 4,
  boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
  zIndex: 20,
};

const popoverItem: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '6px 10px',
  border: 'none', background: 'transparent',
  color: 'var(--foreground)',
  fontSize: 12,
  borderRadius: 4,
  cursor: 'pointer',
};
