import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

export interface MenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

export const OptionsMenu: React.FC<{ items: MenuItem[]; ariaLabel?: string }> = ({
  items, ariaLabel = 'Widget options',
}) => {
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

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
        style={iconBtn}
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div role="menu" style={menu}>
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); it.onSelect(); }}
              style={{
                ...menuItem,
                color: it.danger ? 'var(--destructive, #c75450)' : 'var(--foreground)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--muted)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              {it.icon && <span style={{ display: 'inline-flex', width: 14, justifyContent: 'center' }}>{it.icon}</span>}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
};

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24,
  border: 'none',
  background: 'transparent',
  color: 'var(--muted-foreground)',
  borderRadius: 6,
  cursor: 'pointer',
};

const menu: React.CSSProperties = {
  position: 'absolute',
  top: '100%', right: 0,
  marginTop: 4,
  minWidth: 180,
  background: 'var(--popover, var(--card))',
  border: '1px solid var(--border)',
  borderRadius: 8,
  boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
  padding: 4,
  zIndex: 10,
};

const menuItem: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', textAlign: 'left',
  padding: '6px 8px',
  border: 'none', background: 'transparent',
  fontSize: 12,
  borderRadius: 4,
  cursor: 'pointer',
};
