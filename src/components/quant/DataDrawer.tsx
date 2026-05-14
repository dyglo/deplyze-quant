import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { X } from 'lucide-react';

export interface DrawerContent {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  body: React.ReactNode;
  width?: number;
}

interface DrawerCtx {
  open: (content: DrawerContent) => void;
  close: () => void;
  isOpen: boolean;
}

const Ctx = createContext<DrawerCtx | null>(null);

export const useDrawer = (): DrawerCtx => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDrawer must be inside <DrawerProvider>');
  return v;
};

export const DrawerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [content, setContent] = useState<DrawerContent | null>(null);

  const open = useCallback((c: DrawerContent) => setContent(c), []);
  const close = useCallback(() => setContent(null), []);

  // ESC to close
  React.useEffect(() => {
    if (!content) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [content, close]);

  const value = useMemo(() => ({ open, close, isOpen: content != null }), [open, close, content]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {content && (
        <>
          {/* Backdrop */}
          <div
            onClick={close}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)',
              backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
              zIndex: 60, animation: 'ds-fade 160ms ease',
            }}
          />
          {/* Panel */}
          <aside
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: 0, right: 0, bottom: 0,
              width: `min(${content.width ?? 520}px, 96vw)`,
              background: 'var(--background)',
              borderLeft: '1px solid var(--border)',
              boxShadow: '-20px 0 40px rgba(0,0,0,0.20)',
              zIndex: 61,
              display: 'flex', flexDirection: 'column',
              animation: 'ds-slide-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <header
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>
                  {content.title}
                </div>
                {content.subtitle && (
                  <div style={{ marginTop: 2, fontSize: 11, color: 'var(--muted-foreground)' }}>
                    {content.subtitle}
                  </div>
                )}
              </div>
              <button
                onClick={close}
                aria-label="Close"
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--muted-foreground)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={14} />
              </button>
            </header>
            <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
              {content.body}
            </div>
          </aside>
          <style>{`
            @keyframes ds-fade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes ds-slide-in {
              from { transform: translateX(24px); opacity: 0 }
              to   { transform: translateX(0);    opacity: 1 }
            }
          `}</style>
        </>
      )}
    </Ctx.Provider>
  );
};
