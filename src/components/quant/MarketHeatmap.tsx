import React, { useState } from 'react';
import { RefreshCw, X as XIcon, PlusCircle } from 'lucide-react';
import { useHeatmapData, useExtendedHeatmapData } from '../../hooks/useScreener';
import type { HeatmapCell, HeatmapSector } from '../../services/screenerService';

// ─── Color scale ──────────────────────────────────────────────────────────────

function heatColor(pct: number): { bg: string; text: string } {
  const abs = Math.abs(pct);
  if (pct > 0) {
    if (abs > 4)   return { bg: 'var(--ds-gain-strong)', text: 'var(--ds-gain-fg)' };
    if (abs > 2)   return { bg: 'var(--ds-gain)',        text: 'var(--ds-gain-fg)' };
    if (abs > 1)   return { bg: 'var(--ds-gain-muted)',  text: 'var(--ds-gain)' };
    if (abs > 0.3) return { bg: 'var(--ds-gain-muted)',  text: 'var(--ds-gain)' };
    return { bg: 'var(--muted)', text: 'var(--muted-foreground)' };
  }
  if (pct < 0) {
    if (abs > 4)   return { bg: 'var(--ds-loss-strong)', text: 'var(--ds-loss-fg)' };
    if (abs > 2)   return { bg: 'var(--ds-loss)',        text: 'var(--ds-loss-fg)' };
    if (abs > 1)   return { bg: 'var(--ds-loss-muted)',  text: 'var(--ds-loss)' };
    if (abs > 0.3) return { bg: 'var(--ds-loss-muted)',  text: 'var(--ds-loss)' };
    return { bg: 'var(--muted)', text: 'var(--muted-foreground)' };
  }
  return { bg: 'var(--muted)', text: 'var(--muted-foreground)' };
}

// ─── HeatCell ─────────────────────────────────────────────────────────────────

const FLEX: Record<HeatmapCell['weight'], string> = {
  xl: '2.2 0 80px', lg: '1.6 0 64px', md: '1.1 0 52px', sm: '0.75 0 42px',
};
const HEIGHT: Record<HeatmapCell['weight'], number> = { xl: 60, lg: 50, md: 42, sm: 36 };

const HeatCell: React.FC<{
  cell: HeatmapCell;
  onSelect: (sym: string) => void;
  isSelected: boolean;
  stretch?: boolean;
}> = ({ cell, onSelect, isSelected, stretch = false }) => {
  const [hovered, setHovered] = useState(false);
  const c = heatColor(cell.changePercent);
  const h = HEIGHT[cell.weight];
  const pos = cell.changePercent > 0;
  const neg = cell.changePercent < 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(cell.symbol)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(cell.symbol)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: stretch ? `${FLEX[cell.weight].split(' ')[0]} 1 ${FLEX[cell.weight].split(' ')[2]}` : FLEX[cell.weight],
        height: stretch ? undefined : h,
        minHeight: h,
        alignSelf: stretch ? 'stretch' : undefined,
        background: c.bg,
        border: isSelected
          ? '2px solid var(--primary)'
          : hovered ? '1px solid rgba(0,0,0,0.2)' : '1px solid rgba(0,0,0,0.06)',
        borderRadius: 5, cursor: 'pointer',
        padding: '4px 7px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1,
        position: 'relative',
        transition: 'transform 0.1s ease',
        transform: hovered ? 'scale(1.025)' : 'scale(1)',
        userSelect: 'none',
      }}
    >
      <div style={{ fontSize: cell.weight === 'xl' ? 11 : cell.weight === 'sm' ? 9 : 10, fontWeight: 700, color: c.text, lineHeight: 1 }}>
        {cell.symbol}
      </div>
      {h >= 44 && (
        <div style={{ fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: c.text, lineHeight: 1 }}>
          {pos ? '+' : neg ? '' : ''}{cell.changePercent.toFixed(2)}%
        </div>
      )}

      {hovered && (
        <div style={{
          position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--foreground)', color: 'var(--background)',
          padding: '6px 9px', borderRadius: 6, fontSize: 10, fontWeight: 500,
          whiteSpace: 'nowrap', zIndex: 10, pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{cell.symbol}</div>
          {cell.price != null && (
            <div style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}>
              ${cell.price >= 1000 ? cell.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : cell.price.toFixed(2)}
            </div>
          )}
          <div style={{ fontVariantNumeric: 'tabular-nums', color: pos ? '#9DCC7A' : neg ? '#F4A68B' : '#999' }}>
            {pos ? '+' : ''}{cell.changePercent.toFixed(2)}%
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Sector row ────────────────────────────────────────────────────────────────

const SectorRow: React.FC<{
  sector: HeatmapSector;
  onSelect: (sym: string) => void;
  selectedSymbol?: string;
  stretch?: boolean;
}> = ({ sector, onSelect, selectedSymbol, stretch = false }) => {
  const pos = sector.avgChange > 0;
  const neg = sector.avgChange < 0;
  const clr = pos ? '#4E6040' : neg ? 'var(--primary)' : 'var(--muted-foreground)';

  return (
    <div style={stretch
      ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }
      : { marginBottom: 12 }
    }>
      {!stretch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {sector.name}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: clr }}>
            {pos ? '+' : ''}{sector.avgChange.toFixed(2)}%
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
      )}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 3,
        ...(stretch ? { flex: 1, alignContent: 'stretch' } : {}),
      }}>
        {sector.cells.map((cell) => (
          <HeatCell key={cell.symbol} cell={cell} onSelect={onSelect} isSelected={cell.symbol === selectedSymbol} stretch={stretch} />
        ))}
      </div>
    </div>
  );
};

