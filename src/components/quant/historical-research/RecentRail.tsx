/**
 * RecentRail — landing-page strip of recent / saved investigations.
 *
 * Two tabs:
 *   • Recent — sessionStorage cards (same tab; cleared on browser close).
 *   • Saved  — Firestore-persisted investigations for the active user +
 *              workspace; survives across devices and sessions.
 *
 * Click opens the investigation in place. For saved entries the page hydrates
 * from Firestore on route mount.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Clock, ArrowRight, Bookmark, MoreVertical, FileType2, FileText, FileJson } from 'lucide-react';
import type { ResearchResult } from '../../../hooks/useHistoricalResearch';
import { useAuth } from '../../AuthProvider';
import { listSavedInvestigations, loadInvestigation, type SavedInvestigationMeta } from '../../../services/savedHistoricalResearchService';
import { exportPdf, exportMarkdown, exportJson } from '../../../lib/historicalResearchExport';

const STORAGE_PREFIX = 'hr:';
const MAX = 6;

type Tab = 'recent' | 'saved';

interface RecentEntry {
  id: string;
  query: string;
  intent: string;
  assets: string[];
  lookbackYears: number;
  completedAt: number;
  saved?: boolean;
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
        out.push({
          id: key.slice(STORAGE_PREFIX.length),
          query: parsed.query,
          intent: parsed.plan.intent,
          assets: parsed.plan.assets,
          lookbackYears: parsed.plan.timeframe.lookbackYears,
          completedAt: parsed.completedAt,
        });
      } catch { /* skip corrupt */ }
    }
  } catch { /* sessionStorage unavailable */ }
  out.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  return out.slice(0, MAX);
}

interface Props {
  onOpen: (id: string, opts?: { saved?: boolean }) => void;
  refreshKey?: unknown;
}

export const RecentRail: React.FC<Props> = ({ onOpen, refreshKey }) => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('recent');
  const [savedItems, setSavedItems] = useState<SavedInvestigationMeta[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const recent = React.useMemo(() => loadRecent(), [refreshKey]);

  useEffect(() => {
    if (tab !== 'saved') return;
    if (!user?.uid) { setSavedItems([]); return; }
    let cancelled = false;
    setLoadingSaved(true);
    listSavedInvestigations(user.uid, 12)
      .then((items) => { if (!cancelled) setSavedItems(items); })
      .catch(() => { if (!cancelled) setSavedItems([]); })
      .finally(() => { if (!cancelled) setLoadingSaved(false); });
    return () => { cancelled = true; };
  }, [tab, user?.uid, refreshKey]);

  const recentEntries: RecentEntry[] = recent;
  const savedEntries: RecentEntry[] = savedItems.map((s) => ({
    id: s.id,
    query: s.query,
    intent: s.intent,
    assets: s.assets,
    lookbackYears: s.lookbackYears,
    completedAt: s.completedAt,
    saved: true,
  }));

  const entries = tab === 'recent' ? recentEntries : savedEntries;
  const empty = entries.length === 0;
  const showSection = tab === 'recent' ? recentEntries.length > 0 : true;
  if (!showSection && tab === 'recent') return null;

  return (
    <section style={wrap}>
      <header style={headerRow}>
        <div style={{ display: 'inline-flex', gap: 4 }}>
          <TabBtn active={tab === 'recent'} onClick={() => setTab('recent')}>Recent</TabBtn>
          <TabBtn active={tab === 'saved'} onClick={() => setTab('saved')}>Saved</TabBtn>
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
          {tab === 'recent' ? 'this session' : 'across devices'}
        </span>
      </header>
      {empty ? (
        <div style={emptyStyle}>
          {tab === 'recent'
            ? 'No investigations yet — ask a question above.'
            : loadingSaved
              ? 'Loading saved investigations…'
              : 'No saved investigations yet. Use Save on a result to keep it here.'}
        </div>
      ) : (
        <div style={grid}>
          {entries.map((e) => <Card key={e.id} entry={e} onOpen={onOpen} uid={user?.uid} />)}
        </div>
      )}
    </section>
  );
};

const TabBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
      padding: '4px 10px',
      borderRadius: 999,
      border: '1px solid ' + (active ? 'var(--foreground)' : 'var(--border)'),
      background: active ? 'var(--foreground)' : 'transparent',
      color: active ? 'var(--background)' : 'var(--muted-foreground)',
      cursor: 'pointer',
    }}
  >{children}</button>
);

const Card: React.FC<{
  entry: RecentEntry;
  onOpen: (id: string, opts?: { saved?: boolean }) => void;
  uid?: string;
}> = ({ entry, onOpen, uid }) => {
  const win = `${entry.lookbackYears}Y`;
  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const runExport = async (fn: (r: ResearchResult) => void) => {
    if (!uid) return;
    setMenuOpen(false);
    setExporting(true);
    try {
      const r = await loadInvestigation(uid, entry.id);
      if (r) fn(r);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* clickable card body */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(entry.id, { saved: entry.saved })}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(entry.id, { saved: entry.saved }); }}
        style={{ ...card, opacity: exporting ? 0.6 : 1 }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--muted)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--card)'; }}
      >
        <div style={cardTopRow}>
          <span style={{
            fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase',
            color: 'var(--muted-foreground)',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            {entry.saved && <Bookmark size={10} />}
            {prettyIntent(entry.intent)}
          </span>
          <ArrowRight size={12} style={{ color: 'var(--muted-foreground)' }} />
        </div>

        <div style={{
          fontSize: 13, fontWeight: 500, color: 'var(--foreground)',
          lineHeight: 1.35, marginBottom: 6,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {entry.query}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {entry.assets.slice(0, 4).map((a) => (
            <span key={a} style={tickerChip}>{a}</span>
          ))}
          {entry.assets.length > 4 && (
            <span style={{ ...tickerChip, color: 'var(--muted-foreground)' }}>+{entry.assets.length - 4}</span>
          )}
        </div>

        <div style={cardBottomRow}>
          <Mono>{win}</Mono>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} />
            <Mono>{relativeTime(entry.completedAt)}</Mono>
          </span>
        </div>
      </div>

      {/* ⋮ export menu — saved cards only */}
      {entry.saved && uid && (
        <div ref={menuRef} style={{ position: 'absolute', top: 8, right: 8 }}>
          <button
            type="button"
            title={exporting ? 'Exporting…' : 'Export options'}
            disabled={exporting}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            style={dotMenuBtn}
          >
            <MoreVertical size={13} />
          </button>
          {menuOpen && (
            <div role="menu" style={exportMenu}>
              <button role="menuitem" type="button" style={exportMenuItem}
                onClick={() => runExport(exportPdf)}>
                <FileType2 size={12} /><span>Download PDF</span>
              </button>
              <button role="menuitem" type="button" style={exportMenuItem}
                onClick={() => runExport(exportMarkdown)}>
                <FileText size={12} /><span>Download Markdown</span>
              </button>
              <button role="menuitem" type="button" style={exportMenuItem}
                onClick={() => runExport(exportJson)}>
                <FileJson size={12} /><span>Download JSON</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
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
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ─── styles ───────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const headerRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
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
const emptyStyle: React.CSSProperties = {
  padding: '14px 16px',
  border: '1px dashed var(--border)',
  borderRadius: 10,
  color: 'var(--muted-foreground)',
  fontSize: 12,
  background: 'var(--card)',
};

const dotMenuBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22,
  border: 'none',
  borderRadius: 6,
  background: 'var(--muted)',
  color: 'var(--muted-foreground)',
  cursor: 'pointer',
  padding: 0,
};

const exportMenu: React.CSSProperties = {
  position: 'absolute', top: '100%', right: 0,
  marginTop: 4,
  minWidth: 170,
  background: 'var(--popover, var(--card))',
  border: '1px solid var(--border)',
  borderRadius: 8,
  boxShadow: '0 6px 16px rgba(0,0,0,0.10)',
  padding: 4,
  zIndex: 30,
};

const exportMenuItem: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', textAlign: 'left',
  padding: '6px 10px',
  border: 'none', background: 'transparent',
  color: 'var(--foreground)',
  fontSize: 12,
  borderRadius: 4,
  cursor: 'pointer',
};
