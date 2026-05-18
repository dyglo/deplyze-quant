/**
 * NarrativeOverlay — subtle inline chip row of active narrative themes.
 *
 * Per the wave brief: "narrative overlays must remain subtle, integrated
 * naturally into layouts, not giant cards, not giant tabs". This renders
 * as a thin single-line row of pill chips sized to the page width; it is
 * placed beneath the SummaryStrip so the narrative reads as a continuation
 * of the page's interpretation, not as a separate section.
 *
 * Hidden by default when empty so dashboards stay calm until the gateway
 * has produced narrative_memory rows.
 */
import React from 'react';
import { Network } from 'lucide-react';
import type { DashboardNarrative } from '../../hooks/useDashboardNarratives';

interface Props {
  narratives: DashboardNarrative[];
  loading?: boolean;
  hideWhenEmpty?: boolean;
  onSelect?: (theme: DashboardNarrative) => void;
}

function polarityColor(p: number | null): string {
  if (p == null) return 'var(--muted-foreground)';
  if (p > 0.15) return 'var(--ds-gain, #4E6040)';
  if (p < -0.15) return 'var(--ds-loss, var(--primary))';
  return 'var(--muted-foreground)';
}

export const NarrativeOverlay: React.FC<Props> = ({
  narratives,
  loading,
  hideWhenEmpty = true,
  onSelect,
}) => {
  if (loading) {
    return (
      <div style={wrapStyle}>
        <Network size={11} style={{ color: 'var(--muted-foreground)' }} />
        <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
          Loading narratives…
        </span>
      </div>
    );
  }
  if (!narratives.length) {
    if (hideWhenEmpty) return null;
    return (
      <div style={wrapStyle}>
        <Network size={11} style={{ color: 'var(--muted-foreground)' }} />
        <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
          No active narratives for this universe.
        </span>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <Network size={11} style={{ color: 'var(--primary)' }} />
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
        }}>
          Narratives
        </span>
      </span>
      {narratives.map((n) => {
        const color = polarityColor(n.polarity);
        const strengthPct = Math.round(n.strength * 100);
        return (
          <button
            key={n.themeId}
            onClick={() => onSelect?.(n)}
            disabled={!onSelect}
            title={`${n.label}${n.polarity != null ? ` · polarity ${n.polarity > 0 ? '+' : ''}${n.polarity.toFixed(2)}` : ''}${n.symbols.length ? ` · ${n.symbols.slice(0, 3).join(', ')}${n.symbols.length > 3 ? ` +${n.symbols.length - 3}` : ''}` : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '2px 9px',
              borderRadius: 999,
              border: `1px solid color-mix(in srgb, ${color} 30%, var(--border))`,
              background: `color-mix(in srgb, ${color} 6%, transparent)`,
              color: 'var(--foreground)',
              fontSize: 10.5,
              fontWeight: 600,
              cursor: onSelect ? 'pointer' : 'default',
              maxWidth: 220,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <span style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: color,
              flexShrink: 0,
            }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {n.label}
            </span>
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--muted-foreground)',
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}>
              {strengthPct}
            </span>
          </button>
        );
      })}
    </div>
  );
};

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 20px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--background)',
  flexWrap: 'wrap',
  flexShrink: 0,
};
