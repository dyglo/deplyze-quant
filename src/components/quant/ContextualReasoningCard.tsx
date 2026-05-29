/**
 * ContextualReasoningCard — renders a multi-system synthesis observation.
 *
 * Distinguishes itself from a plain observation through a "synthesis" meta
 * label and matched-signal evidence, and renders the full reasoning body with
 * markdown support. Composes the shared ObservationShell for a consistent row.
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { AgentOutput, AgentSeverity } from '../../types/agents';
import { ObservationShell, ObservationMeta } from './ObservationShell';

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso.slice(0, 16); }
}

export const ContextualReasoningCard: React.FC<{
  output: AgentOutput;
  defaultExpanded?: boolean;
}> = ({ output, defaultExpanded = false }) => {
  const severity = (output.severity ?? 'info') as AgentSeverity;

  const ev = output.evidence as Record<string, unknown> | null;
  const matchedSignals = (ev?.matched_signals ?? ev?.all_signals ?? {}) as Record<string, string>;
  const signalPills = Object.entries(matchedSignals).slice(0, 6);

  const meta = (
    <>
      <ObservationMeta>Synthesis</ObservationMeta>
      {signalPills.map(([domain, signal]) => (
        <span key={domain} style={{
          fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
          background: 'var(--muted)', color: 'var(--muted-foreground)',
          letterSpacing: '0.03em', textTransform: 'uppercase',
        }}>
          {domain.replace('_', ' ')}: {signal}
        </span>
      ))}
    </>
  );

  return (
    <ObservationShell
      severity={severity}
      defaultExpanded={defaultExpanded}
      meta={meta}
      title={output.title}
      confidence={output.confidence}
      summary={output.summary}
      footer={fmtDate(output.generated_at)}
    >
      <div style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--foreground)' }}>
        <ReactMarkdown
          components={{
            p: ({ children }) => <p style={{ margin: '0 0 8px' }}>{children}</p>,
            strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
          }}
        >
          {output.body ?? output.summary ?? ''}
        </ReactMarkdown>
      </div>

      {/* Tags — quiet */}
      {output.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, fontSize: 10, color: 'var(--muted-foreground)' }}>
          {output.tags.slice(0, 6).map(t => (
            <span key={t}>#{t}</span>
          ))}
        </div>
      )}
    </ObservationShell>
  );
};
