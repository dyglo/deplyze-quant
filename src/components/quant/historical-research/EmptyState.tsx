/**
 * EmptyState — three handpicked starters under the command bar.
 *
 * Intentionally tight: a research workspace should look like the user is
 * meant to drive it. Twelve starter cards would say "pick one of our
 * suggestions"; three says "here's the shape of a query — your turn."
 */

import React from 'react';
import { GitCompareArrows, Activity, LineChart, ArrowUpRight } from 'lucide-react';

type LucideIcon = typeof GitCompareArrows;

interface Starter {
  icon: LucideIcon;
  query: string;
  caption: string;
}

const STARTERS: Starter[] = [
  {
    icon: GitCompareArrows,
    query: 'Compare SPY and GLD over the last 20 years',
    caption: 'Cross-asset comparison',
  },
  {
    icon: Activity,
    query: 'How did QQQ and TLT correlation evolve since 2008',
    caption: 'Relationship over time',
  },
  {
    icon: LineChart,
    query: 'SPY drawdown profile across recessions',
    caption: 'Regime behavior',
  },
];

export const EmptyState: React.FC<{ onPick: (q: string) => void }> = ({ onPick }) => (
  <section style={wrap}>
    <div style={labelRow}>
      <span style={label}>Or try</span>
    </div>
    <div style={grid}>
      {STARTERS.map((s) => {
        const Icon = s.icon;
        return (
          <button
            key={s.query}
            type="button"
            onClick={() => onPick(s.query)}
            style={card}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--muted)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--card)'; }}
          >
            <header style={cardTop}>
              <Icon size={14} style={{ color: 'var(--muted-foreground)' }} />
              <span style={captionStyle}>{s.caption}</span>
              <ArrowUpRight size={12} style={{ color: 'var(--muted-foreground)', marginLeft: 'auto' }} />
            </header>
            <div style={queryText}>{s.query}</div>
          </button>
        );
      })}
    </div>
  </section>
);

// ─── styles ──────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };

const labelRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
};

const label: React.CSSProperties = {
  fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
  color: 'var(--muted-foreground)',
};

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 10,
};

const card: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10,
  padding: '12px 14px',
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--card)',
  color: 'var(--foreground)',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'background 120ms',
  minHeight: 90,
};

const cardTop: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
};

const captionStyle: React.CSSProperties = {
  fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase',
  color: 'var(--muted-foreground)',
};

const queryText: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.4,
  color: 'var(--foreground)',
};
