import React from 'react';
import { Sparkline } from '../quant/Sparkline';
import { FreshnessBadge } from '../quant/FreshnessBadge';
import type { FreshnessStatus } from '../../services/gatewayClient';

interface IntelligenceMetricCardProps {
  label: string;
  value: string | number;
  changePercent?: number;
  sparklineValues?: number[];
  badge?: React.ReactNode;
  status?: FreshnessStatus;
  fetchedAt?: number | null;
  hint?: string;
  onClick?: () => void;
}

function fmtChange(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export const IntelligenceMetricCard: React.FC<IntelligenceMetricCardProps> = ({
  label, value, changePercent, sparklineValues, badge, status, fetchedAt, hint, onClick,
}) => {
  const pos = changePercent != null && changePercent > 0;
  const neg = changePercent != null && changePercent < 0;
  const changeColor = pos ? '#4E6040' : neg ? 'var(--primary)' : 'var(--muted-foreground)';

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 120ms ease, background 120ms ease',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)';
          (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--card) 90%, var(--primary))';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
          (e.currentTarget as HTMLElement).style.background = 'var(--card)';
        }
      }}
    >
      {/* Top row: label + freshness */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </span>
        {status && <FreshnessBadge status={status} fetchedAt={fetchedAt ?? null} compact />}
      </div>

      {/* Value + sparkline */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--foreground)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
          }}>
            {value}
          </span>
          {changePercent != null && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: changeColor,
              fontVariantNumeric: 'tabular-nums',
              display: 'flex', alignItems: 'center', gap: 2,
            }}>
              {pos ? '▲' : neg ? '▼' : '·'} {fmtChange(changePercent)}
            </span>
          )}
        </div>
        {sparklineValues && sparklineValues.length > 1 && (
          <Sparkline values={sparklineValues} width={80} height={32} />
        )}
      </div>

      {/* Bottom row: badge + hint */}
      {(badge || hint) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 2 }}>
          {badge ?? <span />}
          {hint && <span style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>{hint}</span>}
        </div>
      )}
    </div>
  );
};
