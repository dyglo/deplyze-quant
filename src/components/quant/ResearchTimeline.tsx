import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Brain, FileText, FlaskConical, MessageSquare, Pin } from 'lucide-react';
import type { TimelineEvent } from '../../types';

const KIND_CONFIG = {
  artifact: { label: 'Intelligence', icon: Brain, color: 'var(--primary)' },
  briefing: { label: 'Briefing', icon: FileText, color: '#4e6eaf' },
  labSession: { label: 'Quant Lab', icon: FlaskConical, color: '#4E6040' },
  insight: { label: 'Copilot Insight', icon: MessageSquare, color: '#9e7e3a' },
} as const;

interface Props {
  events: TimelineEvent[];
  loading: boolean;
  onOpenArtifact?: (id: string) => void;
  pinnedIds?: Set<string>;
  onPin?: (id: string) => Promise<void>;
  onUnpin?: (id: string) => Promise<void>;
}

export const ResearchTimeline: React.FC<Props> = ({ events, loading, onOpenArtifact, pinnedIds, onPin, onUnpin }) => {
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState<'all' | TimelineEvent['kind']>('all');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterSource, setFilterSource] = useState<'all' | 'agent' | 'user'>('all');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const filteredEvents = useMemo(() => {
    let result = [...events];

    // Filter by kind
    if (filterKind !== 'all') {
      result = result.filter((e) => e.kind === filterKind);
    }

    // Filter by search text
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((e) => {
        if (e.kind === 'artifact') return e.data.title.toLowerCase().includes(q);
        if (e.kind === 'briefing') return e.data.title.toLowerCase().includes(q);
        if (e.kind === 'labSession') return e.data.name.toLowerCase().includes(q);
        if (e.kind === 'insight') return e.data.content.toLowerCase().includes(q);
        return false;
      });
    }

    // Filter by symbol
    if (filterSymbol.trim()) {
      const sym = filterSymbol.trim().toLowerCase();
      result = result.filter((e) => {
        const symbols: string[] | undefined =
          e.kind === 'artifact' ? e.data.symbols :
          e.kind === 'briefing' ? e.data.symbols :
          e.kind === 'labSession' ? e.data.symbols :
          (e.data as { symbols?: string[] }).symbols;
        return symbols?.some((s) => s.toLowerCase().includes(sym)) ?? false;
      });
    }

    // Filter by source (agent / user / all)
    if (filterSource !== 'all') {
      result = result.filter(e => {
        if (e.kind !== 'artifact') return filterSource === 'agent';
        const src = (e.data as { source?: string }).source;
        if (filterSource === 'agent') return !src || src === 'agent';
        return src === 'user';
      });
    }

    // Filter pinned only
    if (pinnedOnly) {
      result = result.filter(
        (e) => e.kind === 'artifact' && pinnedIds?.has(e.id),
      );
    }

    // Filter saved only
    if (savedOnly) {
      result = result.filter(
        (e) => e.kind === 'artifact' && e.data.saved,
      );
    }

    // Sort by createdAt
    result.sort((a, b) => {
      const tsA = typeof a.createdAt === 'number'
        ? a.createdAt
        : (a.createdAt as unknown as { toMillis: () => number }).toMillis();
      const tsB = typeof b.createdAt === 'number'
        ? b.createdAt
        : (b.createdAt as unknown as { toMillis: () => number }).toMillis();
      return sortDir === 'desc' ? tsB - tsA : tsA - tsB;
    });

    return result;
  }, [events, filterKind, search, filterSymbol, filterSource, pinnedOnly, savedOnly, sortDir, pinnedIds]);

  if (loading) {
    return <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '24px 0' }}>Loading timeline…</p>;
  }
  if (!events.length) {
    return (
      <div className="ds-empty" style={{ minHeight: 200 }}>
        <p className="ds-heading">No research history yet</p>
        <p className="ds-caption" style={{ maxWidth: 320, textAlign: 'center' }}>
          Generate briefings, save Quant Lab sessions, or save Copilot insights to build your research timeline.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {/* Row 1: search + kind */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="ds-input"
            style={{ flex: 1, fontSize: 12 }}
            placeholder="Search timeline…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="ds-input"
            style={{ fontSize: 12, width: 140 }}
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value as 'all' | TimelineEvent['kind'])}
          >
            <option value="all">All types</option>
            <option value="artifact">Intelligence</option>
            <option value="briefing">Briefing</option>
            <option value="labSession">Quant Lab</option>
            <option value="insight">Copilot</option>
          </select>
        </div>
        {/* Row 2: symbol filter + source + toggle buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="ds-input"
            style={{ flex: 1, minWidth: 80, fontSize: 12 }}
            placeholder="Filter by symbol…"
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
          />
          {(['all', 'agent', 'user'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterSource(s)}
              className={filterSource === s ? 'ds-btn-primary' : 'ds-btn-secondary'}
              style={{ fontSize: 12, padding: '4px 10px', textTransform: 'capitalize' }}
            >{s === 'all' ? 'All' : s === 'agent' ? 'Agent' : 'Saved'}</button>
          ))}
          <button
            onClick={() => setPinnedOnly((v) => !v)}
            className={pinnedOnly ? 'ds-btn-primary' : 'ds-btn-secondary'}
            style={{ fontSize: 12, padding: '4px 10px' }}
          >Pinned</button>
          <button
            onClick={() => setSavedOnly((v) => !v)}
            className={savedOnly ? 'ds-btn-primary' : 'ds-btn-secondary'}
            style={{ fontSize: 12, padding: '4px 10px' }}
          >Saved</button>
          <button
            onClick={() => setSortDir((d) => d === 'desc' ? 'asc' : 'desc')}
            className="ds-btn-secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
          >{sortDir === 'desc' ? 'Newest' : 'Oldest'}</button>
        </div>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="ds-empty" style={{ minHeight: 120 }}>
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>No events match your filters.</p>
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 24 }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute', left: 7, top: 8, bottom: 0,
            width: 2, background: 'var(--border)',
          }} />

          <div style={{ display: 'grid', gap: 12 }}>
            {filteredEvents.map((event) => {
              const cfg = KIND_CONFIG[event.kind];
              const Icon = cfg.icon;
              return (
                <div key={`${event.kind}-${event.id}`} style={{ position: 'relative', paddingLeft: 20 }}>
                  {/* Timeline dot */}
                  <div style={{
                    position: 'absolute', left: -19, top: 12,
                    width: 10, height: 10, borderRadius: '50%',
                    background: cfg.color, border: '2px solid var(--background)',
                  }} />
                  <TimelineRow event={event} cfg={cfg} Icon={Icon} onOpenArtifact={onOpenArtifact} pinnedIds={pinnedIds} onPin={onPin} onUnpin={onUnpin} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const TimelineRow: React.FC<{
  event: TimelineEvent;
  cfg: { label: string; color: string };
  Icon: React.ElementType;
  onOpenArtifact?: (id: string) => void;
  pinnedIds?: Set<string>;
  onPin?: (id: string) => Promise<void>;
  onUnpin?: (id: string) => Promise<void>;
}> = ({ event, cfg, Icon, onOpenArtifact, pinnedIds, onPin, onUnpin }) => {
  const timestamp = new Date(event.createdAt).toLocaleString();

  if (event.kind === 'artifact') {
    const a = event.data;
    const isPinned = pinnedIds?.has(event.id);
    return (
      <div className="ds-surface ds-transition" style={{ padding: '10px 12px', borderRadius: 8, display: 'grid', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon size={12} style={{ color: cfg.color }} />
          <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{cfg.label} · {a.category}</span>
          <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            {timestamp}
          </span>
          {(onPin || onUnpin) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isPinned) onUnpin?.(event.id).catch(console.error);
                else onPin?.(event.id).catch(console.error);
              }}
              title={isPinned ? 'Unpin' : 'Pin'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                color: isPinned ? 'var(--primary)' : 'var(--muted-foreground)',
                display: 'flex', alignItems: 'center',
              }}
            >
              <Pin size={11} style={{ fill: isPinned ? 'var(--primary)' : 'none' }} />
            </button>
          )}
        </div>
        <button
          onClick={() => onOpenArtifact?.(a.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
        >
          <p className="ds-body" style={{ margin: 0, fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
            {a.saved && <Bookmark size={10} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
            {a.title}
          </p>
          {a.symbols?.length ? (
            <p className="ds-caption" style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>{a.symbols.join(', ')}</p>
          ) : null}
        </button>
      </div>
    );
  }

  if (event.kind === 'briefing') {
    const b = event.data;
    return (
      <Link
        to={`/briefings/${b.id}`}
        className="ds-surface ds-transition"
        style={{ padding: '10px 12px', borderRadius: 8, textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Icon size={12} style={{ color: cfg.color }} />
          <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{cfg.label} · {b.kind}</span>
          <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginLeft: 'auto' }}>{timestamp}</span>
        </div>
        <p className="ds-body" style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{b.title}</p>
      </Link>
    );
  }

  if (event.kind === 'labSession') {
    const s = event.data;
    return (
      <div className="ds-surface" style={{ padding: '10px 12px', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Icon size={12} style={{ color: cfg.color }} />
          <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{cfg.label} · {s.panel}</span>
          <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginLeft: 'auto' }}>{timestamp}</span>
        </div>
        <p className="ds-body" style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{s.name}</p>
        <p className="ds-caption" style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>
          {s.symbols.join(', ')}
          {Object.entries(s.summary).slice(0, 2).map(([k, v]) => ` · ${k}: ${v}`).join('')}
        </p>
      </div>
    );
  }

  // insight
  const i = event.data;
  return (
    <div className="ds-surface" style={{ padding: '10px 12px', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Icon size={12} style={{ color: cfg.color }} />
        <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{cfg.label}</span>
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginLeft: 'auto' }}>{timestamp}</span>
      </div>
      <p className="ds-body" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        {i.content.slice(0, 200)}{i.content.length > 200 ? '…' : ''}
      </p>
    </div>
  );
};
