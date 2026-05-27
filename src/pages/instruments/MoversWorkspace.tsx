import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { BookmarkCheck, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { FilterRail } from '../../components/quant/FilterRail';
import { ScreenerTable } from '../../components/quant/ScreenerTable';
import { IntelligenceSidePanel } from '../../components/quant/IntelligenceSidePanel';
import { InstrumentSelector } from '../../components/quant/InstrumentSelector';
import { PulseBar } from '../../components/quant/PulseBar';
import { Disclaimer } from '../../components/quant/Disclaimer';
import { useScreenerRows } from '../../hooks/useScreener';
import type { DiscoveryTab, ScreenerRow } from '../../services/screenerService';

// ─── Persistence ──────────────────────────────────────────────────────────────

const PINNED_KEY = 'deplyze_pinned_instruments';
const TAB_KEY    = 'deplyze_screener_tab';

function loadPinned(): string[] {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY) ?? '[]'); } catch { return []; }
}
function savePinned(syms: string[]) { localStorage.setItem(PINNED_KEY, JSON.stringify(syms)); }
const VALID_TABS: DiscoveryTab[] = [
  'gainers', 'losers', 'active', 'unusual-volume', 'vol-expansion', 'gap-up', 'gap-down',
  'mega-caps', 'sectors', 'etfs', 'fx', 'commodities', 'crypto', 'saved',
];
function loadTab(): DiscoveryTab {
  return (localStorage.getItem(TAB_KEY) as DiscoveryTab | null) ?? 'gainers';
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export const MoversWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const queryTab = searchParams.get('tab');
  const initialTab = queryTab && VALID_TABS.includes(queryTab as DiscoveryTab)
    ? (queryTab as DiscoveryTab)
    : loadTab();
  const [activeTab, setActiveTab] = useState<DiscoveryTab>(initialTab);
  const [pinned, setPinned]       = useState<string[]>(loadPinned);
  const [selectedRow, setSelectedRow] = useState<ScreenerRow | null>(null);

  const screener = useScreenerRows(activeTab, pinned);

  const handleTabChange = useCallback((tab: DiscoveryTab) => {
    setActiveTab(tab);
    setSelectedRow(null);
    localStorage.setItem(TAB_KEY, tab);
    // Keep the URL clean once the user navigates within the workspace.
    if (searchParams.has('tab')) {
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const addToSaved = useCallback((sym: string) => {
    const upper = sym.toUpperCase();
    if (pinned.includes(upper)) { toast.info(`${upper} already saved`); return; }
    const next = [...pinned, upper];
    setPinned(next);
    savePinned(next);
    toast.success(`${upper} saved`);
  }, [pinned]);

  const removeFromSaved = useCallback((sym: string) => {
    const next = pinned.filter((s) => s !== sym.toUpperCase());
    setPinned(next);
    savePinned(next);
    toast.info(`${sym} removed`);
  }, [pinned]);

  const toggleSave = useCallback((sym: string) => {
    if (pinned.includes(sym.toUpperCase())) removeFromSaved(sym);
    else addToSaved(sym);
  }, [pinned, addToSaved, removeFromSaved]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedRow(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const isPanelOpen = selectedRow !== null;
  const panelWidth = 360;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '10px 20px 10px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
        flexShrink: 0,
      }}>
        <Link
          to="/instruments"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)',
            textDecoration: 'none', flexShrink: 0,
          }}
          title="Back to Market Discovery Hub"
        >
          <ChevronLeft size={12} />
          Discovery
        </Link>

        <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--foreground)', margin: 0, lineHeight: 1 }}>
            Movers
          </h1>
          <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '2px 0 0', lineHeight: 1, fontStyle: 'italic' }}>
            What is moving right now?
          </p>
        </div>

        <div style={{ flex: '0 0 300px' }}>
          <InstrumentSelector
            onSelect={(s) => navigate(`/instruments/${encodeURIComponent(s)}`)}
            onAdd={addToSaved}
            addLabel="Save"
            placeholder="Search any symbol…"
          />
        </div>

        {pinned.length > 0 && (
          <button
            onClick={() => handleTabChange('saved')}
            style={{
              height: 32, padding: '0 12px', borderRadius: 7, flexShrink: 0,
              border: `1px solid ${activeTab === 'saved' ? 'var(--primary)' : 'var(--border)'}`,
              background: activeTab === 'saved' ? 'rgba(193,95,60,0.06)' : 'transparent',
              color: activeTab === 'saved' ? 'var(--primary)' : 'var(--muted-foreground)',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <BookmarkCheck size={12} />
            Saved ({pinned.length})
          </button>
        )}
      </div>

      {/* ── Pulse bar ── */}
      <PulseBar />

      {/* ── Main content: filter rail + screener + side panel ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>

        {/* Filter rail */}
        <FilterRail
          active={activeTab}
          onChange={handleTabChange}
          savedCount={pinned.length}
        />

        {/* Screener area */}
        <div style={{
          flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            flex: 1, minHeight: 0, overflow: 'hidden',
            paddingRight: isPanelOpen ? panelWidth : 0,
            transition: 'padding-right 0.22s ease',
          }}>
            <ScreenerTable
              rows={screener.data}
              loading={screener.loading}
              error={screener.error}
              selectedSymbol={selectedRow?.symbol}
              onSelect={(row) => setSelectedRow((prev) => prev?.symbol === row.symbol ? null : row)}
              onRefresh={screener.refresh}
              tab={activeTab}
            />
          </div>

          {/* Side panel overlay */}
          {isPanelOpen && (
            <div style={{
              position: 'absolute',
              right: 0, top: 0, bottom: 0,
              width: panelWidth,
              zIndex: 10,
              boxShadow: '-6px 0 24px rgba(0,0,0,0.09)',
              animation: 'slideIn 0.2s ease',
              overflow: 'hidden',
            }}>
              <IntelligenceSidePanel
                row={selectedRow}
                onClose={() => setSelectedRow(null)}
                onSave={toggleSave}
                isSaved={selectedRow ? pinned.includes(selectedRow.symbol) : false}
              />
            </div>
          )}

          {/* Disclaimer at the bottom */}
          <div style={{ padding: '8px 16px', flexShrink: 0 }}>
            <Disclaimer />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
};
