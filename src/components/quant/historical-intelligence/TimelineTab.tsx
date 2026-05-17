/**
 * TimelineTab — unified intelligence timeline for the active symbol's
 * workspace context.
 *
 * Pulls IntelligenceArtifacts + Briefings from the workspace, filters to
 * those touching the active symbol (or matching any), and renders an
 * institutional timeline grouped by date with category icons and a small
 * filter strip. This is a read-only surface — write paths remain in the
 * Research Library / Briefings pages.
 */

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, History, Layers, Gauge, Network, BarChart3, RefreshCcw,
  Telescope, FlaskConical, FileText, Sparkles, Filter,
} from 'lucide-react';
import { useArtifacts, useBriefings } from '../../../hooks/useArtifacts';
import { useWorkspace } from '../../WorkspaceContext';
import { ConfidenceBadge } from '../ConfidenceBadge';
import type { IntelligenceArtifact, Briefing } from '../../../types';

type Filter =
  | 'all'
  | 'historical_analog'
  | 'statistical_extreme'
  | 'regime'
  | 'correlation'
  | 'benchmark'
  | 'scenario'
  | 'reversion'
  | 'briefing';

const FILTER_META: Record<Filter, { label: string; icon: any }> = {
  all:                   { label: 'All',                icon: Sparkles },
  historical_analog:     { label: 'Analogs',            icon: History },
  statistical_extreme:   { label: 'Extremes',           icon: Gauge },
  regime:                { label: 'Regimes',            icon: Layers },
  correlation:           { label: 'Correlation',        icon: Network },
  benchmark:             { label: 'Benchmark',          icon: Telescope },
  scenario:              { label: 'Scenarios',          icon: FlaskConical },
  reversion:             { label: 'Reversion',          icon: RefreshCcw },
  briefing:              { label: 'Briefings',          icon: FileText },
};

type TimelineRow = {
  id: string;
  ts: number;
  kind: 'artifact' | 'briefing';
  title: string;
  summary: string;
  confidence?: number;
  significance?: number;
  symbols: string[];
  tags: string[];
  filterKey: Filter;
  detailLink: string;
};

