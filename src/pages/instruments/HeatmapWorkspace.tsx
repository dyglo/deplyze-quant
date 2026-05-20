import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { MarketHeatmap } from '../../components/quant/MarketHeatmap';
import { PulseBar } from '../../components/quant/PulseBar';
import { Disclaimer } from '../../components/quant/Disclaimer';
import { useHeatmapData, useMarketPulse } from '../../hooks/useScreener';
import type { HeatmapSector, MarketPulseData } from '../../services/screenerService';

// ─── Overlay modes ─────────────────────────────────────────────────────────────

type OverlayMode = 'return' | 'volatility' | 'none';

const OVERLAY_OPTIONS: { id: OverlayMode; label: string; description: string }[] = [
  { id: 'return',     label: 'Return',     description: 'Session change %' },
  { id: 'volatility', label: 'Volatility', description: 'Move magnitude' },
  { id: 'none',       label: 'Flat',       description: 'No overlay' },
];

// ─── Legend ────────────────────────────────────────────────────────────────────

const ColorLegend: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--ds-loss-strong)' }} />
      <span style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>&lt; −4%</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--ds-loss)' }} />
      <span style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>−2 to −4%</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--muted)' }} />
      <span style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>Flat</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--ds-gain)' }} />
      <span style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>+2 to +4%</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--ds-gain-strong)' }} />
      <span style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>&gt; +4%</span>
    </div>
  </div>
);

// ─── Sector intelligence rail ─────────────────────────────────────────────────

