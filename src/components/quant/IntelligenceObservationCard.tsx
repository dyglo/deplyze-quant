/**
 * IntelligenceObservationCard — renders a single AgentOutput as an
 * institutional intelligence observation. No agent avatars, no chat bubbles.
 * Pure information: domain, severity, title, summary, confidence, evidence.
 *
 * Composes the shared ObservationShell so it matches every other feed row.
 */

import React from 'react';
import type { AgentOutput, AgentDomain, AgentSeverity } from '../../types/agents';
import { AGENT_DOMAIN_LABELS } from '../../types/agents';
import { domainAccent } from '../../lib/semanticPalette';
import { ObservationShell, ObservationMeta } from './ObservationShell';

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso.slice(0, 16); }
}

export const IntelligenceObservationCard: React.FC<{
  output: AgentOutput;
  expanded?: boolean;
  compact?: boolean;
  onSymbolClick?: (symbol: string) => void;
}> = ({ output, expanded = false, compact = false, onSymbolClick }) => {
  const domain = output.domain as AgentDomain;
  const severity = (output.severity ?? 'info') as AgentSeverity;
  const domainLabel = AGENT_DOMAIN_LABELS[domain] ?? domain;

  const hasBody = !!output.summary || output.symbols?.length > 0 || output.tags?.length > 0;

  return (
    <ObservationShell
      severity={severity}
      compact={compact}
      defaultExpanded={expanded}
      meta={<ObservationMeta color={domainAccent(domain)}>{domainLabel}</ObservationMeta>}
      title={output.title}
      confidence={output.confidence}
      summary={hasBody ? output.summary : undefined}
      footer={fmtDate(output.generated_at)}
    >
      {/* Summary */}
      {output.summary && (
        <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--foreground)', lineHeight: 1.6 }}>
          {output.summary}
        </p>
      )}

      {/* Symbols — quiet inline links */}
      {output.symbols?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
          {output.symbols.slice(0, 10).map(sym => (
            <button
              key={sym}
              onClick={e => { e.stopPropagation(); onSymbolClick?.(sym); }}
              style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                color: 'var(--primary)', background: 'none', border: 'none', padding: 0,
                cursor: onSymbolClick ? 'pointer' : 'default',
              }}
            >
              {sym}
            </button>
          ))}
        </div>
      )}

      {/* Tags — quiet, no chrome */}
      {output.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 10, color: 'var(--muted-foreground)' }}>
          {output.tags.slice(0, 6).map(tag => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      )}
    </ObservationShell>
  );
};
