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
import { ChevronDown, SlidersHorizontal, ArrowLeft, Plus, Bookmark, Pencil, Download, FileText, FileJson, Printer, FileType2 } from 'lucide-react';
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
  /** 'idle' | 'saving' | 'saved' | 'error' — surfaces a pill state for the Save action. */
  saveState?: 'idle' | 'saving' | 'saved' | 'error';
  /** Export actions — only shown when the report is saved. */
  onExportPdf?: () => void;
  onExportMarkdown?: () => void;
  onExportJson?: () => void;
  onPrint?: () => void;
}

export const ResultToolbar: React.FC<ResultToolbarProps> = ({
  lookbackYears, onLookbackChange, onRefine, refineDirty,
  editWidgetsSlot, onBack, onEditQuery, onNew, onSave, saveDisabled = true,
  saveState = 'idle',
  onExportPdf, onExportMarkdown, onExportJson, onPrint,
}) => {
  const exportAvailable = saveState === 'saved';
  const saveLabel =
    saveState === 'saving' ? 'Saving…' :
    saveState === 'saved'  ? 'Saved' :
    saveState === 'error'  ? 'Save failed' :
                              'Save';

  const menu: MenuItem[] = [
    { id: 'back',  label: 'Back to landing', icon: <ArrowLeft size={12} />, onSelect: onBack },
    { id: 'edit',  label: 'Edit query',      icon: <Pencil size={12} />,    onSelect: onEditQuery },
    { id: 'new',   label: 'New report',        icon: <Plus size={12} />,    onSelect: onNew },
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
      <button
        type="button"
        onClick={() => { if (!saveDisabled) onSave?.(); }}
        disabled={saveDisabled}
        style={{ ...pillStyle(saveState === 'saved'), opacity: saveDisabled ? 0.55 : 1 }}
        title={saveDisabled && saveState === 'idle' ? 'Sign in to save' : saveLabel}
      >
        <Bookmark size={12} />
        <span>{saveLabel}</span>
      </button>
      {exportAvailable && (
        <ExportPill
          onPdf={onExportPdf}
          onMarkdown={onExportMarkdown}
          onJson={onExportJson}
          onPrint={onPrint}
        />
      )}
      <OptionsMenu items={menu} ariaLabel="Deep Research actions" />
    </div>
  );
};

// ─── Export pill ─────────────────────────────────────────────────────────

interface ExportPillProps {
  onPdf?: () => void;
  onMarkdown?: () => void;
  onJson?: () => void;
  onPrint?: () => void;
}

const ExportPill: React.FC<ExportPillProps> = ({ onPdf, onMarkdown, onJson, onPrint }) => {
  const [open, setOpen] = useState(false);
  const items: { id: string; label: string; icon: React.ReactNode; onSelect?: () => void }[] = [
    { id: 'pdf',      label: 'Download PDF',      icon: <FileType2 size={12} />, onSelect: onPdf },
    { id: 'md',       label: 'Download Markdown', icon: <FileText size={12} />,  onSelect: onMarkdown },
    { id: 'json',     label: 'Download JSON',     icon: <FileJson size={12} />,  onSelect: onJson },
    { id: 'print',    label: 'Print…',            icon: <Printer size={12} />,   onSelect: onPrint },
  ];
  return (
    <span style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={pillStyle(false)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={12} />
        <span>Export</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div role="menu" style={exportPopover} onMouseLeave={() => setOpen(false)}>
          {items.map((it) => (
            <button
              key={it.id}
              role="menuitem"
              type="button"
              onClick={() => { setOpen(false); it.onSelect?.(); }}
              style={exportItem}
            >
              <span style={{ display: 'inline-flex', width: 14, justifyContent: 'center' }}>{it.icon}</span>
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
};

const exportPopover: React.CSSProperties = {
  position: 'absolute', top: '100%', right: 0,
  marginTop: 4,
  minWidth: 180,
  border: '1px solid var(--border)',
  background: 'var(--popover, var(--card))',
  borderRadius: 8,
  padding: 4,
  boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
  zIndex: 20,
};

const exportItem: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', textAlign: 'left',
  padding: '6px 10px',
  border: 'none', background: 'transparent',
  color: 'var(--foreground)',
  fontSize: 12,
  borderRadius: 4,
  cursor: 'pointer',
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
