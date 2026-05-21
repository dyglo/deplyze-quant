/**
 * WidgetVisibilityMenu — popover that lets the user hide/show widgets on the
 * result surface, matching the reference's "Edit Widget" affordance.
 *
 * Stateless: the page owns the `WidgetVisibility` map and re-renders when the
 * user toggles. A "Reset" link restores all widgets to visible.
 */

import React, { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Eye, EyeOff, RotateCcw, Check } from 'lucide-react';

export interface WidgetEntry {
  id: string;
  label: string;
  visible: boolean;
}

interface Props {
  entries: WidgetEntry[];
  onToggle: (id: string) => void;
  onReset: () => void;
}

export const WidgetVisibilityMenu: React.FC<Props> = ({ entries, onToggle, onReset }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hiddenCount = entries.filter((e) => !e.visible).length;

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={triggerStyle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <LayoutGrid size={12} />
        <span>Edit widgets</span>
        {hiddenCount > 0 && (
          <span style={badge}>{hiddenCount}</span>
        )}
      </button>
      {open && (
        <div role="menu" style={panelStyle}>
          <div style={panelHeader}>
            <span style={{
              fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
              color: 'var(--muted-foreground)',
            }}>Widgets on this page</span>
            <button type="button" onClick={() => { onReset(); setOpen(false); }} style={resetBtn}>
              <RotateCcw size={11} />
              Reset
            </button>
          </div>
          <ul style={list}>
            {entries.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={e.visible}
                  onClick={() => onToggle(e.id)}
                  style={itemStyle}
                  onMouseEnter={(ev) => { (ev.currentTarget as HTMLButtonElement).style.background = 'var(--muted)'; }}
                  onMouseLeave={(ev) => { (ev.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>
                    {e.visible ? <Check size={12} /> : null}
                  </span>
                  <span style={{ flex: 1 }}>{e.label}</span>
                  <span style={{ color: 'var(--muted-foreground)' }}>
                    {e.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
};

// ─── styles ───────────────────────────────────────────────────────────────

const triggerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 12px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 500,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--foreground)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const badge: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 16, height: 16,
  padding: '0 5px',
  borderRadius: 999,
  background: 'var(--primary)',
  color: 'var(--primary-foreground)',
  fontSize: 10,
  fontWeight: 600,
};

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%', right: 0,
  marginTop: 6,
  minWidth: 240,
  background: 'var(--popover, var(--card))',
  border: '1px solid var(--border)',
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
  padding: 8,
  zIndex: 20,
};

const panelHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '4px 8px 8px',
  borderBottom: '1px solid var(--border)',
};

const resetBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: 'transparent',
  border: 'none',
  color: 'var(--muted-foreground)',
  fontSize: 11,
  cursor: 'pointer',
  padding: 0,
};

const list: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: 0,
  display: 'flex', flexDirection: 'column', gap: 2,
  paddingTop: 6,
};

const itemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', textAlign: 'left',
  padding: '6px 8px',
  border: 'none', background: 'transparent',
  color: 'var(--foreground)',
  fontSize: 12,
  borderRadius: 4,
  cursor: 'pointer',
};