// ─── Main heatmap ──────────────────────────────────────────────────────────────

interface Props {
  onSelect: (sym: string) => void;
  selectedSymbol?: string;
  alwaysExpanded?: boolean;
  /** Strips the card chrome — renders only the sector grid as a raw canvas. */
  bare?: boolean;
  /** In bare mode, loads the full cross-asset universe (equity + FX + crypto + commodities + ETFs). */
  extended?: boolean;
  /** Bare mode: show ×-remove controls on each sector header. */
  editMode?: boolean;
  /** Bare mode: sectors in this set are hidden from the canvas. */
  hiddenSectors?: Set<string>;
  /** Bare mode: called when the user removes a sector in edit mode. */
  onHideSector?: (name: string) => void;
  /** Optional pre-fetched sector data — skips the internal hook when provided. */
  sectors?: HeatmapSector[];
  /** Paired with sectors prop: loading state from the parent fetch. */
  sectorsLoading?: boolean;
}

export const MarketHeatmap: React.FC<Props> = ({
  onSelect, selectedSymbol, alwaysExpanded = false, bare = false, extended = false,
  editMode = false, hiddenSectors, onHideSector,
  sectors: sectorsProp, sectorsLoading: sectorsLoadingProp,
}) => {
  const equity = useHeatmapData();
  const full   = useExtendedHeatmapData();
  const internal = extended ? full : equity;
  const data    = sectorsProp ?? internal.data;
  const loading = sectorsLoadingProp ?? internal.loading;
  const error   = sectorsProp ? null : internal.error;
  const refresh = sectorsProp ? (() => {}) : internal.refresh;
  const [expanded, setExpanded] = useState(alwaysExpanded);

  // ── Bare mode: two-column canvas, no stretch, fills parent ──────────────
  if (bare) {
    const populated = data
      .filter((s) => s.cells.length > 0)
      .filter((s) => !hiddenSectors?.has(s.name));
    const mid = Math.ceil(populated.length / 2);
    const col1 = populated.slice(0, mid);
    const col2 = populated.slice(mid);

    const renderSectorGroup = (sector: HeatmapSector) => {
      const pos = sector.avgChange > 0;
      const neg = sector.avgChange < 0;
      const changeClr = pos ? '#4E6040' : neg ? '#C15F3C' : 'var(--muted-foreground)';
      const advancers = sector.cells.filter((c) => c.changePercent > 0).length;
      const breadthPct = sector.cells.length > 0
        ? (advancers / sector.cells.length) * 100 : 50;

      return (
        <div key={sector.name}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5,
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
              flexShrink: 0,
            }}>
              {sector.name}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              color: changeClr, flexShrink: 0,
            }}>
              {pos ? '+' : ''}{sector.avgChange.toFixed(2)}%
            </span>
            <div style={{
              flex: 1, height: 2, background: 'var(--border)',
              borderRadius: 1, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', width: `${breadthPct}%`,
                background: breadthPct >= 50 ? '#4E6040' : '#C15F3C',
                transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{
              fontSize: 8, fontWeight: 500, color: 'var(--muted-foreground)',
              fontVariantNumeric: 'tabular-nums', flexShrink: 0,
            }}>
              {advancers}/{sector.cells.length}
            </span>
            {editMode && onHideSector && (
              <button
                onClick={() => onHideSector(sector.name)}
                title={`Hide ${sector.name}`}
                style={{
                  flexShrink: 0, display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', width: 16, height: 16, borderRadius: 4,
                  border: '1px solid color-mix(in srgb, var(--destructive) 40%, transparent)',
                  background: 'color-mix(in srgb, var(--destructive) 8%, transparent)',
                  color: 'var(--destructive)', cursor: 'pointer', padding: 0,
                  transition: 'background 120ms',
                }}
              >
                <XIcon size={9} />
              </button>
            )}
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 3,
            alignContent: 'flex-start',
          }}>
            {sector.cells.map((cell) => (
              <HeatCell
                key={cell.symbol}
                cell={cell}
                onSelect={onSelect}
                isSelected={cell.symbol === selectedSymbol}
              />
            ))}
          </div>
        </div>
      );
    };

    const renderColumn = (sectors: HeatmapSector[]) => (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        {sectors.map((sector) => renderSectorGroup(sector))}
      </div>
    );

    return (
      <div style={{ flex: 1, display: 'flex', gap: 16, flexDirection: populated.length === 0 ? 'column' : 'row' }}>
        {loading && data.length === 0 ? (
          <div style={{ display: 'flex', gap: 16, width: '100%' }}>
            {[0, 1].map((col) => (
              <div key={col} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i}>
                    <div style={{ height: 12, width: 80, background: 'var(--muted)', borderRadius: 3, marginBottom: 5, animation: 'hm-pulse 1.5s ease infinite' }} />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignContent: 'flex-start' }}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <div key={j} style={{
                          flex: j < 3 ? '2.2 0 80px' : j < 6 ? '1.6 0 64px' : '1.1 0 52px',
                          height: j < 3 ? 60 : j < 6 ? 50 : 42,
                          background: 'var(--muted)', borderRadius: 5,
                          animation: 'hm-pulse 1.5s ease infinite',
                        }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : populated.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 40, border: '1px dashed var(--border)', borderRadius: 8, background: 'var(--card)',
            color: 'var(--muted-foreground)', textAlign: 'center', gap: 10
          }}>
            <p style={{ fontSize: 13, fontWeight: 600 }}>No Heatmap Data Available</p>
            <p style={{ fontSize: 11, maxWidth: 360 }}>
              {error ? `Failed to load: ${error.message}` : 'All sectors are hidden or no symbols were returned by the gateway.'}
            </p>
            <button
              onClick={refresh}
              style={{
                fontSize: 10, fontWeight: 600, padding: '6px 12px', borderRadius: 4,
                background: 'var(--primary)', color: 'var(--primary-foreground)',
                border: 'none', cursor: 'pointer', marginTop: 8
              }}
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <>
            {col1.length > 0 && renderColumn(col1)}
            {col2.length > 0 && renderColumn(col2)}
          </>
        )}
        <style>{`@keyframes hm-pulse { 0%,100%{opacity:0.35} 50%{opacity:0.7} }`}</style>
      </div>
    );
  }

  // ── Standard card mode ────────────────────────────────────────────────────
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden' }}>
      {/* Header — plain div, not a button, to avoid nesting */}
      <div style={{
        padding: '9px 14px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: expanded ? '1px solid var(--border)' : 'none',
        background: 'var(--card)',
      }}>
        {/* Clickable title area */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => !alwaysExpanded && setExpanded((e) => !e)}
          onKeyDown={(e) => e.key === 'Enter' && !alwaysExpanded && setExpanded((x) => !x)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: alwaysExpanded ? 'default' : 'pointer', userSelect: 'none' }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '0.01em' }}>
            Market Heatmap
          </span>
          <span style={{ fontSize: 9, color: 'var(--muted-foreground)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Equity · 6 Sectors · 60 Names
          </span>
          {!alwaysExpanded && (
            <span style={{ fontSize: 10, color: 'var(--muted-foreground)', marginLeft: 2 }}>
              {expanded ? '▲' : '▼'}
            </span>
          )}
        </div>

        {/* Refresh — separate from the title click target */}
        {loading && <span style={{ fontSize: 9, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>Loading…</span>}
        <button
          onClick={(e) => { e.stopPropagation(); refresh(); }}
          title="Refresh heatmap"
          style={{
            width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)',
            background: 'var(--background)', color: 'var(--muted-foreground)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <RefreshCw size={10} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '10px 12px 12px' }}>
          {error && (
            <p style={{ fontSize: 11, color: 'var(--primary)', margin: '0 0 10px' }}>
              Heatmap unavailable — {error.message}
            </p>
          )}
          {loading && data.length === 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {Array.from({ length: 30 }).map((_, i) => (
                <div key={i} style={{ flex: '1 0 52px', height: 42, background: 'var(--muted)', borderRadius: 5, animation: 'pulse 1.5s ease infinite' }} />
              ))}
            </div>
          ) : (
            data.map((sector) => (
              <SectorRow key={sector.name} sector={sector} onSelect={onSelect} selectedSymbol={selectedSymbol} />
            ))
          )}
          <p style={{ fontSize: 9, color: 'var(--muted-foreground)', margin: '6px 0 0', letterSpacing: '0.02em' }}>
            Color intensity proportional to session change. Click any tile to open intelligence panel.
          </p>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
      `}</style>
    </div>
  );
};
