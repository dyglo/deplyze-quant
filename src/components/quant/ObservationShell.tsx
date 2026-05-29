/**
 * ObservationShell — the single shared layout for an intelligence observation
 * row. Both IntelligenceObservationCard and ContextualReasoningCard compose it
 * so every feed row shares one calm structure:
 *
 *   [severity dot]  meta · meta            [confidence]  [chevron]
 *                   Title leads
 *                   one-line summary (collapsed) / rich body (expanded)
 *
 * Calm institutional defaults: a quiet severity dot (not a filled pip), a
 * title-led hierarchy, demoted metadata, and a deliberate 3-tier type scale
 * (title 12 / body 11 / meta 10) instead of per-card micro-typography.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AgentSeverity } from '../../types/agents';
import { severityConfig } from '../../lib/semanticPalette';
import { ConfidenceBadge } from './ConfidenceBadge';

export interface ObservationShellProps {
  severity?: AgentSeverity;
  /** Quiet metadata nodes shown above the title (domain, synthesis label, signals). */
  meta?: React.ReactNode;
  title: React.ReactNode;
  confidence?: number | null;
  /** One-line summary shown while collapsed. */
  summary?: React.ReactNode;
  /** Footer (e.g. timestamp) rendered at the end of the expanded body. */
  footer?: React.ReactNode;
  defaultExpanded?: boolean;
  compact?: boolean;
  /** Expanded body. If omitted (and no footer), the row is not expandable. */
  children?: React.ReactNode;
}

export const ObservationShell: React.FC<ObservationShellProps> = ({
  severity = 'info',
  meta,
  title,
  confidence,
  summary,
  footer,
  defaultExpanded = false,
  compact = false,
  children,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const sev = severityConfig(severity);
  const expandable = children != null || footer != null;
  const pad = compact ? '8px 12px' : '10px 14px';
  const indent = compact ? 26 : 28;

  return (
    <article className="ds-surface" style={{ overflow: 'hidden' }}>
      <div
        className="ds-transition-fast"
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, padding: pad,
          cursor: expandable ? 'pointer' : 'default', userSelect: 'none',
        }}
        onClick={expandable ? () => setExpanded(e => !e) : undefined}
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        onKeyDown={expandable ? (e) => e.key === 'Enter' && setExpanded(v => !v) : undefined}
      >
        {/* Severity dot — single calm severity cue */}
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: sev.color, flexShrink: 0, marginTop: 5 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {meta && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
              {meta}
            </div>
          )}
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.35 }}>
            {title}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {confidence != null && <ConfidenceBadge score={confidence} />}
          {expandable && (expanded
            ? <ChevronDown size={12} color="var(--muted-foreground)" />
            : <ChevronRight size={12} color="var(--muted-foreground)" />)}
        </div>
      </div>

      {/* Collapsed summary */}
      {!expanded && summary && (
        <p style={{
          margin: 0, padding: compact ? `0 12px 8px ${indent}px` : `0 14px 10px ${indent}px`,
          fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5,
        }}>
          {summary}
        </p>
      )}

      {/* Expanded body */}
      {expanded && expandable && (
        <div style={{
          padding: compact ? '8px 12px 10px' : '10px 14px 12px',
          borderTop: '1px solid var(--border)',
        }}>
          {children}
          {footer && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 8, fontSize: 10, color: 'var(--muted-foreground)' }}>
              {footer}
            </div>
          )}
        </div>
      )}
    </article>
  );
};

/** Quiet metadata label used in observation meta rows. */
export const ObservationMeta: React.FC<{ color?: string; children: React.ReactNode }> = ({ color, children }) => (
  <span style={{
    fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: color ?? 'var(--muted-foreground)',
  }}>
    {children}
  </span>
);
