/**
 * EventsToggle — small inline control rendered above a time-series chart that
 * lets the user pick which event categories overlay on the chart (recessions,
 * conflicts, financial crises, policy regimes, shocks, trade tensions).
 *
 * Sits inside the widget body rather than the widget header so it stays out of
 * the way of the global Refine / Edit-widgets controls in the page toolbar.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { EVENT_CATEGORIES, type EventCategory } from './events';

interface Props {
  enabled: Set<EventCategory>;
  onChange: (next: Set<EventCategory>) => void;
}

export const EventsToggle: React.FC<Props> = ({ enabled, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (id: EventCategory) => {
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };
  const reset = () => onChange(new Set(['recession']));

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={triggerBtn}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {EVENT_CATEGORIES.filter((c) => enabled.has(c.id)).slice(0, 4).map((c) => (
            <span
              key={c.id}
              title={c.label}
              style={{ width: 8, height: 8, borderRadius: 2, background: c.tint }}
            />
          ))}
        </span>
        <span>Events</span>
        <ChevronDown size={11} />
      </button>
      {open && (
        <div role="menu" style={panelStyle}>
          <div style={panelHeader}>
            <span style={{
              fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
              color: 'var(--muted-foreground)',
            }}>Overlay categories</span>
            <button type="button" onClick={reset} style={resetBtn}>
              <RotateCcw size={10} />Reset
            </button>
          </div>
          <ul style={list}>
            {EVENT_CATEGORIES.map((c) => {
              const on = enabled.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => toggle(c.id)}
                    style={item}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--muted)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  >
                    <span
                      style={{
                        width: 14, height: 14, borderRadius: 3,
                        border: '1px solid ' + (on ? c.tint : 'var(--border)'),
                        background: on ? c.tint : 'transparent',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {on && (
                        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
                          <path d="M2.5 6.2 L5 8.7 L9.5 3.5" stroke="#fff" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      )}
                    </span>
                    {c.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

// ─── styles ───────────────────────────────────────────────────────────────

const triggerBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 10px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 500,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--foreground)',
  cursor: 'pointer',
};

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%', right: 0,
  marginTop: 4,
  minWidth: 200,
  background: 'var(--popover, var(--card))',
  border: '1px solid var(--border)',
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
  padding: 8,
  zIndex: 25,
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

const item: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', textAlign: 'left',
  padding: '6px 8px',
  border: 'none', background: 'transparent',
  color: 'var(--foreground)',
  fontSize: 12,
  borderRadius: 4,
  cursor: 'pointer',
};
