import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookmarkCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { DiscoveryTabs } from '../components/quant/DiscoveryTabs';
import { ScreenerTable } from '../components/quant/ScreenerTable';
import { MarketHeatmap } from '../components/quant/MarketHeatmap';
import { IntelligenceSidePanel } from '../components/quant/IntelligenceSidePanel';
import { InstrumentSelector } from '../components/quant/InstrumentSelector';
import { Disclaimer } from '../components/quant/Disclaimer';
import { useScreenerRows, useMarketPulse } from '../hooks/useScreener';
import { getMarketStatus } from '../services/screenerService';
import type { DiscoveryTab, ScreenerRow } from '../services/screenerService';

// ─── Persistence ──────────────────────────────────────────────────────────────

const PINNED_KEY = 'deplyze_pinned_instruments';
const TAB_KEY    = 'deplyze_screener_tab';

function loadPinned(): string[] {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY) ?? '[]'); } catch { return []; }
}
function savePinned(syms: string[]) { localStorage.setItem(PINNED_KEY, JSON.stringify(syms)); }
function loadTab(): DiscoveryTab {
  return (localStorage.getItem(TAB_KEY) as DiscoveryTab | null) ?? 'gainers';
}

// ─── Pulse index cards ────────────────────────────────────────────────────────

const STATUS_COLORS = {
  open:         { bg: 'rgba(78,96,64,0.1)',  text: '#4E6040', dot: '#4E6040'  },
  'pre-market': { bg: 'rgba(201,162,39,0.1)',text: '#9A7B1D', dot: '#C9A227'  },
  'after-hours':{ bg: 'rgba(106,155,204,0.1)',text:'#1C6BBB', dot: '#6A9BCC' },
  closed:       { bg: 'rgba(177,173,161,0.1)',text:'#8A8680', dot: '#B1ADA1' },
};

const LiveDot: React.FC<{ color: string; animate: boolean }> = ({ color, animate }) => {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setOn((v) => !v), 1100);
    return () => clearInterval(id);
  }, [animate]);
  return (
    <span style={{
      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
      background: color, flexShrink: 0,
      boxShadow: on && animate ? `0 0 0 3px ${color}33` : undefined,
      transition: 'box-shadow 0.4s ease',
    }} />
  );
};

