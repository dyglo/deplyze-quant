import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, LayoutGrid, Search, BookOpen,
  Activity, GitFork, Clock, ChevronDown,
  RefreshCw, ArrowLeft, PlusCircle, SlidersHorizontal,
} from 'lucide-react';
import { InstrumentSelector } from '../../components/quant/InstrumentSelector';
import { MarketHeatmap } from '../../components/quant/MarketHeatmap';
import { RegimeStatusChip, RiskLevelChip } from '../../components/quant/SystemAnalyzingState';
import { Disclaimer } from '../../components/quant/Disclaimer';
import { useCompositeRegime, useRiskEnvironment } from '../../hooks/useAgentIntelligence';
import { useMarketPulse, useHeatmapData, useExtendedHeatmapData } from '../../hooks/useScreener';
import { getMarketStatus } from '../../services/screenerService';
import type { HeatmapSector } from '../../services/screenerService';

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

type Workspace =
  | { icon: React.ReactNode; label: string; desc: string; route: string; action?: never }
  | { icon: React.ReactNode; label: string; desc: string; route?: never; action: 'pick-symbol' };

const WORKSPACES: Workspace[] = [
  { icon: <TrendingUp size={13} />, label: 'Movers',                route: '/instruments/movers',      desc: 'What is moving right now?' },
  { icon: <LayoutGrid size={13} />, label: 'Heatmap',               route: '/instruments/heatmap',     desc: 'Where is participation?' },
  { icon: <Search size={13} />,     label: 'Instrument Research',   action: 'pick-symbol',             desc: 'What defines this asset?' },
  { icon: <BookOpen size={13} />,   label: 'Narrative Intelligence', route: '/instruments/narratives', desc: 'Which themes dominate?' },
  { icon: <Activity size={13} />,   label: 'Volatility Desk',       route: '/instruments/volatility',  desc: 'Where is instability?' },
  { icon: <GitFork size={13} />,    label: 'Relations Map',         route: '/relations-map',            desc: 'How are systems connected?' },
  { icon: <Clock size={13} />,      label: 'Historical Analogs',    route: '/historical-intelligence',  desc: 'What resembles now?' },
];

const WorkspaceDropdown: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pickingSymbol, setPickingSymbol] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setPickingSymbol(false);
      }
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
          {pickingSymbol ? (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px 6px',
                borderBottom: '1px solid var(--border)',
              }}>
                <button
                  onClick={() => setPickingSymbol(false)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 22, height: 22, borderRadius: 5,
                    border: '1px solid var(--border)', background: 'transparent',
                    cursor: 'pointer', color: 'var(--muted-foreground)', flexShrink: 0,
                  }}
                >
                  <ArrowLeft size={11} />
                </button>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--muted-foreground)',
                }}>
                  Pick an instrument
                </span>
              </div>
              <div style={{ padding: '10px 12px 12px' }}>
                <InstrumentSelector
                  placeholder="Search ticker, name…"
                  onSelect={(sym) => {
                    setOpen(false);
                    setPickingSymbol(false);
                    navigate(`/instruments/${encodeURIComponent(sym)}`);
                  }}
                />
              </div>
            </>
          ) : (
            <>
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
                  onClick={() => {
                    if (ws.action === 'pick-symbol') {
                      setPickingSymbol(true);
                    } else {
                      setOpen(false);
                      navigate(ws.route);
                    }
                  }}
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
            </>
          )}
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

// ─── Sector summary strip ─────────────────────────────────────────────────────

