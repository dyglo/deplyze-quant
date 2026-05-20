import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Activity } from 'lucide-react';
import { IntelligenceObservationCard } from '../../components/quant/IntelligenceObservationCard';
import { SystemAnalyzingState } from '../../components/quant/SystemAnalyzingState';
import { Disclaimer } from '../../components/quant/Disclaimer';
import { useAgentDomain } from '../../hooks/useAgentIntelligence';
import { useScreenerRows } from '../../hooks/useScreener';

// ─── Vol state styling ─────────────────────────────────────────────────────────

const VOL_CONFIG = {
  extreme:  { bg: 'rgba(239,68,68,0.12)',   text: '#ef4444', dot: '#ef4444',   label: '⚡ Extreme' },
  elevated: { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b', dot: '#f59e0b',   label: '△ Elevated' },
  normal:   { bg: 'rgba(99,102,241,0.08)',  text: '#6366f1', dot: '#6366f1',   label: '◉ Normal' },
  low:      { bg: 'rgba(107,114,128,0.08)', text: '#6b7280', dot: '#6b7280',   label: '◎ Low' },
};

// ─── Vol cluster tile ──────────────────────────────────────────────────────────

const VolTile: React.FC<{
  symbol: string;
  changePercent: number;
  volState: 'low' | 'normal' | 'elevated' | 'extreme';
  name: string;
  onSelect: () => void;
  isSelected: boolean;
}> = ({ symbol, changePercent, volState, name, onSelect, isSelected }) => {
  const cfg = VOL_CONFIG[volState];
  const [hovered, setHovered] = useState(false);
  const pos = changePercent > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '12px 14px', borderRadius: 10,
        background: hovered || isSelected ? cfg.bg : 'var(--background)',
        border: `1px solid ${isSelected ? cfg.dot : hovered ? cfg.dot + '60' : 'var(--border)'}`,
        cursor: 'pointer',
        transition: 'all 0.12s ease',
        display: 'flex', flexDirection: 'column', gap: 6,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>
          {symbol}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
          background: cfg.bg, color: cfg.text,
          padding: '2px 6px', borderRadius: 4,
        }}>
          {cfg.label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {name !== symbol ? name : ''}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8,
          color: pos ? '#4E6040' : '#C15F3C',
        }}>
          {pos ? '+' : ''}{changePercent.toFixed(2)}%
        </span>
      </div>
    </div>
  );
};

// ─── Workspace ────────────────────────────────────────────────────────────────

export const VolatilityDesk: React.FC = () => {
  const navigate = useNavigate();
  const volOutputs = useAgentDomain('volatility', { limit: 20, days: 3 });
  const screener = useScreenerRows('vol-expansion');
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  // Separate extreme/elevated from normal
  const extremeRows = useMemo(
    () => screener.data.filter((r) => r.volatilityState === 'extreme'),
    [screener.data],
  );
  const elevatedRows = useMemo(
    () => screener.data.filter((r) => r.volatilityState === 'elevated'),
    [screener.data],
  );

  const highOutputs = useMemo(
    () => volOutputs.data.filter((o) => o.severity === 'high' || o.severity === 'medium'),
    [volOutputs.data],
  );

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
            Volatility Desk
          </h1>
          <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '2px 0 0', lineHeight: 1, fontStyle: 'italic' }}>
            Where is instability emerging?
          </p>
        </div>

        {/* Summary counts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {extremeRows.length > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
              background: 'rgba(239,68,68,0.1)', color: '#ef4444',
              padding: '2px 8px', borderRadius: 4,
            }}>
              {extremeRows.length} Extreme
            </span>
          )}
          {elevatedRows.length > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
              background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
              padding: '2px 8px', borderRadius: 4,
            }}>
              {elevatedRows.length} Elevated
            </span>
          )}
          {screener.loading && (
            <SystemAnalyzingState compact label="Scanning" />
          )}
        </div>
      </div>

      {/* ── Main layout: vol cluster + observations ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>

        {/* Left: vol cluster */}
        <div style={{
          flex: 1, minWidth: 0, overflowY: 'auto',
          padding: '20px 20px',
          display: 'flex', flexDirection: 'column', gap: 24,
        }}>

          {/* Extreme movers */}
          {(screener.loading && screener.data.length === 0) ? (
            <SystemAnalyzingState subtext="Loading volatility expansion scanner…" />
          ) : screener.data.length === 0 ? (
            <div style={{ padding: '24px 0' }}>
              <Activity size={24} style={{ color: 'var(--muted-foreground)', marginBottom: 12 }} />
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>
                No volatility expansion detected in current session. Market is in a compressed state.
              </p>
            </div>
          ) : (
            <>
              {extremeRows.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#ef4444', marginBottom: 10 }}>
                    Extreme Volatility
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {extremeRows.map((r) => (
                      <VolTile
                        key={r.symbol}
                        symbol={r.symbol}
                        name={r.name}
                        changePercent={r.changePercent}
                        volState={r.volatilityState}
                        isSelected={selectedSymbol === r.symbol}
                        onSelect={() => {
                          setSelectedSymbol(r.symbol === selectedSymbol ? null : r.symbol);
                          navigate(`/instruments/${encodeURIComponent(r.symbol)}`);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {elevatedRows.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 10 }}>
                    Elevated Volatility
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {elevatedRows.map((r) => (
                      <VolTile
                        key={r.symbol}
                        symbol={r.symbol}
                        name={r.name}
                        changePercent={r.changePercent}
                        volState={r.volatilityState}
                        isSelected={selectedSymbol === r.symbol}
                        onSelect={() => {
                          setSelectedSymbol(r.symbol === selectedSymbol ? null : r.symbol);
                          navigate(`/instruments/${encodeURIComponent(r.symbol)}`);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <Disclaimer />
        </div>

        {/* Right: volatility agent observations */}
        <div style={{
          width: 340, flexShrink: 0,
          borderLeft: '1px solid var(--border)',
          background: 'var(--card)',
          overflowY: 'auto',
          padding: '16px 0',
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--muted-foreground)', padding: '0 14px 10px',
          }}>
            Volatility Intelligence
          </div>

          {volOutputs.loading && volOutputs.data.length === 0 ? (
            <div style={{ padding: '0 14px' }}>
              <SystemAnalyzingState subtext="Reading volatility observations…" />
            </div>
          ) : highOutputs.length === 0 ? (
            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', padding: '0 14px', lineHeight: 1.6 }}>
              No volatility observations in the last 3 days. Volatility agent runs at 16:30 ET on trading days.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 8px' }}>
              {highOutputs.map((o) => (
                <IntelligenceObservationCard key={o.artifact_id} output={o} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
