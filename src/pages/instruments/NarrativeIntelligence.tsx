import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, BookOpen } from 'lucide-react';
import { IntelligenceObservationCard } from '../../components/quant/IntelligenceObservationCard';
import { SystemAnalyzingState } from '../../components/quant/SystemAnalyzingState';
import { Disclaimer } from '../../components/quant/Disclaimer';
import { useAgentDomain } from '../../hooks/useAgentIntelligence';
import type { AgentOutput } from '../../types/agents';

// ─── Narrative detail panel ────────────────────────────────────────────────────

const NarrativeDetail: React.FC<{ output: AgentOutput }> = ({ output }) => {
  const isHigh = output.severity === 'high';
  const isMed  = output.severity === 'medium';
  const accentColor = isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#8b5cf6';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 20,
      padding: '24px 28px',
      height: '100%', overflowY: 'auto',
    }}>

      {/* Title block */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `${accentColor}14`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BookOpen size={14} style={{ color: accentColor }} />
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: accentColor }}>
              Narrative · {output.severity?.toUpperCase()}
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--foreground)', margin: 0, lineHeight: 1.3 }}>
              {output.title ?? 'Narrative Signal'}
            </h2>
          </div>
        </div>
      </div>

      {/* Summary */}
      {output.summary && (
        <section>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 8 }}>
            Summary
          </div>
          <p style={{ fontSize: 12, color: 'var(--foreground)', lineHeight: 1.7, margin: 0 }}>
            {output.summary}
          </p>
        </section>
      )}

      {/* Full body */}
      {output.body && (
        <section>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 8 }}>
            Analysis
          </div>
          <p style={{ fontSize: 11, color: 'var(--foreground)', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>
            {output.body}
          </p>
        </section>
      )}

      {/* Linked symbols */}
      {output.symbols.length > 0 && (
        <section>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 8 }}>
            Linked Assets ({output.symbols.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {output.symbols.map((sym) => (
              <Link
                key={sym}
                to={`/instruments/${encodeURIComponent(sym)}`}
                style={{
                  padding: '3px 9px', borderRadius: 5,
                  background: `${accentColor}10`,
                  border: `1px solid ${accentColor}30`,
                  fontSize: 11, fontWeight: 700, color: accentColor,
                  textDecoration: 'none',
                  transition: 'background 0.1s',
                }}
              >
                {sym}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Tags */}
      {output.tags.length > 0 && (
        <section>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 8 }}>
            Themes
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {output.tags.map((tag) => (
              <span key={tag} style={{
                padding: '2px 8px', borderRadius: 4,
                background: 'var(--muted)', fontSize: 10, fontWeight: 600,
                color: 'var(--muted-foreground)',
              }}>
                {tag}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Confidence */}
      {output.confidence != null && (
        <section>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 6 }}>
            Confidence
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              flex: 1, height: 4, borderRadius: 2,
              background: 'var(--muted)', overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.round(output.confidence * 100)}%`,
                height: '100%', borderRadius: 2,
                background: accentColor,
              }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
              {Math.round(output.confidence * 100)}%
            </span>
          </div>
        </section>
      )}

      {/* Source meta */}
      <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <p style={{ fontSize: 9, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.6 }}>
          Generated {new Date(output.generated_at).toLocaleString()}
          {output.source_tables.length > 0 && (
            <> · Sources: {output.source_tables.join(', ')}</>
          )}
        </p>
      </div>
    </div>
  );
};

// ─── Empty state ───────────────────────────────────────────────────────────────

const EmptyDetail: React.FC = () => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: '100%', gap: 12, padding: 40,
  }}>
    <div style={{
      width: 48, height: 48, borderRadius: 12,
      background: 'var(--muted)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <BookOpen size={20} style={{ color: 'var(--muted-foreground)' }} />
    </div>
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', margin: '0 0 6px' }}>
        Select a narrative
      </p>
      <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.6, maxWidth: 260 }}>
        Choose an observation from the list to view the full analysis, linked assets, and confidence metrics.
      </p>
    </div>
  </div>
);

// ─── Workspace ────────────────────────────────────────────────────────────────

export const NarrativeIntelligence: React.FC = () => {
  const { data, loading } = useAgentDomain('sentiment', { limit: 30, days: 7 });
  const [selected, setSelected] = useState<AgentOutput | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
        flexShrink: 0,
      }}>
        <Link
          to="/instruments"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)',
            textDecoration: 'none', flexShrink: 0,
          }}
        >
          <ChevronLeft size={12} />
          Discovery
        </Link>

        <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--foreground)', margin: 0, lineHeight: 1 }}>
            Narrative Intelligence
          </h1>
          <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '2px 0 0', lineHeight: 1, fontStyle: 'italic' }}>
            Which themes dominate markets?
          </p>
        </div>

        <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
          {data.length} observations · last 7 days
        </span>
      </div>

      {/* ── Two-panel layout ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>

        {/* Left: narrative list */}
        <div style={{
          width: 340, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
          background: 'var(--background)',
          padding: '12px 0',
        }}>
          {loading && data.length === 0 ? (
            <div style={{ padding: 20 }}>
              <SystemAnalyzingState subtext="Loading narrative intelligence…" />
            </div>
          ) : data.length === 0 ? (
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.6, margin: 0 }}>
                No sentiment observations in the last 7 days. Sentiment agent runs every 3 hours.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' }}>
              {data.map((o) => (
                <div
                  key={o.artifact_id}
                  onClick={() => setSelected(selected?.artifact_id === o.artifact_id ? null : o)}
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${selected?.artifact_id === o.artifact_id ? 'rgba(139,92,246,0.4)' : 'transparent'}`,
                    background: selected?.artifact_id === o.artifact_id ? 'rgba(139,92,246,0.05)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.12s, border-color 0.12s',
                  }}
                >
                  <IntelligenceObservationCard output={o} compact />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        <div style={{ flex: 1, minWidth: 0, background: 'var(--card)', overflow: 'hidden' }}>
          {selected ? (
            <NarrativeDetail output={selected} />
          ) : (
            <EmptyDetail />
          )}
        </div>
      </div>

      {/* Footer disclaimer */}
      <div style={{ padding: '8px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <Disclaimer />
      </div>
    </div>
  );
};
