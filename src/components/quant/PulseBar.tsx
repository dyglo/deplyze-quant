import React, { useState, useEffect } from 'react';
import { useMarketPulse } from '../../hooks/useScreener';
import { getMarketStatus } from '../../services/screenerService';

const STATUS_COLORS = {
  open:          { bg: 'rgba(78,96,64,0.1)',   text: '#4E6040', dot: '#4E6040'  },
  'pre-market':  { bg: 'rgba(201,162,39,0.1)', text: '#9A7B1D', dot: '#C9A227'  },
  'after-hours': { bg: 'rgba(106,155,204,0.1)',text: '#1C6BBB', dot: '#6A9BCC' },
  closed:        { bg: 'rgba(177,173,161,0.1)',text: '#8A8680', dot: '#B1ADA1' },
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

export const PulseBar: React.FC = () => {
  const { data } = useMarketPulse();
  const status = getMarketStatus();
  const sc = STATUS_COLORS[status];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 24px', borderBottom: '1px solid var(--border)',
      background: 'var(--card)', overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0,
    }}>
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

      {data && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Breadth</span>
          <span style={{ fontSize: 10, color: '#4E6040', fontWeight: 700 }}>▲{data.advancers}</span>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>·</span>
          <span style={{ fontSize: 10, color: '#C15F3C', fontWeight: 700 }}>▼{data.decliners}</span>
        </div>
      )}

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
