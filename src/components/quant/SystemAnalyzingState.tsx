/**
 * SystemAnalyzingState — "Deplyze is analyzing…" loading state for agentic
 * intelligence surfaces. Institutional design: no spinner animations,
 * no cartoon loading bars — a clean, text-based status indicator.
 *
 * Principle: users should feel "the system is working" not "AI agents are chatting".
 */

import React from 'react';
import { Activity } from 'lucide-react';

export const SystemAnalyzingState: React.FC<{
  label?: string;
  subtext?: string;
  compact?: boolean;
}> = ({
  label = 'System analyzing',
  subtext,
  compact = false,
}) => (
  <div style={{
    display: 'flex',
    alignItems: compact ? 'center' : 'flex-start',
    gap: compact ? 6 : 8,
    padding: compact ? '6px 0' : '20px 0',
    flexDirection: compact ? 'row' : 'column',
    color: 'var(--muted-foreground)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Activity size={compact ? 11 : 14} style={{ opacity: 0.6 }} />
      <span style={{
        fontSize: compact ? 10 : 11,
        fontWeight: 500,
        letterSpacing: '0.01em',
      }}>
        {label}
        <span style={{ animation: 'none', opacity: 0.5 }}>&nbsp;…</span>
      </span>
    </div>
    {subtext && !compact && (
      <p style={{
        fontSize: 10, color: 'var(--muted-foreground)',
        margin: 0, maxWidth: 360, lineHeight: 1.5,
      }}>
        {subtext}
      </p>
    )}
  </div>
);

/**
 * RegimeStatusChip — compact inline chip showing composite regime label.
 * Used in page headers and strips, not as a standalone card.
 */
export const RegimeStatusChip: React.FC<{
  regime: string | null;
  confidence?: number | null;
}> = ({ regime, confidence }) => {
  if (!regime) return null;

  const isRiskOff = regime.includes('risk-off') || regime === 'stagflation';
  const isTransition = regime === 'transition';
  const color = isRiskOff ? 'var(--ds-loss)' : isTransition ? '#C9A227' : 'var(--ds-gain)';

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
      color, background: `${color}14`,
      border: `1px solid ${color}30`,
      borderRadius: 4, padding: '2px 7px',
      textTransform: 'uppercase',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: color, flexShrink: 0,
      }} />
      {regime.replace(/-/g, ' ')}
      {confidence != null && (
        <span style={{ opacity: 0.7, fontWeight: 500 }}>
          {' '}{Math.round(confidence * 100)}%
        </span>
      )}
    </span>
  );
};

/**
 * RiskLevelChip — compact inline chip for the risk environment level.
 */
export const RiskLevelChip: React.FC<{
  riskLevel: string | null;
  severity?: string | null;
}> = ({ riskLevel, severity }) => {
  if (!riskLevel) return null;

  const colorMap: Record<string, string> = {
    elevated:   'var(--ds-loss)',
    cautionary: '#C9A227',
    moderate:   'var(--chart-3)',
    benign:     'var(--ds-gain)',
  };
  const color = colorMap[riskLevel] ?? 'var(--muted-foreground)';

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
      color, background: `${color}14`,
      border: `1px solid ${color}30`,
      borderRadius: 4, padding: '2px 7px',
      textTransform: 'uppercase',
    }}>
      Risk: {riskLevel}
    </span>
  );
};
