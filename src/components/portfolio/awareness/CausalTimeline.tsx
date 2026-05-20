/**
 * CausalTimeline — chronological synthesis of portfolio-relevant events.
 *
 * P2 ships a client-composed timeline from already-fetched data:
 *   - portfolio agent outputs (last 7d, filtered for severity != info)
 *   - cross-domain reasoning patterns
 *
 * Each entry is rendered as a calm institutional row: timestamp · domain
 * pill · title · brief context. No price-impact estimates yet — those will
 * arrive in P3 with the backend synthesis artifact. The timeline is
 * descriptive of *what was observed when*, not predictive.
 */

import React, { useMemo } from 'react';
import type { AgentOutput, AgentDomain, AgentSeverity } from '../../../types/agents';
import { AGENT_DOMAIN_LABELS } from '../../../types/agents';

interface CausalTimelineProps {
  portfolioObservations: AgentOutput[];
  reasoningOutputs: AgentOutput[];
}

interface TimelineEntry {
  id: string;
  ts: number;
  iso: string;
  domain: AgentDomain | 'reasoning';
  severity: AgentSeverity;
  title: string;
  summary: string | null;
  origin: 'portfolio' | 'reasoning';
}

const SEV_DOT_COLOR: Record<AgentSeverity, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#6366f1',
  info: '#9ca3af',
};

const SEV_ORDER: Record<AgentSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtDay(d: Date): string {
  const today = new Date();
  const t = new Date(d);
  const sameDay = t.toDateString() === today.toDateString();
  if (sameDay) return 'Today';
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (t.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function mergeEntries(
  portfolio: AgentOutput[],
  reasoning: AgentOutput[],
): TimelineEntry[] {
  const fromPortfolio: TimelineEntry[] = portfolio.map(o => ({
    id: `p:${o.artifact_id}`,
    ts: new Date(o.generated_at).getTime(),
    iso: o.generated_at,
    domain: o.domain,
    severity: (o.severity ?? 'info') as AgentSeverity,
    title: o.title ?? AGENT_DOMAIN_LABELS[o.domain] ?? 'Observation',
    summary: o.summary,
    origin: 'portfolio',
  }));
  const fromReasoning: TimelineEntry[] = reasoning.map(o => ({
    id: `r:${o.artifact_id}`,
    ts: new Date(o.generated_at).getTime(),
    iso: o.generated_at,
    domain: 'reasoning',
    severity: (o.severity ?? 'info') as AgentSeverity,
    title: o.title ?? 'Cross-system reasoning',
    summary: o.summary,
    origin: 'reasoning',
  }));

  const all = [...fromPortfolio, ...fromReasoning]
    .filter(e => e.severity !== 'info' && isFinite(e.ts));
  // Dedupe by (title, day) to avoid noise from re-runs
  const seen = new Set<string>();
  const deduped: TimelineEntry[] = [];
  for (const e of all.sort((a, b) => b.ts - a.ts)) {
    const dayKey = new Date(e.ts).toDateString();
    const key = `${e.title}|${dayKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }
  // Cap to a calm number — most causal timelines should fit on one screen.
  return deduped.slice(0, 18);
}

const TimelineRow: React.FC<{ entry: TimelineEntry }> = ({ entry }) => {
  const date = new Date(entry.ts);
  const dot = SEV_DOT_COLOR[entry.severity];
  return (
    <li style={{
      display: 'grid',
      gridTemplateColumns: '92px 22px 1fr',
      gap: 16,
      padding: '14px 0',
      borderBottom: '1px solid var(--border)',
      alignItems: 'flex-start',
    }}>
      <span style={{
        fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)',
        fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', paddingTop: 2,
      }}>
        {fmtTime(date)}
      </span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, paddingTop: 8,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: dot, flexShrink: 0,
          boxShadow: `0 0 0 3px ${dot}22`,
        }} />
      </span>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
            padding: '2px 7px', borderRadius: 4, background: 'var(--muted)',
          }}>
            {entry.domain === 'reasoning' ? 'Reasoning' : AGENT_DOMAIN_LABELS[entry.domain as AgentDomain] ?? entry.domain}
          </span>
          <span style={{
            fontSize: 13, fontWeight: 600, color: 'var(--foreground)',
            letterSpacing: '-0.005em',
          }}>
            {entry.title}
          </span>
        </div>
        {entry.summary && (
          <p style={{
            margin: '6px 0 0', fontSize: 12, lineHeight: 1.6,
            color: 'var(--muted-foreground)', maxWidth: 760,
          }}>
            {entry.summary}
          </p>
        )}
      </div>
    </li>
  );
};

export const CausalTimeline: React.FC<CausalTimelineProps> = ({
  portfolioObservations,
  reasoningOutputs,
}) => {
  const entries = useMemo(
    () => mergeEntries(portfolioObservations, reasoningOutputs),
    [portfolioObservations, reasoningOutputs],
  );

  // Group entries by day for the day pill
  const grouped = useMemo(() => {
    const map = new Map<string, TimelineEntry[]>();
    for (const e of entries) {
      const day = fmtDay(new Date(e.ts));
      const arr = map.get(day) ?? [];
      arr.push(e);
      map.set(day, arr);
    }
    return Array.from(map.entries());
  }, [entries]);

  return (
    <section aria-label="Causal timeline" style={{ padding: '0 32px', marginTop: 56 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ marginBottom: 22 }}>
          <p style={{
            margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            Causal Timeline
          </p>
          <h2 style={{
            margin: '6px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
            color: 'var(--foreground)',
          }}>
            What the system observed, in order.
          </h2>
          <p style={{
            margin: '6px 0 0', fontSize: 12, lineHeight: 1.6,
            color: 'var(--muted-foreground)', maxWidth: 720,
          }}>
            Sequenced events from portfolio-aware agents and cross-system reasoning.
            Descriptive of what was observed and when — not a forecast.
          </p>
        </header>

        {entries.length === 0 ? (
          <div style={{
            padding: '24px 0', fontSize: 12, color: 'var(--muted-foreground)',
            borderTop: '1px solid var(--border)',
          }}>
            No timeline events at elevated severity in the last 7 days for this portfolio.
          </div>
        ) : (
          grouped.map(([day, items]) => (
            <div key={day} style={{ marginBottom: 28 }}>
              <p style={{
                margin: '0 0 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'var(--muted-foreground)', opacity: 0.7,
              }}>
                {day}
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--border)' }}>
                {items.map(e => <TimelineRow key={e.id} entry={e} />)}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

export { SEV_ORDER };
