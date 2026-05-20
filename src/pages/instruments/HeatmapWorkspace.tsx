import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { MarketHeatmap } from '../../components/quant/MarketHeatmap';
import { PulseBar } from '../../components/quant/PulseBar';
import { Disclaimer } from '../../components/quant/Disclaimer';
import { useHeatmapData } from '../../hooks/useScreener';

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

// ─── Workspace ────────────────────────────────────────────────────────────────

export const HeatmapWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const [overlay, setOverlay] = useState<OverlayMode>('return');
  const [selectedSymbol, setSelectedSymbol] = useState<string | undefined>();
  const { refresh, loading } = useHeatmapData();

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

        {/* Right info rail */}
        <div style={{
          width: 200, flexShrink: 0,
          borderLeft: '1px solid var(--border)',
          background: 'var(--card)',
          padding: '16px 14px',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 8 }}>
              Reading the Heatmap
            </div>
            <p style={{ fontSize: 10, color: 'var(--muted-foreground)', lineHeight: 1.6, margin: 0 }}>
              Each tile represents one instrument. Color encodes session return. Tile size encodes market-cap tier within the sector.
            </p>
          </div>

          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 8 }}>
              Universe
            </div>
            <p style={{ fontSize: 10, color: 'var(--muted-foreground)', lineHeight: 1.6, margin: 0 }}>
              6 equity sectors · 60 instruments · Mega and large-cap weighted
            </p>
          </div>

          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 8 }}>
              Active Overlay
            </div>
            <p style={{ fontSize: 10, color: 'var(--foreground)', fontWeight: 600, margin: '0 0 4px' }}>
              {OVERLAY_OPTIONS.find((o) => o.id === overlay)?.label}
            </p>
            <p style={{ fontSize: 10, color: 'var(--muted-foreground)', lineHeight: 1.6, margin: 0 }}>
              {OVERLAY_OPTIONS.find((o) => o.id === overlay)?.description}
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
