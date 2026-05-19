/**
 * ContextualReasoningCard — renders a multi-system synthesis observation.
 *
 * Distinguishes itself from IntelligenceObservationCard through a "synthesis"
 * visual treatment: shows matched signal domains as evidence pills, and renders
 * the full reasoning body with markdown support.
 *
 * Institutional design: evidence-backed, confidence-scored, no chatbot aesthetics.
 */

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Layers, ChevronDown, ChevronRight } from 'lucide-react';
import type { AgentOutput, AgentSeverity } from '../../types/agents';
import { ConfidenceBadge } from './ConfidenceBadge';

const SEVERITY_BORDER: Record<AgentSeverity, string> = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    '#6b7280',
  info:   '#6366f1',
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso.slice(0, 16); }
}

export const ContextualReasoningCard: React.FC<{
  output: AgentOutput;
  defaultExpanded?: boolean;
}> = ({ output, defaultExpanded = false }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const severity = (output.severity ?? 'info') as AgentSeverity;
  const borderColor = SEVERITY_BORDER[severity];

  const ev = output.evidence as Record<string, unknown> | null;
  const matchedSignals = (ev?.matched_signals ?? ev?.all_signals ?? {}) as Record<string, string>;
  const signalPills = Object.entries(matchedSignals).slice(0, 6);

  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid var(--border)`,
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '10px 14px', cursor: 'pointer',
        }}
        onClick={() => setExpanded(e => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
      >
        <Layers size={12} color={borderColor} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{
              fontSize: 8, fontWeight: 800, letterSpacing: '0.08em',
              color: 'var(--muted-foreground)', textTransform: 'uppercase',
            }}>
              Synthesis
            </span>
            {signalPills.length > 0 && signalPills.map(([domain, signal]) => (
              <span key={domain} style={{
                fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                background: 'var(--muted)', color: 'var(--muted-foreground)',
                letterSpacing: '0.03em', textTransform: 'uppercase',
              }}>
                {domain.replace('_', ' ')}: {signal}
              </span>
            ))}
          </div>
          <p style={{
            margin: 0, fontSize: 11, fontWeight: 600,
            color: 'var(--foreground)', lineHeight: 1.35,
          }}>
            {output.title}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {output.confidence != null && <ConfidenceBadge score={output.confidence} />}
          {expanded
            ? <ChevronDown size={12} color="var(--muted-foreground)" />
            : <ChevronRight size={12} color="var(--muted-foreground)" />
          }
        </div>
      </div>

      {/* Summary always visible */}
      {!expanded && output.summary && (
        <p style={{
          margin: 0, padding: '0 14px 10px 34px',
          fontSize: 10, color: 'var(--muted-foreground)', lineHeight: 1.55,
        }}>
          {output.summary}
        </p>
      )}

      {/* Expanded body */}
      {expanded && (
        <div style={{
          padding: '8px 14px 12px 14px',
          borderTop: '1px solid var(--border)',
          fontSize: 10, lineHeight: 1.7, color: 'var(--foreground)',
        }}>
          <ReactMarkdown
            components={{
              p: ({ children }) => <p style={{ margin: '0 0 8px' }}>{children}</p>,
              strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
            }}
          >
            {output.body ?? output.summary ?? ''}
          </ReactMarkdown>

          {/* Tags */}
          {output.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 8 }}>
              {output.tags.slice(0, 6).map(t => (
                <span key={t} style={{
                  fontSize: 9, background: 'var(--muted)',
                  color: 'var(--muted-foreground)', borderRadius: 3, padding: '1px 5px',
                }}>
                  {t}
                </span>
              ))}
            </div>
          )}

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 8, fontSize: 9, color: 'var(--muted-foreground)',
          }}>
            <span>{output.source_tables?.slice(0, 1).join('')}</span>
            <span>{fmtDate(output.generated_at)}</span>
          </div>
        </div>
      )}
    </div>
  );
};
