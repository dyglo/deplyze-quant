/**
 * SectionNarrative — the "Deplyze speaks" block that prefaces each data
 * section. Auto-generated second-person reflective text grounded in the
 * numbers shown directly below it. Calm institutional voice, never
 * directive.
 *
 * Visual identity: a quiet paragraph block with a left-side ribbon and
 * an inline `Deplyze ▸` prefix on the first line. Deliberately *not* a
 * banner / not a title — the block has to read as **narration prose**,
 * sitting between the section header and the data table.
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
  /** Optional inline prefix shown before the first sentence. Default "Deplyze ▸". */
  prefix?: string;
}

export const SectionNarrative: React.FC<Props> = ({ lines, prefix = 'Deplyze ▸' }) => {
  const normalised: Line[] = lines.map(l =>
    typeof l === 'string' ? { text: l } : l,
  );
  const safe = normalised
    .map(l => {
      try {
        return { ...l, text: assertAwarenessSafe(l.text, 'SectionNarrative') };
      } catch {
        // Render absolutely never crashes on guard failure — drop the offending line.
        return { ...l, text: '' };
      }
    })
    .filter(l => l.text.trim().length > 0);

  if (safe.length === 0) return null;

  return (
    <div
      role="note"
      aria-label="Awareness narrative"
      style={{
        borderLeft: '1px solid var(--border)',
        padding: '0 0 0 14px',
        margin: '4px 0 18px',
        maxWidth: 880,
      }}
    >
      {safe.map((l, i) => (
        <p
          key={i}
          style={{
            margin: i === 0 ? 0 : '6px 0 0',
            fontSize: 12,
            lineHeight: 1.7,
            color: l.emphasis ? 'var(--foreground)' : 'var(--muted-foreground)',
            fontWeight: 400,
            letterSpacing: '-0.001em',
          }}
        >
          {i === 0 && (
            <span style={{
              color: 'var(--primary)',
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: '0.02em',
              marginRight: 7,
              fontVariantCaps: 'small-caps',
            }}>
              {prefix}
            </span>
          )}
          {l.text}
        </p>
      ))}
    </div>
  );
};