const PulseBar: React.FC = () => {
  const { data } = useMarketPulse();
  const status = getMarketStatus();
  const sc = STATUS_COLORS[status];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 24px', borderBottom: '1px solid var(--border)',
      background: 'var(--card)', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0,
    }}>
      {/* Status badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 999,
        background: sc.bg, flexShrink: 0,
      }}>
        <LiveDot color={sc.dot} animate={status === 'open'} />
        <span style={{ fontSize: 10, fontWeight: 700, color: sc.text, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          {status === 'open' ? 'Market Open' : status === 'pre-market' ? 'Pre-Market' : status === 'after-hours' ? 'After Hours' : 'Market Closed'}
        </span>
      </div>

      {/* Index quote cards */}
      {(data?.indices ?? []).map((idx) => {
        const pos = idx.changePercent > 0, neg = idx.changePercent < 0;
        const clr = pos ? '#4E6040' : neg ? '#C15F3C' : '#8A8680';
        return (
          <div key={idx.symbol} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--background)',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.04em' }}>{idx.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', letterSpacing: '-0.01em' }}>
              {idx.price >= 1000 ? idx.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : idx.price.toFixed(2)}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: clr }}>
              {pos ? '▲' : neg ? '▼' : '·'} {Math.abs(idx.changePercent).toFixed(2)}%
            </span>
          </div>
        );
      })}

      {/* Breadth */}
      {data && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Breadth</span>
          <span style={{ fontSize: 10, color: '#4E6040', fontWeight: 700 }}>▲{data.advancers}</span>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>·</span>
          <span style={{ fontSize: 10, color: '#C15F3C', fontWeight: 700 }}>▼{data.decliners}</span>
        </div>
      )}

      {/* Risk mode */}
      {data && (
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <span className={`ds-badge ${data.riskMode === 'risk-on' ? 'ds-pill-low' : data.riskMode === 'risk-off' ? 'ds-pill-critical' : 'ds-pill-neutral'}`}
            style={{ fontSize: 9, padding: '2px 8px', fontWeight: 700 }}>
            {data.riskMode === 'risk-on' ? 'Risk-On' : data.riskMode === 'risk-off' ? 'Risk-Off' : 'Neutral'}
          </span>
        </div>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export const InstrumentIntelligence: React.FC = () => {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<DiscoveryTab>(loadTab);
  const [pinned, setPinned]       = useState<string[]>(loadPinned);
  const [selectedRow, setSelectedRow] = useState<ScreenerRow | null>(null);

  const screener = useScreenerRows(activeTab, pinned);

  const handleTabChange = useCallback((tab: DiscoveryTab) => {
    setActiveTab(tab);
    setSelectedRow(null);
    localStorage.setItem(TAB_KEY, tab);
  }, []);

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

  // Close panel on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedRow(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const isPanelOpen = selectedRow !== null;
  const panelWidth = 360;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>

      {/* ── Page heading ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '12px 24px 10px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--foreground)', margin: 0, lineHeight: 1 }}>
            Market Discovery
          </h1>
          <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '3px 0 0', lineHeight: 1 }}>
            Live movers · Cross-market intelligence · AI-native context
          </p>
        </div>

        {/* Search */}
        <div style={{ flex: '0 0 320px' }}>
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

      {/* ── Pulse index bar ── */}
      <PulseBar />

      {/* ── Discovery tabs ── */}
      <DiscoveryTabs active={activeTab} onChange={handleTabChange} savedCount={pinned.length} />

      {/* ── Content area (table + overlay panel) ── */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>

        {/* Scrollable left column: table + heatmap */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          // When panel is open, leave right space so nothing is hidden under the panel
          // We use paddingRight instead of grid to avoid compressing the table
          paddingRight: isPanelOpen ? panelWidth : 0,
          transition: 'padding-right 0.22s ease',
        }}>
          {/* Screener table — takes all available height */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
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

          {/* Heatmap section */}
          <div style={{
            flexShrink: 0, padding: '10px 16px',
            borderTop: '1px solid var(--border)',
            background: 'var(--background)',
          }}>
            <MarketHeatmap
              onSelect={(sym) => {
                const existing = screener.data.find((r) => r.symbol === sym);
                if (existing) {
                  setSelectedRow((prev) => prev?.symbol === sym ? null : existing);
                } else {
                  setSelectedRow({
                    symbol: sym, name: sym, assetClass: 'equity',
                    price: 0, changePercent: 0,
                    volatilityState: 'normal', momentumScore: 0,
                    lastUpdated: Date.now(),
                  });
                }
              }}
              selectedSymbol={selectedRow?.symbol}
            />
          </div>

          {/* Disclaimer */}
          <div style={{ padding: '0 16px 12px', flexShrink: 0 }}>
            <Disclaimer />
          </div>
        </div>

        {/* Intelligence side panel — absolute overlay, never compresses table */}
        {isPanelOpen && (
          <div
            style={{
              position: 'absolute',
              right: 0, top: 0, bottom: 0,
              width: panelWidth,
              zIndex: 10,
              boxShadow: '-6px 0 24px rgba(0,0,0,0.09)',
              animation: 'slideIn 0.2s ease',
              overflow: 'hidden',
            }}
          >
            <IntelligenceSidePanel
              row={selectedRow}
              onClose={() => setSelectedRow(null)}
              onSave={toggleSave}
              isSaved={selectedRow ? pinned.includes(selectedRow.symbol) : false}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @media (max-width: 680px) {
          /* On small screens the panel becomes full-width overlay */
        }
      `}</style>
    </div>
  );
};
