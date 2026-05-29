/**
 * IntelligenceObservationCard — renders a single AgentOutput as an
 * institutional intelligence observation. No agent avatars, no chat bubbles.
 * Pure information: domain, severity, title, summary, confidence, evidence.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import type { AgentOutput, AgentDomain, AgentSeverity } from '../../types/agents';
import { AGENT_DOMAIN_LABELS } from '../../types/agents';
import { ConfidenceBadge } from './ConfidenceBadge';
import { severityConfig, domainAccent } from '../../lib/semanticPalette';

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso.slice(0, 16); }
}

// ─── Component ────────────────────────────────────────────────────────────────

export const IntelligenceObservationCard: React.FC<{
  output: AgentOutput;
  expanded?: boolean;
  compact?: boolean;
  onSymbolClick?: (symbol: string) => void;
}> = ({ output, expanded: initialExpanded = false, compact = false, onSymbolClick }) => {
  const [expanded, setExpanded] = useState(initialExpanded);

  const domain = output.domain as AgentDomain;
  const severity = (output.severity ?? 'info') as AgentSeverity;
  const sevCfg = severityConfig(severity);
  const accentColor = domainAccent(domain);
  const domainLabel = AGENT_DOMAIN_LABELS[domain] ?? domain;

  return (
    <article
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: compact ? '8px 12px' : '10px 14px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setExpanded(e => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
      >
        {/* Domain tag */}
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
          color: accentColor, textTransform: 'uppercase', flexShrink: 0,
          minWidth: 72,
        }}>
          {domainLabel}
        </span>

        {/* Severity pip */}
        <span style={{
          fontSize: 8, fontWeight: 800, letterSpacing: '0.08em',
          color: sevCfg.color, background: sevCfg.bg,
          borderRadius: 3, padding: '1px 5px', flexShrink: 0,
        }}>
          {sevCfg.label}
        </span>

        {/* Title */}
        <span style={{
          flex: 1, fontSize: 11, fontWeight: 600,
          color: 'var(--foreground)', lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {output.title}
        </span>

        {/* Confidence + expand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {output.confidence != null && (
            <ConfidenceBadge score={output.confidence} />
          )}
          {expanded
            ? <ChevronDown size={12} color="var(--muted-foreground)" />
            : <ChevronRight size={12} color="var(--muted-foreground)" />
          }
        </div>
      </div>

      {/* Summary line (always visible) */}
      {output.summary && !expanded && (
        <p style={{
          margin: 0, padding: compact ? '0 12px 8px' : '0 14px 10px',
          fontSize: 10, color: 'var(--muted-foreground)', lineHeight: 1.5,
        }}>
          {output.summary}
        </p>
      )}

      {/* Expanded body */}
      {expanded && (
        <div style={{
          padding: compact ? '6px 12px 10px' : '8px 14px 12px',
          borderTop: '1px solid var(--border)',
        }}>
          {/* Summary */}
          {output.summary && (
            <p style={{
              margin: '0 0 8px', fontSize: 10.5,
              color: 'var(--foreground)', lineHeight: 1.6,
            }}>
              {output.summary}
            </p>
          )}

          {/* Symbols */}
          {output.symbols?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {output.symbols.slice(0, 10).map(sym => (
                <button
                  key={sym}
                  onClick={e => { e.stopPropagation(); onSymbolClick?.(sym); }}
                  style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                    color: 'var(--primary)', background: 'rgba(193,95,60,0.08)',
                    border: '1px solid rgba(193,95,60,0.18)', borderRadius: 3,
                    padding: '1px 6px', cursor: onSymbolClick ? 'pointer' : 'default',
                  }}
                >
                  {sym}
                </button>
              ))}
            </div>
          )}

          {/* Tags */}
          {output.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
              {output.tags.slice(0, 6).map(tag => (
                <span key={tag} style={{
                  fontSize: 9, color: 'var(--muted-foreground)',
                  background: 'var(--muted)', borderRadius: 3, padding: '1px 5px',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Footer — timestamp */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            marginTop: 6,
          }}>
            <span style={{ fontSize: 9, color: 'var(--muted-foreground)', flexShrink: 0 }}>
              {fmtDate(output.generated_at)}
            </span>
          </div>
        </div>
      )}
    </article>
  );
};
