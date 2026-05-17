import React, { useEffect, useState } from 'react';
import { useMarketPulse } from '../../hooks/useScreener';
import type { MarketStatus, RiskMode } from '../../services/screenerService';

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

const STATUS_CONFIG: Record<MarketStatus, { label: string; color: string; dot: string }> = {
  'open':        { label: 'Market Open',   color: 'var(--ds-gain)', dot: 'var(--ds-gain)' },
  'pre-market':  { label: 'Pre-Market',    color: '#9A7B1D', dot: '#C9A227' },
  'after-hours': { label: 'After Hours',   color: '#6A9BCC', dot: '#6A9BCC' },
  'closed':      { label: 'Market Closed', color: '#8A8680', dot: '#B1ADA1' },
};

const RISK_CONFIG: Record<RiskMode, { label: string; cls: string }> = {
  'risk-on':  { label: 'Risk-On',  cls: 'ds-pill-low' },
  'risk-off': { label: 'Risk-Off', cls: 'ds-pill-critical' },
  'neutral':  { label: 'Neutral',  cls: 'ds-pill-neutral' },
};

const LiveDot: React.FC<{ color: string; pulse?: boolean }> = ({ color, pulse }) => {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (!pulse) return;
    const id = setInterval(() => setBlink((b) => !b), 1200);
    return () => clearInterval(id);
  }, [pulse]);
  return (
    <span style={{
      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
      background: color, flexShrink: 0,
      boxShadow: blink && pulse ? `0 0 0 3px ${color}33` : undefined,
      transition: 'box-shadow 0.4s ease',
    }} />
  );
};

export const MarketPulseStrip: React.FC = () => {
  const { data, loading, refresh } = useMarketPulse();

  const statusCfg = STATUS_CONFIG[data?.marketStatus ?? 'closed'];
  const riskCfg = RISK_CONFIG[data?.riskMode ?? 'neutral'];
  const isOpen = data?.marketStatus === 'open';

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      background: 'var(--card)',
      padding: '0 24px',
      overflowX: 'auto',
      scrollbarWidth: 'none',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        height: 36,
        minWidth: 'max-content',
      }}>

        {/* Market status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          paddingRight: 14, borderRight: '1px solid var(--border)',
          marginRight: 14, flexShrink: 0,
        }}>
          <LiveDot color={statusCfg.dot} pulse={isOpen} />
          <span style={{ fontSize: 10, fontWeight: 600, color: statusCfg.color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {statusCfg.label}
          </span>
        </div>

        {/* Index quotes */}
        {loading && !data && (
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)', paddingRight: 12 }}>Loading…</span>
        )}
        {(data?.indices ?? []).map((idx) => {
          const pos = idx.changePercent > 0;
          const neg = idx.changePercent < 0;
          const clr = pos ? 'var(--ds-gain)' : neg ? 'var(--ds-loss)' : 'var(--muted-foreground)';
          return (
            <div key={idx.symbol} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              paddingRight: 14, borderRight: '1px solid var(--border)',
              marginRight: 14, flexShrink: 0,
            }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.04em' }}>
                {idx.label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>
                {fmtPrice(idx.price)}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: clr }}>
                {pos ? '▲' : neg ? '▼' : '·'} {Math.abs(idx.changePercent).toFixed(2)}%
              </span>
            </div>
          );
        })}

        {/* Breadth */}
        {data && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            paddingRight: 14, borderRight: '1px solid var(--border)',
            marginRight: 14, flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Breadth
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--ds-gain)', fontWeight: 700 }}>▲{data.advancers}</span>
              <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>·</span>
              <span style={{ fontSize: 10, color: 'var(--ds-loss)', fontWeight: 700 }}>▼{data.decliners}</span>
            </div>
            <div style={{
              width: 40, height: 4, borderRadius: 999, background: 'var(--muted)', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', width: `${data.breadthPct}%`,
                background: data.breadthPct > 50 ? 'var(--ds-gain)' : 'var(--primary)',
                borderRadius: 999, transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )}

        {/* Risk mode */}
        {data && (
          <div style={{ flexShrink: 0 }}>
            <span className={`ds-badge ${riskCfg.cls}`} style={{ fontSize: 9, padding: '2px 7px', fontWeight: 700, letterSpacing: '0.04em' }}>
              {riskCfg.label}
            </span>
          </div>
        )}

        {/* Right: timestamp */}
        {data?.fetchedAt && (
          <div style={{ marginLeft: 'auto', paddingLeft: 14, flexShrink: 0 }}>
            <button
              onClick={refresh}
              title="Refresh"
              style={{
                fontSize: 9, color: 'var(--muted-foreground)', background: 'transparent',
                border: 'none', cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
                padding: '2px 4px', borderRadius: 4,
              }}
            >
              {new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
