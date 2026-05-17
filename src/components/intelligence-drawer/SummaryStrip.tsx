/**
 * SummaryStrip — compact persistent narrative banner.
 *
 * Used at the top of dashboards to surface the current intelligence state
 * (regime + one-line interpretation) above the data tables/charts, so the
 * narrative is always visible — not buried inside an "Intelligence" tab.
 *
 * Visually unobtrusive: single row, tone-tinted left border, no big icon.
 * Optional click handler reveals the full signal list inline or opens a
 * drawer (caller decides).
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { SummaryPayload } from './sections/types';

interface Props {
  payload: SummaryPayload | null | undefined;
  /** When true, render compact (one-line) without expand affordance. */
  compact?: boolean;
}

const TONE_COLOR: Record<NonNullable<SummaryPayload['tone']>, string> = {
  positive: 'var(--ds-gain, #4E6040)',
  negative: 'var(--ds-loss, var(--primary))',
  warning: '#C9A227',
  neutral: 'var(--muted-foreground)',
};

export const SummaryStrip: React.FC<Props> = ({ payload, compact }) => {
  const [expanded, setExpanded] = useState(false);
  if (!payload) return null;
  const color = TONE_COLOR[payload.tone ?? 'neutral'];
  const hasSignals = (payload.signals?.length ?? 0) > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderBottom: '1px solid var(--border)',
        background: `color-mix(in srgb, ${color} 4%, var(--background))`,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 20px',
          borderLeft: `3px solid ${color}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--foreground)',
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {payload.headline}
          </span>
          {payload.body && (
            <span style={{
              fontSize: 10.5,
              color: 'var(--muted-foreground)',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {payload.body}
            </span>
          )}
        </div>
        {!compact && hasSignals && (
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? 'Hide signals' : 'Show signals'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 9px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--muted-foreground)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {payload.signals!.length} signal{payload.signals!.length === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {expanded && hasSignals && (
        <div style={{
          padding: '4px 20px 10px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 5,
        }}>
          {payload.signals!.map((s, i) => (
            <span
              key={i}
              style={{
                padding: '3px 9px',
                borderRadius: 6,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                fontSize: 10.5,
                color: 'var(--foreground)',
                lineHeight: 1.35,
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
