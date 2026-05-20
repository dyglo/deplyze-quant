/**
 * SectionNarrative — the "Deplyze speaks" block that prefaces each data
 * section. Auto-generated second-person reflective text grounded in the
 * numbers shown directly below it. Calm institutional voice, never
 * directive.
 *
 * Visual identity: a small Deplyze pulse glyph + monochrome header,
 * followed by 1–3 short paragraphs. The block is consistent across all
 * sections so the user reads it as "the system narrating".
 *
 * Forbidden-verb guard from `awarenessNarration` is applied to every
 * line so the narrative can never drift into trade instructions.
 */

import React from 'react';
import { assertAwarenessSafe } from '../../../lib/portfolio/awarenessNarration';

interface Line {
  /** Optional emphasis: the line renders in foreground colour instead of muted. */
  emphasis?: boolean;
  text: string;
}

interface Props {
  /** 1–3 narrative lines. Each line is sentence-length, ~80–180 chars. */
  lines: Array<string | Line>;
  /** Optional small label to the left of the pulse, e.g. "DEPLYZE OBSERVES". */
  label?: string;
}

export const SectionNarrative: React.FC<Props> = ({ lines, label = 'Deplyze observes' }) => {
  const normalised: Line[] = lines.map(l =>
    typeof l === 'string' ? { text: l } : l,
  );
  // Filter empty / unsafe lines. Safe-asserted text returns the original
  // string in prod (with a warn) so we never crash the render.
  const safe = normalised
    .map(l => ({ ...l, text: assertAwarenessSafe(l.text, 'SectionNarrative') }))
    .filter(l => l.text.trim().length > 0);

  if (safe.length === 0) return null;

  return (
    <div
      role="note"
      aria-label="Awareness narrative"
      style={{
        position: 'relative',
        padding: '12px 16px 12px 22px',
        borderLeft: '2px solid var(--primary)',
        background: 'color-mix(in oklab, var(--primary) 4%, transparent)',
        borderRadius: '0 8px 8px 0',
        marginBottom: 14,
      }}
    >
      {/* Pulse glyph */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: -5, top: 16,
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--primary)',
          boxShadow: '0 0 0 4px color-mix(in oklab, var(--primary) 18%, transparent)',
        }}
      />
      <p style={{
        margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'var(--primary)',
        opacity: 0.85,
      }}>
        {label}
      </p>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {safe.map((l, i) => (
          <p
            key={i}
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.55,
              color: l.emphasis ? 'var(--foreground)' : 'var(--muted-foreground)',
              fontWeight: l.emphasis ? 600 : 400,
              letterSpacing: '-0.005em',
              maxWidth: 920,
            }}
          >
            {l.text}
          </p>
        ))}
      </div>
    </div>
  );
};
