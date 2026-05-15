import React, { useCallback, useMemo, useState, useRef } from 'react';
import { Library, Lightbulb } from 'lucide-react';
import { useWorkspace } from '../components/WorkspaceContext';
import { useArtifacts } from '../hooks/useArtifacts';
import { usePins } from '../hooks/usePins';
import { useDrawer } from '../components/quant/DataDrawer';
import { useLibraryStats } from '../hooks/useLibraryStats';
import { PageHeader } from '../components/quant/PageHeader';
import { LibraryCharts, type ChartSelection } from '../components/quant/LibraryCharts';
import { LibraryCard } from '../components/quant/LibraryCard';
import { ArtifactDetailDrawerBody } from '../components/quant/ArtifactDetailDrawerBody';
import { Disclaimer } from '../components/quant/Disclaimer';
import type { IntelligenceArtifact } from '../types';

// ─── KPI tile ─────────────────────────────────────────────────────────────────

const KpiTile: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="ds-surface" style={{ borderRadius: 8, padding: '12px 16px' }}>
    <p className="ds-caption" style={{ margin: '0 0 4px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>
      {label}
    </p>
    <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1 }}>
      {value}
    </p>
  </div>
);

// ─── Section heading ──────────────────────────────────────────────────────────

const SectionHeading: React.FC<{ type: string; count: number }> = ({ type, count }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
    <h3 className="ds-heading" style={{ margin: 0, fontSize: 13, textTransform: 'capitalize' }}>
      {type.replace(/_/g, ' ')}
    </h3>
    <span className="ds-badge" style={{ fontSize: 10 }}>{count}</span>
  </div>
);

// ─── Research Overview Panel ──────────────────────────────────────────────────