export const TimelineTab: React.FC<{ symbol: string }> = ({ symbol }) => {
  const { currentWorkspace, currentProject } = useWorkspace();
  const artifacts = useArtifacts(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const briefings = useBriefings(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const [filter, setFilter] = useState<Filter>('all');
  const [symbolOnly, setSymbolOnly] = useState(false);

  const rows = useMemo<TimelineRow[]>(() => {
    const out: TimelineRow[] = [];
    for (const a of artifacts.items) {
      out.push({
        id: a.id,
        ts: a.createdAt,
        kind: 'artifact',
        title: a.title,
        summary: a.summary ?? a.narrative,
        confidence: a.confidenceScore ?? a.confidence,
        significance: a.significance,
        symbols: a.symbols ?? [],
        tags: a.tags ?? [],
        filterKey: classifyArtifact(a),
        detailLink: `/artifacts/${a.id}`,
      });
    }
    for (const b of briefings.items) {
      out.push({
        id: b.id,
        ts: b.createdAt,
        kind: 'briefing',
        title: b.title,
        summary: b.summary ?? '',
        confidence: undefined,
        significance: undefined,
        symbols: b.symbols ?? [],
        tags: [b.kind],
        filterKey: 'briefing',
        detailLink: `/briefings/${b.id}`,
      });
    }
    return out.sort((x, y) => y.ts - x.ts);
  }, [artifacts.items, briefings.items]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== 'all' && r.filterKey !== filter) return false;
      if (symbolOnly && symbol && r.symbols.length && !r.symbols.includes(symbol)) return false;
      return true;
    });
  }, [rows, filter, symbol, symbolOnly]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={iconWrap}><Clock size={14} color="var(--primary)" /></span>
        <div style={{ flex: 1 }}>
          <h2 className="ds-heading" style={{ margin: 0 }}>Intelligence timeline</h2>
          <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            Unified history of workspace artifacts and briefings — analogs, regimes, extremes, correlation shifts, scenarios, benchmark, Copilot research.
          </p>
        </div>
      </header>

      <section style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Filter size={12} color="var(--muted-foreground)" />
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Filter</span>
        {(Object.keys(FILTER_META) as Filter[]).map((k) => {
          const meta = FILTER_META[k];
          const Icon = meta.icon;
          const active = k === filter;
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                background: active ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'var(--muted)',
                color: active ? 'var(--primary)' : 'var(--muted-foreground)',
                border: '1px solid',
                borderColor: active ? 'color-mix(in srgb, var(--primary) 35%, transparent)' : 'var(--border)',
                cursor: 'pointer',
              }}
            >
              <Icon size={11} /> {meta.label}
            </button>
          );
        })}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto', fontSize: 11, color: 'var(--muted-foreground)', cursor: 'pointer' }}>
          <input type="checkbox" checked={symbolOnly} onChange={(e) => setSymbolOnly(e.target.checked)} />
          Limit to <strong style={{ color: 'var(--foreground)' }}>{symbol}</strong>
        </label>
      </section>

      {artifacts.loading || briefings.loading ? (
        <Card label="Loading workspace artifacts…" />
      ) : filtered.length === 0 ? (
        <Card label="No matching artifacts or briefings yet. Run scenarios, classify regimes, or pin Copilot insights — they will appear here." />
      ) : (
        <section style={{ display: 'grid', gap: 14 }}>
          {grouped.map(([day, items]) => (
            <div key={day} style={{ display: 'grid', gap: 6 }}>
              <span className="ds-caption" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-foreground)', fontWeight: 700 }}>
                {day}
              </span>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {items.map((r) => (
                  <li key={`${r.kind}-${r.id}`} style={{
                    padding: 12,
                    borderRadius: 10,
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    display: 'grid', gap: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                      <Link to={r.detailLink} style={{ textDecoration: 'none', color: 'var(--foreground)' }}>
                        <strong style={{ fontSize: 13 }}>{r.title}</strong>
                      </Link>
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        {r.confidence != null && <ConfidenceBadge score={r.confidence} />}
                        <KindBadge kind={r.filterKey} />
                      </span>
                    </div>
                    {r.summary && (
                      <p className="ds-body" style={{ margin: 0, fontSize: 12, color: 'var(--foreground)' }}>
                        {r.summary.length > 240 ? r.summary.slice(0, 240) + '…' : r.summary}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 10, color: 'var(--muted-foreground)' }}>
                      {r.symbols.length > 0 && (
                        <span>Symbols: {r.symbols.slice(0, 4).join(', ')}{r.symbols.length > 4 ? ` +${r.symbols.length - 4}` : ''}</span>
                      )}
                      {r.symbols.length > 0 && <span>·</span>}
                      <span>{new Date(r.ts).toLocaleTimeString()}</span>
                      {r.significance != null && (
                        <>
                          <span>·</span>
                          <span>significance {(r.significance * 100).toFixed(0)}%</span>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}
    </div>
  );
};

function classifyArtifact(a: IntelligenceArtifact): Filter {
  const tags = (a.tags ?? []).map((t) => t.toLowerCase());
  const type = (a.artifactType ?? '').toLowerCase();
  const cat  = (a.category   ?? '').toLowerCase();

  // ── Tag-based (highest specificity) ──────────────────────────────────────
  if (tags.some((t) => t === 'historical-analog' || t === 'analog' || t === 'historical_analog')) return 'historical_analog';
  if (tags.some((t) => t === 'statistical-extreme' || t === 'extreme' || t === 'statistical_extreme')) return 'statistical_extreme';
  if (tags.some((t) => t === 'reversion-momentum' || t === 'reversion' || t === 'momentum')) return 'reversion';
  if (tags.some((t) => t === 'scenario')) return 'scenario';
  if (tags.some((t) => t === 'benchmark')) return 'benchmark';
  if (tags.some((t) => t === 'correlation' || t === 'correlation_breakdown')) return 'correlation';
  if (tags.some((t) => t === 'regime' || t === 'regime_transition')) return 'regime';

  // ── artifactType-based ────────────────────────────────────────────────────
  if (type === 'correlation_breakdown') return 'correlation';
  if (type === 'volatility_anomaly')    return 'statistical_extreme';
  if (type === 'macro_shift')           return 'regime';

  // ── category-based (broadest fallback before 'all') ───────────────────────
  if (cat === 'regime' || cat === 'macro')      return 'regime';
  if (cat === 'correlation')                    return 'correlation';
  if (cat === 'volatility' || cat === 'anomaly') return 'statistical_extreme';
  if (cat === 'opportunity' || cat === 'risk')  return 'reversion';

  return 'all';
}

function groupByDay(rows: TimelineRow[]): Array<[string, TimelineRow[]]> {
  const map = new Map<string, TimelineRow[]>();
  for (const r of rows) {
    const day = new Date(r.ts).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(r);
  }
  return Array.from(map.entries());
}

const KindBadge: React.FC<{ kind: Filter }> = ({ kind }) => {
  if (kind === 'all') return null;
  const meta = FILTER_META[kind];
  const Icon = meta.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
      letterSpacing: '0.04em', textTransform: 'uppercase',
      background: 'var(--muted)',
      color: 'var(--muted-foreground)',
      border: '1px solid var(--border)',
    }}>
      <Icon size={9} /> {meta.label}
    </span>
  );
};

const cardStyle: React.CSSProperties = { padding: 14, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)' };
const iconWrap: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
  border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const Card: React.FC<{ label: string }> = ({ label }) => (
  <div style={cardStyle}><p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>{label}</p></div>
);
