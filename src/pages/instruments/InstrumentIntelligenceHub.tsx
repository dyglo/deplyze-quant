import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, LayoutGrid, Search, BookOpen,
  Activity, GitFork, Clock, ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { MarketHeatmap } from '../../components/quant/MarketHeatmap';
import { RegimeStatusChip, RiskLevelChip } from '../../components/quant/SystemAnalyzingState';
import { Disclaimer } from '../../components/quant/Disclaimer';
import { useCompositeRegime, useRiskEnvironment } from '../../hooks/useAgentIntelligence';
import { useMarketPulse, useHeatmapData } from '../../hooks/useScreener';
import { getMarketStatus } from '../../services/screenerService';

// ─── Live clock ───────────────────────────────────────────────────────────────

const LiveClock: React.FC = () => {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const str = time.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  return (
    <span style={{
      fontSize: 11, fontVariantNumeric: 'tabular-nums',
      fontWeight: 500, color: 'var(--muted-foreground)',
      letterSpacing: '0.04em', fontFamily: 'ui-monospace, monospace',
    }}>
      {str} ET
    </span>
  );
};

// ─── Status dot ───────────────────────────────────────────────────────────────

const StatusDot: React.FC<{ active: boolean; color: string }> = ({ active, color }) => {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setOn(v => !v), 1100);
    return () => clearInterval(id);
  }, [active]);
  return (
    <span style={{
      width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
      background: color, flexShrink: 0,
      boxShadow: on && active ? `0 0 0 3px ${color}30` : 'none',
      transition: 'box-shadow 0.4s ease',
    }} />
  );
};

// ─── Workspace dropdown ───────────────────────────────────────────────────────

const WORKSPACES = [
  { icon: <TrendingUp size={13} />, label: 'Movers',               route: '/instruments/movers',     desc: 'What is moving right now?' },
  { icon: <LayoutGrid size={13} />, label: 'Heatmap',              route: '/instruments/heatmap',    desc: 'Where is participation?' },
  { icon: <Search size={13} />,     label: 'Instrument Research',  route: '/instruments/movers',     desc: 'What defines this asset?' },
  { icon: <BookOpen size={13} />,   label: 'Narrative Intelligence',route: '/instruments/narratives', desc: 'Which themes dominate?' },
  { icon: <Activity size={13} />,   label: 'Volatility Desk',      route: '/instruments/volatility', desc: 'Where is instability?' },
  { icon: <GitFork size={13} />,    label: 'Relations Map',        route: '/relations-map',          desc: 'How are systems connected?' },
  { icon: <Clock size={13} />,      label: 'Historical Analogs',   route: '/historical-intelligence',desc: 'What resembles now?' },
];

const WorkspaceDropdown: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', height: 30, borderRadius: 7,
          border: `1px solid ${open ? 'var(--primary)' : 'var(--border)'}`,
          background: open ? 'rgba(193,95,60,0.06)' : 'var(--card)',
          color: open ? 'var(--primary)' : 'var(--foreground)',
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
          transition: 'border-color 0.15s, color 0.15s, background 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        Explore
        <ChevronDown
          size={12}
          style={{
            transition: 'transform 0.15s',
            transform: open ? 'rotate(180deg)' : 'none',
            color: open ? 'var(--primary)' : 'var(--muted-foreground)',
          }}
        />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          width: 260,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          zIndex: 50,
          overflow: 'hidden',
          animation: 'dropIn 0.14s ease',
        }}>
          <div style={{
            padding: '8px 12px 6px',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
            }}>
              Deep Workspaces
            </span>
          </div>
          {WORKSPACES.map((ws) => (
            <button
              key={ws.label}
              onClick={() => { setOpen(false); navigate(ws.route); }}
              style={{
                width: '100%', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px',
                border: 'none', background: 'transparent',
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ color: 'var(--muted-foreground)', flexShrink: 0, display: 'flex' }}>
                {ws.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.2 }}>
                  {ws.label}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 1, fontStyle: 'italic' }}>
                  {ws.desc}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <style>{`@keyframes dropIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:none; } }`}</style>
    </div>
  );
};

// ─── Header bar ───────────────────────────────────────────────────────────────

const STATUS_CFG = {
  open:          { dot: '#4E6040', label: 'Market Open',    color: '#4E6040' },
  'pre-market':  { dot: '#C9A227', label: 'Pre-Market',    color: '#9A7B1D' },
  'after-hours': { dot: '#6A9BCC', label: 'After Hours',   color: '#1C6BBB' },
  closed:        { dot: '#B1ADA1', label: 'Closed',        color: '#8A8680' },
};

