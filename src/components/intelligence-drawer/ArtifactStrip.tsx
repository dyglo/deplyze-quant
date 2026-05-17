/**
 * ArtifactStrip — compact horizontal surfacing of recent intelligence
 * artifacts relevant to the host dashboard's symbol universe.
 *
 * Wave D introduces the surface. The agentic layer (Phase 5) populates
 * the warehouse with `regime_transition`, `correlation_breakdown`,
 * `historical_analog`, `narrative_emergence`, etc. — those flow here
 * automatically once produced.
 *
 * Empty state is deliberate: a quiet line, not a noisy placeholder. The
 * strip is invisible when there's nothing to say. This protects the
 * "fewer components, more intelligence" principle from Wave H.
 */
import React, { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import type { IntelligenceArtifact } from '../../types';

interface Props {
  artifacts: IntelligenceArtifact[];
  loading?: boolean;
  /** Suppress the empty-state line when there are no artifacts. Default true. */
  hideWhenEmpty?: boolean;
  /** Cap how many chips render in the collapsed row. */
  max?: number;
  /** Click handler — caller may open the drawer or navigate to a detail. */
  onSelect?: (artifact: IntelligenceArtifact) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  volatility_event: 'Volatility',
  regime_transition: 'Regime',
  anomaly_event: 'Anomaly',
  correlation_breakdown: 'Correlation',
  seasonal_signal: 'Seasonal',
  historical_analog: 'Analog',
  benchmark_shift: 'Benchmark',
  macro_alignment_change: 'Macro',
  statistical_extreme: 'Extreme',
  narrative_emergence: 'Narrative',
};

function formatAgo(ts: number): string {
  const diff = Date.now() - ts;
  const hrs = diff / 3_600_000;
  if (hrs < 1) return `${Math.max(1, Math.round(diff / 60_000))}m`;
  if (hrs < 24) return `${Math.round(hrs)}h`;
  return `${Math.round(hrs / 24)}d`;
}

export const ArtifactStrip: React.FC<Props> = ({
  artifacts,
  loading,
  hideWhenEmpty = true,
  max = 4,
  onSelect,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div style={stripStyle}>
        <Sparkles size={11} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
        <span style={mutedLabel}>Loading intelligence artifacts…</span>
      </div>
    );
  }

  if (!artifacts.length) {
    if (hideWhenEmpty) return null;
    return (
      <div style={stripStyle}>
        <Sparkles size={11} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
        <span style={mutedLabel}>No active intelligence artifacts for this dashboard.</span>
      </div>
    );
  }

  const sorted = [...artifacts].sort((a, b) => b.createdAt - a.createdAt);
  const shown = expanded ? sorted : sorted.slice(0, max);
  const overflow = sorted.length - shown.length;

  return (
    <div style={{ ...stripStyle, alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, paddingTop: 1 }}>
        <Sparkles size={11} style={{ color: 'var(--primary)' }} />
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
        }}>
          Intelligence
        </span>
      </span>

      {shown.map((a) => {
        const kind = (a.artifactType ?? a.category) as string;
        const label = CATEGORY_LABELS[kind] ?? 'Signal';
        const sig = a.significance ?? a.confidence ?? 0;
        return (
          <button
            key={a.id}
            onClick={() => onSelect?.(a)}
            disabled={!onSelect}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 9px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              cursor: onSelect ? 'pointer' : 'default',
              maxWidth: 280,
              transition: 'border-color 120ms',
            }}
            onMouseEnter={(e) => { if (onSelect) (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
            title={a.narrative ?? a.title}
          >
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--primary)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}>
              {label}
            </span>
            <span style={{
              fontSize: 11,
              color: 'var(--foreground)',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 200,
            }}>
              {a.title}
            </span>
            {a.symbols?.[0] && (
              <span style={{
                fontFamily: 'monospace',
                fontSize: 9,
                color: 'var(--muted-foreground)',
                padding: '0 5px',
                background: 'var(--muted)',
                borderRadius: 4,
                letterSpacing: '0.02em',
                flexShrink: 0,
              }}>
                {a.symbols[0]}{a.symbols.length > 1 ? ` +${a.symbols.length - 1}` : ''}
              </span>
            )}
            <span style={{
              fontSize: 9,
              color: 'var(--muted-foreground)',
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}>
              {sig > 0 ? `${Math.round(sig * 100)}%` : ''} · {formatAgo(a.createdAt)}
            </span>
          </button>
        );
      })}

      {overflow > 0 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          style={chevronButton}
        >
          <ChevronDown size={10} />
          +{overflow} more
        </button>
      )}
      {expanded && sorted.length > max && (
        <button
          onClick={() => setExpanded(false)}
          style={chevronButton}
        >
          <ChevronUp size={10} />
          Collapse
        </button>
      )}
    </div>
  );
};

const stripStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 20px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--card)',
  flexShrink: 0,
};

const mutedLabel: React.CSSProperties = {
  fontSize: 10.5,
  color: 'var(--muted-foreground)',
  fontStyle: 'italic',
};

const chevronButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: '3px 8px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--muted-foreground)',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
};