const SectorSummaryStrip: React.FC<{
  sectors: HeatmapSector[];
  editMode: boolean;
  hiddenSectors: Set<string>;
  onToggleEdit: () => void;
  onRestoreSector: (name: string) => void;
}> = ({ sectors, editMode, hiddenSectors, onToggleEdit, onRestoreSector }) => {
  const { data: pulse } = useMarketPulse();
  const populated = sectors.filter((s) => s.cells.length > 0);
  const visible = populated.filter((s) => !hiddenSectors.has(s.name));
  const hidden = populated.filter((s) => hiddenSectors.has(s.name));

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '0 14px 0 20px',
      height: 34,
      borderBottom: '1px solid var(--border)',
      flexShrink: 0, overflow: 'hidden',
      gap: 0,
    }}>
      {/* Scrollable chips area */}
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', alignItems: 'center',
        overflowX: 'auto', scrollbarWidth: 'none', gap: 0,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: editMode ? 'var(--primary)' : 'var(--muted-foreground)',
          flexShrink: 0, marginRight: 10,
        }}>
          {editMode ? 'Edit Layout' : 'Sectors'}
        </span>

        {/* Visible sectors */}
        {visible.map((sector, i) => {
          const pos = sector.avgChange > 0;
          const neg = sector.avgChange < 0;
          const clr = pos ? '#4E6040' : neg ? '#C15F3C' : '#8A8680';
          const bg = pos ? 'rgba(78,96,64,0.08)' : neg ? 'rgba(193,95,60,0.08)' : 'transparent';
          return (
            <React.Fragment key={sector.name}>
              {i > 0 && <span style={{ color: 'var(--border)', padding: '0 4px', flexShrink: 0, fontSize: 12 }}>·</span>}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 7px', borderRadius: 4, background: bg, flexShrink: 0,
                outline: editMode ? '1px dashed color-mix(in srgb, var(--border) 80%, transparent)' : 'none',
              }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)' }}>
                  {sector.name.split(' ')[0]}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: clr }}>
                  {pos ? '+' : ''}{sector.avgChange.toFixed(2)}%
                </span>
              </div>
            </React.Fragment>
          );
        })}

        {/* Hidden sectors — restore chips */}
        {hidden.length > 0 && (
          <>
            {hidden.map((sector) => (
              <React.Fragment key={sector.name}>
                <span style={{ color: 'var(--border)', padding: '0 4px', flexShrink: 0, fontSize: 12 }}>·</span>
                <button
                  onClick={() => onRestoreSector(sector.name)}
                  title={`Restore ${sector.name}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                    border: '1px dashed color-mix(in srgb, var(--border) 70%, transparent)',
                    background: 'transparent', cursor: 'pointer',
                    color: 'var(--muted-foreground)', opacity: 0.55,
                  }}
                >
                  <PlusCircle size={9} />
                  <span style={{ fontSize: 9, fontWeight: 600 }}>{sector.name.split(' ')[0]}</span>
                </button>
              </React.Fragment>
            ))}
          </>
        )}

        {/* Breadth pill */}
        {pulse && !editMode && (
          <>
            <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 10px', flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <div style={{ width: 44, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pulse.breadthPct}%`, background: pulse.breadthPct >= 50 ? '#4E6040' : '#C15F3C', transition: 'width 0.5s' }} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: pulse.breadthPct >= 50 ? '#4E6040' : '#C15F3C' }}>
                {pulse.breadthPct}%
              </span>
              <span style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>
                {pulse.advancers} adv · {pulse.decliners} dec
              </span>
            </div>
          </>
        )}
      </div>

      {/* Edit layout toggle */}
      <button
        onClick={onToggleEdit}
        style={{
          flexShrink: 0, marginLeft: 12,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          border: editMode ? '1px solid var(--primary)' : '1px solid var(--border)',
          background: editMode ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'color-mix(in srgb, var(--primary) 6%, transparent)',
          color: editMode ? 'var(--primary)' : 'var(--foreground)',
          cursor: 'pointer', transition: 'all 150ms',
        }}
      >
        <SlidersHorizontal size={10} style={{ color: editMode ? 'var(--primary)' : 'var(--muted-foreground)' }} />
        <span>{editMode ? 'Done' : 'Customize Heatmap'}</span>
      </button>
    </div>
  );
};

// ─── Intelligence rail ────────────────────────────────────────────────────────

