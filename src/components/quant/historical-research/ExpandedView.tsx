/**
 * ExpandedView — fullscreen overlay for a single widget.
 *
 * Renders the widget body at large size against a calm backdrop. The body is
 * exactly the same React tree as in the inline card, so charts and lists
 * stay identical — they just get more pixels to breathe.
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  caption?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const ExpandedView: React.FC<Props> = ({ title, caption, onClose, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={overlayStyle}
      onClick={onClose}
    >
      <div
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--foreground)' }}>{title}</div>
            {caption && (
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>{caption}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={closeBtn}
          >
            <X size={16} />
          </button>
        </header>
        <div style={bodyStyle}>{children}</div>
      </div>
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.4)',
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 32,
};

const panelStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 1100,
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '14px 20px',
  borderBottom: '1px solid var(--border)',
};

const closeBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--muted-foreground)',
  borderRadius: 6,
  cursor: 'pointer',
};

const bodyStyle: React.CSSProperties = {
  padding: '20px 24px',
  overflow: 'auto',
  flex: 1,
};