const ResearchOverviewPanel: React.FC<{
  stats: ReturnType<typeof import('../hooks/useLibraryStats').useLibraryStats>;
  artifacts: import('../types').IntelligenceArtifact[];
}> = ({ stats, artifacts }) => {
  const [open, setOpen] = useState(false);

  const overview = useMemo(() => {
    if (!stats.total) return '';
    const topType = stats.typeBreakdown[0];
    const topTypePct = topType ? Math.round((topType.value / stats.total) * 100) : 0;
    const mostRecent = artifacts.length
      ? [...artifacts].sort((a, b) => {
          const ta = typeof a.createdAt === 'number' ? a.createdAt : (a.createdAt as any)?.toMillis?.() ?? 0;
          const tb = typeof b.createdAt === 'number' ? b.createdAt : (b.createdAt as any)?.toMillis?.() ?? 0;
          return tb - ta;
        })[0]
      : null;
    const recentAge = mostRecent
      ? (() => {
          const ms = typeof mostRecent.createdAt === 'number' ? mostRecent.createdAt : (mostRecent.createdAt as any)?.toMillis?.() ?? 0;
          const h = Math.floor((Date.now() - ms) / 3600000);
          return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
        })()
      : null;

    const lines: string[] = [
      `You have ${stats.total} saved item${stats.total > 1 ? 's' : ''} in your research library.`,
    ];
    if (stats.topSymbol) {
      const symCount = stats.symbolCoverage.find(s => s.symbol === stats.topSymbol)?.count ?? 0;
      lines.push(`${stats.topSymbol} is your most-researched instrument with ${symCount} item${symCount > 1 ? 's' : ''}.`);
    }
    if (topType) {
      lines.push(`${topTypePct}% of your library is ${topType.name.replace(/_/g, ' ')} — consider diversifying your research types if this feels concentrated.`);
    }
    if (stats.avgConfidence != null) {
      const conf = Math.round(stats.avgConfidence * 100);
      lines.push(`Average confidence across your library is ${conf}%.${conf < 60 ? ' Many items are low-confidence — review and update or delete stale research.' : conf > 80 ? ' Strong overall quality.' : ''}`);
    }
    if (stats.thisWeek > 0) {
      lines.push(`You saved ${stats.thisWeek} item${stats.thisWeek > 1 ? 's' : ''} this week.`);
    }
    if (recentAge) {
      lines.push(`Most recent save was ${recentAge}.`);
    }
    return lines.join(' ');
  }, [stats, artifacts]);

  return (
    <div className="ds-surface" style={{ borderRadius: 10, padding: 14, marginBottom: 24, marginTop: 8 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left' }}>
        <Lightbulb size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <span className="ds-label" style={{ color: 'var(--foreground)' }}>Research Overview</span>
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginLeft: 'auto', fontSize: 10 }}>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <p className="ds-body" style={{ margin: '10px 0 0', lineHeight: 1.7, fontSize: 13, color: 'var(--foreground)' }}>
          {overview}
        </p>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export const ResearchLibrary: React.FC = () => {
  const { currentWorkspace, currentProject } = useWorkspace();
  const allArtifacts = useArtifacts(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const { isPinned } = usePins(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const drawer = useDrawer();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [chartSel, setChartSel] = useState<ChartSelection | null>(null);

  // Only user-created artifacts
  const userArtifacts = useMemo(
    () => allArtifacts.items.filter(a => a.source === 'user'),
    [allArtifacts.items],
  );

  const stats = useLibraryStats(userArtifacts);

  const handleOpen = useCallback((id: string) => {
    const artifact = allArtifacts.items.find(a => a.id === id);
    if (!artifact) return;
    drawer.open({
      title: artifact.title,
      subtitle: artifact.artifactType?.replace(/_/g, ' ') ?? artifact.category,
      width: 560,
      body: (
        <ArtifactDetailDrawerBody
          artifact={artifact}
          relatedArtifacts={userArtifacts}
          onOpenArtifact={handleOpen}
        />
      ),
    });
  }, [allArtifacts.items, userArtifacts, drawer]);

  // Filter + group
  const filtered = useMemo(() => {
    let items: IntelligenceArtifact[] = userArtifacts;
    if (filterType !== 'all') {
      items = items.filter(a => (a.artifactType ?? 'unknown') === filterType);
    }
    if (chartSel?.type) {
      items = items.filter(a => (a.artifactType ?? 'unknown') === chartSel.type);
    }
    if (chartSel?.symbol) {
      items = items.filter(a => a.symbols?.includes(chartSel.symbol!));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(a => a.title.toLowerCase().includes(q) || a.symbols?.some(s => s.toLowerCase().includes(q)));
    }
    return items;
  }, [userArtifacts, filterType, chartSel, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, IntelligenceArtifact[]>();
    for (const a of filtered) {
      const key = a.artifactType ?? 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [filtered]);

  const isEmpty = !allArtifacts.loading && userArtifacts.length === 0;

  return (
    <div style={{ padding: '0 24px 48px', maxWidth: 1280, margin: '0 auto' }}>
      <PageHeader
        title="Research Library"
        subtitle="Your manually saved intelligence — snapshots, briefings, lab sessions, and insights."
      />

      {isEmpty ? (
        <div className="ds-empty" style={{ minHeight: 320 }}>
          <Library size={32} style={{ color: 'var(--muted-foreground)', marginBottom: 12 }} />
          <p className="ds-heading">Your library is empty</p>
          <p className="ds-caption" style={{ maxWidth: 360, textAlign: 'center' }}>
            Save briefings, instrument snapshots, Quant Lab sessions, and Copilot insights from any page to build your research library.
          </p>
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            <KpiTile label="Total saved" value={stats.total} />
            <KpiTile label="This week" value={stats.thisWeek} />
            <KpiTile label="Top symbol" value={stats.topSymbol ?? '—'} />
            <KpiTile
              label="Avg confidence"
              value={stats.avgConfidence != null ? `${Math.round(stats.avgConfidence * 100)}%` : '—'}
            />
          </div>

          {/* Charts — click to filter */}
          <LibraryCharts stats={stats} selection={chartSel ?? undefined} onSelect={setChartSel} />

          {/* Active chart filters chips */}
          {chartSel && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>Filtered by:</span>
              {chartSel.type && (
                <span style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: 12, padding: '2px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => setChartSel(s => s ? { ...s, type: undefined } : null)}>
                  Type: {chartSel.type.replace(/_/g, ' ')} ×
                </span>
              )}
              {chartSel.symbol && (
                <span style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: 12, padding: '2px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  onClick={() => setChartSel(s => s ? { ...s, symbol: undefined } : null)}>
                  Symbol: {chartSel.symbol} ×
                </span>
              )}
              <button onClick={() => setChartSel(null)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                Clear all
              </button>
            </div>
          )}

          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <input
              className="ds-input"
              style={{ flex: 1, fontSize: 12 }}
              placeholder="Search library…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select
              className="ds-input"
              style={{ fontSize: 12, width: 180 }}
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
            >
              <option value="all">All types</option>
              {stats.activeTypes.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          {/* Grouped card sections */}
          {filtered.length === 0 ? (
            <div className="ds-empty" style={{ minHeight: 120 }}>
              <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>No items match your filters.</p>
            </div>
          ) : (
            [...grouped.entries()].map(([type, items]) => (
              <section key={type} style={{ marginBottom: 24 }}>
                <SectionHeading type={type} count={items.length} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {items.map(a => (
                    <LibraryCard
                      key={a.id}
                      artifact={a}
                      onOpen={handleOpen}
                      isPinned={isPinned(a.id)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </>
      )}

      {/* AI Overview — deterministic insight paragraph */}
      {userArtifacts.length >= 3 && (
        <ResearchOverviewPanel stats={stats} artifacts={userArtifacts} />
      )}

      <Disclaimer />
    </div>
  );
};
