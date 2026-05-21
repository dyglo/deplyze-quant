/**
 * AwarenessToneControl — quiet header switcher that lets the user pick
 * narration depth (Brief / Standard / Deep) for the awareness workspace.
 *
 * The choice persists to `localStorage["deplyze.awareness.depth"]` so it
 * carries across sessions and is reflected next time `deriveTone` runs.
 * Profile-derived defaults still apply for first-time users.
 */

import React from 'react';
import type { AwarenessDepth } from '../../../lib/portfolio/awarenessTone';

interface Props {
  depth: AwarenessDepth;
  onChange: (next: AwarenessDepth) => void;
}

const OPTIONS: Array<{ key: AwarenessDepth; label: string; title: string }> = [
  { key: 'concise',  label: 'Brief',    title: 'Single load-bearing line per section.' },
  { key: 'standard', label: 'Standard', title: 'Two lines per section (default).' },
  { key: 'deep',     label: 'Deep',     title: 'Three lines per section.' },
];

export const AwarenessToneControl: React.FC<Props> = ({ depth, onChange }) => (
  <div
    role="radiogroup"
    aria-label="Awareness narration depth"
    style={{
      display: 'inline-flex',
      border: '1px solid var(--border)',
      borderRadius: 6,
      overflow: 'hidden',
      background: 'var(--card)',
    }}
  >
    {OPTIONS.map(opt => {
      const active = opt.key === depth;
      return (
        <button
          key={opt.key}
          role="radio"
          aria-checked={active}
          title={opt.title}
          onClick={() => onChange(opt.key)}
          style={{
            padding: '4px 9px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            border: 'none',
            borderRight: '1px solid var(--border)',
            background: active ? 'var(--muted)' : 'transparent',
            color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
            cursor: 'pointer',
          }}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);
