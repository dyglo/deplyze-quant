import React, { useCallback, useMemo, useState } from 'react';
import { Library } from 'lucide-react';
import { useWorkspace } from '../components/WorkspaceContext';
import { useArtifacts } from '../hooks/useArtifacts';
import { usePins } from '../hooks/usePins';
import { useDrawer } from '../components/quant/DataDrawer';
import { useLibraryStats } from '../hooks/useLibraryStats';
import { PageHeader } from '../components/quant/PageHeader';
import { LibraryCharts } from '../components/quant/LibraryCharts';
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export const ResearchLibrary: React.FC = () => {
  const { currentWorkspace, currentProject } = useWorkspace();
  const allArtifacts = useArtifacts(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const { isPinned } = usePins(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const drawer = useDrawer();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');

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
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(a => a.title.toLowerCase().includes(q) || a.symbols?.some(s => s.toLowerCase().includes(q)));
    }
    return items;
  }, [userArtifacts, filterType, search]);

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

          {/* Charts */}
          <LibraryCharts stats={stats} />

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

      <Disclaimer />
    </div>
  );
};