const HeaderBar: React.FC = () => {
  const navigate = useNavigate();
  const { data: pulse } = useMarketPulse();
  const regime = useCompositeRegime();
  const risk = useRiskEnvironment();
  const { refresh, loading } = useHeatmapData();
  const status = getMarketStatus();
  const sc = STATUS_CFG[status];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      height: 46, padding: '0 20px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--card)',
      flexShrink: 0,
      position: 'relative', zIndex: 20,
    }}>

      {/* Page identity */}
      <div style={{ flexShrink: 0, paddingRight: 18 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--foreground)' }}>
          Instrument Intelligence
        </span>
      </div>

      <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

      {/* Market status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', flexShrink: 0 }}>
        <StatusDot active={status === 'open'} color={sc.dot} />
        <span style={{ fontSize: 11, fontWeight: 600, color: sc.color }}>{sc.label}</span>
      </div>

      <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

      {/* Index quotes — scrollable */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: 0,
        overflowX: 'auto', scrollbarWidth: 'none',
        padding: '0 16px',
      }}>
        {(pulse?.indices ?? []).map((idx, i) => {
          const pos = idx.changePercent > 0;
          const neg = idx.changePercent < 0;
          const clr = pos ? '#4E6040' : neg ? '#C15F3C' : '#8A8680';
          return (
            <React.Fragment key={idx.symbol}>
              {i > 0 && <span style={{ color: 'var(--border)', fontSize: 13, padding: '0 10px', flexShrink: 0 }}>·</span>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.04em' }}>
                  {idx.label}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>
                  {idx.price >= 1000
                    ? idx.price.toLocaleString(undefined, { maximumFractionDigits: 0 })
                    : idx.price.toFixed(2)}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: clr }}>
                  {pos ? '▲' : neg ? '▼' : '·'}{Math.abs(idx.changePercent).toFixed(2)}%
                </span>
              </div>
            </React.Fragment>
          );
        })}

        {/* Breadth */}
        {pulse && (
          <>
            <span style={{ color: 'var(--border)', fontSize: 13, padding: '0 10px', flexShrink: 0 }}>·</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Breadth
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                color: pulse.breadthPct >= 50 ? '#4E6040' : '#C15F3C',
              }}>
                {pulse.breadthPct}%
              </span>
            </div>
          </>
        )}
      </div>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, flexShrink: 0 }}>
        {regime.regimeLabel && (
          <RegimeStatusChip regime={regime.regimeLabel} confidence={regime.data?.confidence} />
        )}
        {risk.riskLevel && <RiskLevelChip riskLevel={risk.riskLevel} />}

        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <LiveClock />
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        {/* Refresh */}
        <button
          onClick={refresh}
          title="Refresh heatmap"
          style={{
            width: 28, height: 28, borderRadius: 6,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--muted-foreground)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
        </button>

        {/* Workspace nav */}
        <WorkspaceDropdown />
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
};

// ─── Canvas subheader (breadth only, no nav link) ─────────────────────────────

const CanvasSubheader: React.FC = () => {
  const { data: pulse } = useMarketPulse();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '7px 24px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>
        Market Structure
      </span>
      <span style={{ color: 'var(--border)', fontSize: 11 }}>·</span>
      <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
        Equity · 6 sectors · 60 instruments
      </span>
      {pulse && (
        <>
          <span style={{ color: 'var(--border)', fontSize: 11 }}>·</span>
          <span style={{ fontSize: 10, color: pulse.advancers >= pulse.decliners ? '#4E6040' : '#C15F3C' }}>
            {pulse.advancers} advancing
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
            {pulse.decliners} declining
          </span>
        </>
      )}
    </div>
  );
};

// ─── Hub page ──────────────────────────────────────────────────────────────────

export const InstrumentIntelligenceHub: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>

      <HeaderBar />
      <CanvasSubheader />

      {/* Full-height heatmap canvas — flex column so bare child can use flex: 1 */}
      <div style={{
        flex: 1, minHeight: 0, overflow: 'hidden',
        padding: '10px 24px 8px',
        display: 'flex', flexDirection: 'column',
      }}>
        <MarketHeatmap
          bare
          extended
          onSelect={(sym) => navigate(`/instruments/${encodeURIComponent(sym)}`)}
        />
      </div>

      {/* Disclaimer pinned at foot */}
      <div style={{ padding: '4px 24px 8px', flexShrink: 0, borderTop: '1px solid var(--border)' }}>
        <Disclaimer />
      </div>
    </div>
  );
};
