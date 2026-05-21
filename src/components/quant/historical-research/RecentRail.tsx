/**
 * RecentRail — landing-page strip of recently-completed investigations.
 *
 * Slice B reads from sessionStorage (same store the page already writes to);
 * Slice C will swap this for a Firestore-backed query so the list survives
 * across sessions and devices. Card click opens the investigation in place.
 */

import React from 'react';
import { Clock, ArrowRight } from 'lucide-react';
import type { ResearchResult } from '../../../hooks/useHistoricalResearch';

const STORAGE_PREFIX = 'hr:';
const MAX = 6;

interface RecentEntry {
  id: string;
  result: ResearchResult;
}

function loadRecent(): RecentEntry[] {
  const out: RecentEntry[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as ResearchResult;
        if (!parsed?.query) continue;
        out.push({ id: key.slice(STORAGE_PREFIX.length), result: parsed });
      } catch { /* skip corrupt */ }
    }
  } catch { /* sessionStorage unavailable */ }
  out.sort((a, b) => (b.result.completedAt ?? 0) - (a.result.completedAt ?? 0));
  return out.slice(0, MAX);
}

interface Props {
  onOpen: (id: string) => void;
  /** Bumped by the page when a new investigation completes, to force a re-read. */
  refreshKey?: unknown;
}

export const RecentRail: React.FC<Props> = ({ onOpen, refreshKey }) => {
  const entries = React.useMemo(() => loadRecent(), [refreshKey]);
  if (entries.length === 0) return null;

  return (
    <section style={wrap}>
      <header style={headerRow}>
        <span style={{
          fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
        }}>
          Recent investigations
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
          this session
        </span>
      </header>
      <div style={grid}>
        {entries.map((e) => <Card key={e.id} entry={e} onOpen={onOpen} />)}
      </div>
    </section>
  );
};

const Card: React.FC<{ entry: RecentEntry; onOpen: (id: string) => void }> = ({ entry, onOpen }) => {
  const { result } = entry;
  const win = result.plan.timeframe.start && result.plan.timeframe.end
    ? `${result.plan.timeframe.start.slice(0, 4)}–${result.plan.timeframe.end.slice(0, 4)}`
    : `${result.plan.timeframe.lookbackYears}Y`;

  return (
    <button
      type="button"
      onClick={() => onOpen(entry.id)}
      style={card}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--muted)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--card)'; }}
    >
      <div style={cardTopRow}>
        <span style={{
          fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
        }}>
          {prettyIntent(result.plan.intent)}
        </span>
        <ArrowRight size={12} style={{ color: 'var(--muted-foreground)' }} />
      </div>

      <div style={{
        fontSize: 13, fontWeight: 500, color: 'var(--foreground)',
        lineHeight: 1.35, marginBottom: 6,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {result.query}
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8,
      }}>
        {result.plan.assets.slice(0, 4).map((a) => (
          <span key={a} style={tickerChip}>{a}</span>
        ))}
        {result.plan.assets.length > 4 && (
          <span style={{ ...tickerChip, color: 'var(--muted-foreground)' }}>+{result.plan.assets.length - 4}</span>
        )}
      </div>

      <div style={cardBottomRow}>
        <Mono>{win}</Mono>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Clock size={10} />
          <Mono>{relativeTime(result.completedAt)}</Mono>
        </span>
      </div>
    </button>
  );
};

const Mono: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: 11,
    color: 'var(--muted-foreground)',
  }}>{children}</span>
);

function prettyIntent(i: string): string {
  switch (i) {
    case 'compare':              return 'Compare';
    case 'regime_behavior':      return 'Regime';
    case 'relationship':         return 'Relationship';
    case 'single_asset_history': return 'Single asset';
    case 'anomaly_search':       return 'Anomaly';
    default:                     return i;
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ─── styles ───────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const headerRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
};
const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 10,
};
const card: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  padding: '12px 14px',
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--card)',
  color: 'var(--foreground)',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'background 120ms',
  minHeight: 132,
};
const cardTopRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  marginBottom: 8,
};
const cardBottomRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  marginTop: 'auto', paddingTop: 4,
  borderTop: '1px dashed var(--border)',
};
const tickerChip: React.CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
  fontSize: 11,
  padding: '1px 6px',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--foreground)',
};
