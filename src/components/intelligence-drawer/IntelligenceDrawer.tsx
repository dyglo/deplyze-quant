/**
 * IntelligenceDrawer — universal slide-over chrome for institutional context.
 *
 * This is the shell. It provides:
 *   • slide-over positioning (fixed right, backdrop, ESC, focus restore)
 *   • header slot (title / subtitle / actions / close)
 *   • scrollable body that renders arbitrary `children`
 *   • a `sections` prop that toggles standard intelligence sections
 *     (Summary / Historical / Related / Narrative / Macro / Linked)
 *     which pages opt into à la carte. Sections render their own scaffold
 *     and empty states; later waves wire real data.
 *
 * Content composition pattern: pages pass page-specific content as
 * `children`; the standard section scaffolds are appended below.
 */
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { SummarySection } from './sections/SummarySection';
import { HistoricalSection } from './sections/HistoricalSection';
import { RelatedSection } from './sections/RelatedSection';
import { NarrativeSection } from './sections/NarrativeSection';
import { MacroSection } from './sections/MacroSection';
import { LinkedSection } from './sections/LinkedSection';
import type { IntelligenceSectionProps } from './sections/types';

export type IntelligenceSectionKey =
  | 'summary'
  | 'historical'
  | 'related'
  | 'narrative'
  | 'macro'
  | 'linked';

export interface IntelligenceDrawerSectionConfig extends IntelligenceSectionProps {
  /** Hide this section even when its prop bag is present. */
  hidden?: boolean;
}

export interface IntelligenceDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Slide-over width. Default 480, capped at 96vw. */
  width?: number;
  /** Title text or full node rendered in the drawer header. */
  title?: React.ReactNode;
  /** Optional one-line subtitle under the title. */
  subtitle?: React.ReactNode;
  /** Right-aligned content in the header (e.g. price, regime badge). */
  headerExtra?: React.ReactNode;
  /** Page-specific content rendered at the top of the scrollable body. */
  children?: React.ReactNode;
  /** Per-section props. Sections not present in the map are hidden. */
  sections?: Partial<Record<IntelligenceSectionKey, IntelligenceDrawerSectionConfig>>;
  /** Footer slot pinned below the body. */
  footer?: React.ReactNode;
  /** Stable id for deep-linking / a11y. Defaults to 'intelligence-drawer'. */
  drawerId?: string;
}

export const IntelligenceDrawer: React.FC<IntelligenceDrawerProps> = ({
  open,
  onClose,
  width = 480,
  title,
  subtitle,
  headerExtra,
  children,
  sections,
  footer,
  drawerId = 'intelligence-drawer',
}) => {
  const panelRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<Element | null>(null);

  // ESC to close, focus management.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (restoreFocusRef.current instanceof HTMLElement) {
        restoreFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, [open, onClose]);

  // Mounted-once: we still render closed for transition, but unmount fully
  // when neither open nor in the close-transition window. The parent decides.
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.28)',
          backdropFilter: 'blur(2px)',
          zIndex: 60,
          opacity: open ? 1 : 0,
          transition: 'opacity 200ms ease',
          pointerEvents: open ? 'auto' : 'none',
        }}
      />

      {/* Panel */}
      <aside
        ref={panelRef}
        id={drawerId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${drawerId}-title`}
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: `min(${width}px, 96vw)`,
          background: 'var(--background)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-20px 0 48px rgba(0,0,0,0.18)',
          zIndex: 61,
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 220ms cubic-bezier(0.16,1,0.3,1)',
          outline: 'none',
        }}
      >
        {/* Header */}
        {(title || headerExtra) && (
          <header
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {title && (
                <div
                  id={`${drawerId}-title`}
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--foreground)',
                    letterSpacing: '-0.01em',
                    lineHeight: 1.2,
                  }}
                >
                  {title}
                </div>
              )}
              {subtitle && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--muted-foreground)',
                    marginTop: 3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {subtitle}
                </div>
              )}
            </div>
            {headerExtra && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {headerExtra}
              </div>
            )}
            <button
              onClick={onClose}
              aria-label="Close drawer"
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--muted-foreground)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <X size={14} />
            </button>
          </header>
        )}

        {/* Body (scrollable) */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}

          {sections && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {!sections.summary?.hidden && sections.summary && (
                <SummarySection {...sections.summary} />
              )}
              {!sections.macro?.hidden && sections.macro && (
                <MacroSection {...sections.macro} />
              )}
              {!sections.narrative?.hidden && sections.narrative && (
                <NarrativeSection {...sections.narrative} />
              )}
              {!sections.historical?.hidden && sections.historical && (
                <HistoricalSection {...sections.historical} />
              )}
              {!sections.related?.hidden && sections.related && (
                <RelatedSection {...sections.related} />
              )}
              {!sections.linked?.hidden && sections.linked && (
                <LinkedSection {...sections.linked} />
              )}
            </div>
          )}
        </div>

        {footer && (
          <div
            style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border)',
              flexShrink: 0,
              background: 'var(--card)',
            }}
          >
            {footer}
          </div>
        )}
      </aside>
    </>
  );
};