const IntelligenceRail: React.FC<{ sectors: HeatmapSector[] }> = ({ sectors }) => {
  const { data: pulse } = useMarketPulse();
  const regime = useCompositeRegime();

  const equitySectors = useMemo(
    () => sectors
      .filter((s) => s.cells.length > 0 &&
        ['Technology','Financials','Healthcare','Energy','Consumer','Industrials'].includes(s.name))
      .sort((a, b) => b.avgChange - a.avgChange),
    [sectors],
  );

  const allCells = useMemo(() => sectors.flatMap((s) => s.cells), [sectors]);
  const maxAbsChange = useMemo(
    () => Math.max(...equitySectors.map((s) => Math.abs(s.avgChange)), 0.01),
    [equitySectors],
  );
  const topGainers = useMemo(
    () => [...allCells].sort((a, b) => b.changePercent - a.changePercent).slice(0, 5),
    [allCells],
  );
  const topLosers = useMemo(
    () => [...allCells].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5),
    [allCells],
  );

  return (
    <div style={{
      width: 228, flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      background: 'var(--card)',
      overflowY: 'auto',
      padding: '14px 14px',
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>

      {/* Market breadth gauge */}
      {pulse && (
        <div style={{ marginBottom: 18 }}>
          <div style={railLabel}>Market Breadth</div>
          <div style={{
            display: 'flex', alignItems: 'center', height: 5,
            borderRadius: 3, overflow: 'hidden', marginBottom: 5,
          }}>
            <div style={{
              height: '100%', width: `${pulse.breadthPct}%`,
              background: '#4E6040', transition: 'width 0.5s ease',
            }} />
            <div style={{ height: '100%', flex: 1, background: '#C15F3C' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 9, color: '#4E6040', fontWeight: 600 }}>{pulse.advancers} adv</span>
            <span style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>{pulse.unchanged} unch</span>
            <span style={{ fontSize: 9, color: '#C15F3C', fontWeight: 600 }}>{pulse.decliners} dec</span>
          </div>
        </div>
      )}

      {/* Regime context */}
      {regime.regimeLabel && (
        <div style={{ marginBottom: 18 }}>
          <div style={railLabel}>Regime</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.3 }}>
              {regime.regimeLabel}
            </span>
          </div>
          {regime.data?.confidence != null && (
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, height: 2, background: 'var(--border)', borderRadius: 1, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.round(regime.data.confidence * 100)}%`,
                  background: 'var(--primary)',
                }} />
              </div>
              <span style={{ fontSize: 9, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {Math.round(regime.data.confidence * 100)}% conf
              </span>
            </div>
          )}
        </div>
      )}

      {/* Sector returns */}
      {equitySectors.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={railLabel}>Sector Returns</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {equitySectors.map((sector) => {
              const pos = sector.avgChange > 0;
              const neg = sector.avgChange < 0;
              const clr = pos ? '#4E6040' : neg ? '#C15F3C' : '#8A8680';
              const barPct = Math.round((Math.abs(sector.avgChange) / maxAbsChange) * 100);
              return (
                <div key={sector.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 9, color: 'var(--muted-foreground)', width: 58,
                    flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {sector.name}
                  </span>
                  <div style={{ flex: 1, height: 3, background: 'var(--muted)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barPct}%`, background: clr, transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    color: clr, width: 40, textAlign: 'right', flexShrink: 0,
                  }}>
                    {pos ? '+' : ''}{sector.avgChange.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top gainers */}
      {topGainers.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={railLabel}>Session Leaders</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {topGainers.map((cell) => (
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

      {/* Top losers */}
      {topLosers.length > 0 && (
        <div>
          <div style={railLabel}>Session Laggards</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {topLosers.map((cell) => (
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

const railLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--muted-foreground)',
  marginBottom: 8,
};

// ─── Hub page ──────────────────────────────────────────────────────────────────

const HM_HIDDEN_KEY = 'hm-hidden-sectors-v1';

export const InstrumentIntelligenceHub: React.FC = () => {
  const navigate = useNavigate();

  // ── Single data fetch — shared across SectorSummaryStrip, MarketHeatmap, IntelligenceRail ──
  const { data: sectors, loading: sectorsLoading } = useExtendedHeatmapData();

  const [editMode, setEditMode] = useState(false);
  const [hiddenSectors, setHiddenSectors] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(HM_HIDDEN_KEY);
      return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });

  const persistHidden = useCallback((next: Set<string>) => {
    localStorage.setItem(HM_HIDDEN_KEY, JSON.stringify([...next]));
    setHiddenSectors(new Set(next));
  }, []);

  const hideSector = useCallback((name: string) => {
    const next = new Set(hiddenSectors); next.add(name); persistHidden(next);
  }, [hiddenSectors, persistHidden]);

  const restoreSector = useCallback((name: string) => {
    const next = new Set(hiddenSectors); next.delete(name); persistHidden(next);
  }, [hiddenSectors, persistHidden]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>

      <HeaderBar />
      <SectorSummaryStrip
        sectors={sectors}
        editMode={editMode}
        hiddenSectors={hiddenSectors}
        onToggleEdit={() => setEditMode((e) => !e)}
        onRestoreSector={restoreSector}
      />

      {/* Heatmap canvas + intelligence rail */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>

        {/* Scrollable heatmap area */}
        <div style={{
          flex: 1, minWidth: 0,
          overflowY: 'auto',
          padding: '12px 20px 0',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Edit mode hint banner */}
          {editMode && (
            <div style={{
              marginBottom: 10, padding: '6px 12px', borderRadius: 6, flexShrink: 0,
              background: 'rgba(193,95,60,0.07)',
              border: '1px solid rgba(193,95,60,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 600 }}>
                Edit mode — click <strong>×</strong> on any sector header to hide it. Hidden sectors appear as restore chips in the strip above.
              </span>
              <button
                onClick={() => setEditMode(false)}
                style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '2px 6px',
                }}
              >
                Done
              </button>
            </div>
          )}

          <MarketHeatmap
            bare
            sectors={sectors}
            sectorsLoading={sectorsLoading}
            editMode={editMode}
            hiddenSectors={hiddenSectors}
            onHideSector={hideSector}
            onSelect={(sym) => navigate(`/instruments/${encodeURIComponent(sym)}`)}
          />
          <div style={{ padding: '6px 0 8px', flexShrink: 0, borderTop: '1px solid var(--border)', marginTop: 10 }}>
            <Disclaimer />
          </div>
        </div>

        {/* Intelligence rail — receives shared sectors, no extra fetch */}
        <IntelligenceRail sectors={sectors} />
      </div>
    </div>
  );
};
