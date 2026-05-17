import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useHeatmapData } from '../../hooks/useScreener';
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
}> = ({ cell, onSelect, isSelected }) => {
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
        flex: FLEX[cell.weight], height: h,
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
}> = ({ sector, onSelect, selectedSymbol }) => {
  const pos = sector.avgChange > 0;
  const neg = sector.avgChange < 0;
  const clr = pos ? '#4E6040' : neg ? 'var(--primary)' : 'var(--muted-foreground)';

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {sector.name}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: clr }}>
          {pos ? '+' : ''}{sector.avgChange.toFixed(2)}%
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {sector.cells.map((cell) => (
          <HeatCell key={cell.symbol} cell={cell} onSelect={onSelect} isSelected={cell.symbol === selectedSymbol} />
        ))}
      </div>
    </div>
  );
};

// ─── Main heatmap ──────────────────────────────────────────────────────────────

interface Props {
  onSelect: (sym: string) => void;
  selectedSymbol?: string;
}

export const MarketHeatmap: React.FC<Props> = ({ onSelect, selectedSymbol }) => {
  const { data, loading, error, refresh } = useHeatmapData();
  const [expanded, setExpanded] = useState(false);

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
          onClick={() => setExpanded((e) => !e)}
          onKeyDown={(e) => e.key === 'Enter' && setExpanded((x) => !x)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer', userSelect: 'none' }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '0.01em' }}>
            Market Heatmap
          </span>
          <span style={{ fontSize: 9, color: 'var(--muted-foreground)', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Equity · 6 Sectors · 60 Names
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)', marginLeft: 2 }}>
            {expanded ? '▲' : '▼'}
          </span>
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