const WorkspaceSectorRail: React.FC<{
  data: HeatmapSector[];
  pulse: MarketPulseData | null;
  overlay: OverlayMode;
}> = ({ data, pulse, overlay }) => {
  const populated = data.filter((s) => s.cells.length > 0);

  const maxAbsChange = useMemo(
    () => Math.max(...populated.map((s) => Math.abs(s.avgChange)), 0.01),
    [populated],
  );
  const sortedSectors = useMemo(
    () => [...populated].sort((a, b) => b.avgChange - a.avgChange),
    [populated],
  );
  const allCells = useMemo(() => data.flatMap((s) => s.cells), [data]);
  const leaders = useMemo(
    () => [...allCells].sort((a, b) => b.changePercent - a.changePercent).slice(0, 5),
    [allCells],
  );
  const laggards = useMemo(
    () => [...allCells].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5),
    [allCells],
  );

  const activeOpt = OVERLAY_OPTIONS.find((o) => o.id === overlay)!;

  return (
    <div style={{
      width: 220, flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      background: 'var(--card)',
      padding: '14px 14px',
      overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* Active overlay context */}
      <div style={{ marginBottom: 18 }}>
        <div style={ws_label}>Active Overlay</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{
            display: 'inline-block', padding: '2px 7px', borderRadius: 4, fontSize: 10,
            fontWeight: 700, background: 'rgba(193,95,60,0.08)',
            color: 'var(--primary)', border: '1px solid rgba(193,95,60,0.2)',
          }}>
            {activeOpt.label}
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{activeOpt.description}</span>
        </div>
      </div>

      {/* Market breadth */}
      {pulse && (
        <div style={{ marginBottom: 18 }}>
          <div style={ws_label}>Market Breadth</div>
          <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 5 }}>
            <div style={{ height: '100%', width: `${pulse.breadthPct}%`, background: '#4E6040', transition: 'width 0.5s' }} />
            <div style={{ height: '100%', flex: 1, background: '#C15F3C' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 9, color: '#4E6040', fontWeight: 600 }}>{pulse.advancers} adv</span>
            <span style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>{pulse.unchanged} flat</span>
            <span style={{ fontSize: 9, color: '#C15F3C', fontWeight: 600 }}>{pulse.decliners} dec</span>
          </div>
        </div>
      )}

      {/* Sector breakdown */}
      {sortedSectors.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={ws_label}>Sector Breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedSectors.map((sector) => {
              const pos = sector.avgChange > 0;
              const neg = sector.avgChange < 0;
              const clr = pos ? '#4E6040' : neg ? '#C15F3C' : '#8A8680';
              const barPct = Math.round((Math.abs(sector.avgChange) / maxAbsChange) * 100);
              const advancers = sector.cells.filter((c) => c.changePercent > 0).length;
              const advPct = sector.cells.length > 0
                ? (advancers / sector.cells.length) * 100 : 50;

              return (
                <div key={sector.name}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--foreground)' }}>
                      {sector.name}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: clr }}>
                      {pos ? '+' : ''}{sector.avgChange.toFixed(2)}%
                    </span>
                  </div>
                  {/* Return magnitude bar */}
                  <div style={{ height: 3, background: 'var(--muted)', borderRadius: 2, overflow: 'hidden', marginBottom: 2 }}>
                    <div style={{ height: '100%', width: `${barPct}%`, background: clr, transition: 'width 0.4s' }} />
                  </div>
                  {/* Breadth split bar */}
                  <div style={{ display: 'flex', height: 2, borderRadius: 1, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${advPct}%`, background: '#4E6040' }} />
                    <div style={{ height: '100%', flex: 1, background: '#C15F3C' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                    <span style={{ fontSize: 8, color: '#4E6040' }}>{advancers} adv</span>
                    <span style={{ fontSize: 8, color: '#C15F3C' }}>{sector.cells.length - advancers} dec</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ height: 1, background: 'var(--border)', marginBottom: 14 }} />

      {/* Leaders */}
      {leaders.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={ws_label}>Session Leaders</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {leaders.map((cell) => (
              <div key={cell.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>{cell.symbol}</span>
                <span style={{ fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#4E6040' }}>
                  +{cell.changePercent.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Laggards */}
      {laggards.length > 0 && (
        <div>
          <div style={ws_label}>Session Laggards</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {laggards.map((cell) => (
              <div key={cell.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>{cell.symbol}</span>
                <span style={{ fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#C15F3C' }}>
                  {cell.changePercent.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ws_label: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 8,
};

// ─── Workspace ────────────────────────────────────────────────────────────────

export const HeatmapWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const [overlay, setOverlay] = useState<OverlayMode>('return');
  const [selectedSymbol, setSelectedSymbol] = useState<string | undefined>();
  const { data, refresh, loading } = useHeatmapData();
  const { data: pulse } = useMarketPulse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '10px 20px',
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
        >
          <ChevronLeft size={12} />
          Discovery
        </Link>

        <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--foreground)', margin: 0, lineHeight: 1 }}>
            Heatmap
          </h1>
          <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '2px 0 0', lineHeight: 1, fontStyle: 'italic' }}>
            Where is participation concentrated?
          </p>
        </div>

        {/* Overlay selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 600, marginRight: 4 }}>Overlay:</span>
          {OVERLAY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setOverlay(opt.id)}
              title={opt.description}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                border: `1px solid ${overlay === opt.id ? 'var(--primary)' : 'var(--border)'}`,
                background: overlay === opt.id ? 'rgba(193,95,60,0.08)' : 'transparent',
                color: overlay === opt.id ? 'var(--primary)' : 'var(--muted-foreground)',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={refresh}
          title="Refresh heatmap"
          style={{
            width: 30, height: 30, borderRadius: 6,
            border: '1px solid var(--border)', background: 'var(--background)',
            color: 'var(--muted-foreground)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
        </button>
      </div>

      <PulseBar />

      {/* ── Heatmap canvas + right rail ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>

        {/* Full heatmap */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px 20px 0' }}>
          <MarketHeatmap
            alwaysExpanded
            onSelect={(sym) => {
              setSelectedSymbol(sym === selectedSymbol ? undefined : sym);
              navigate(`/instruments/${encodeURIComponent(sym)}`);
            }}
            selectedSymbol={selectedSymbol}
          />

          {/* Legend + disclaimer */}
          <div style={{ padding: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <ColorLegend />
            <p style={{ fontSize: 9, color: 'var(--muted-foreground)', margin: 0 }}>
              Click any tile to open instrument research. Color intensity proportional to session change.
            </p>
          </div>

          <Disclaimer />
        </div>

        {/* Right intelligence rail */}
        <WorkspaceSectorRail
          data={data}
          pulse={pulse}
          overlay={overlay}
        />
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
