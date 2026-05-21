import React from 'react';
import type { ResearchPlan } from '../../../services/historicalResearchService';

const COMPARISON_LABEL: Record<string, string> = {
  normalized: 'Normalized',
  rolling_correlation: 'Rolling correlation',
  relative_strength: 'Relative strength',
  drawdown: 'Drawdown',
};

const OVERLAY_LABEL: Record<string, string> = {
  inflation_regime: 'Inflation regime',
  rate_cycle: 'Rate cycle',
  recession: 'Recession',
  volatility_regime: 'Volatility regime',
};

export const PlanStrip: React.FC<{ plan: ResearchPlan }> = ({ plan }) => {
  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--muted)',
        fontSize: 12,
        color: 'var(--muted-foreground)',
      }}
    >
      <Field label="Intent" value={prettyIntent(plan.intent)} mono />
      <Field
        label="Assets"
        value={plan.assets.join(' · ') || '—'}
        mono
      />
      {plan.benchmark && <Field label="Benchmark" value={plan.benchmark} mono />}
      <Field
        label="Window"
        value={plan.timeframe.start && plan.timeframe.end
          ? `${plan.timeframe.start} → ${plan.timeframe.end}`
          : `${plan.timeframe.lookbackYears}Y`}
        mono
      />
      {plan.comparisons.length > 0 && (
        <Field label="Comparisons" value={plan.comparisons.map((c) => COMPARISON_LABEL[c] ?? c).join(' · ')} />
      )}
      {plan.overlays.length > 0 && (
        <Field label="Overlays" value={plan.overlays.map((o) => OVERLAY_LABEL[o] ?? o).join(' · ')} />
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
    <span style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.6 }}>{label}</span>
    <span
      style={{
        color: 'var(--foreground)',
        fontFamily: mono ? 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)' : undefined,
        fontSize: 12,
      }}
    >
      {value}
    </span>
  </span>
);

function prettyIntent(i: ResearchPlan['intent']): string {
  switch (i) {
    case 'compare': return 'Compare';
    case 'regime_behavior': return 'Regime behavior';
    case 'relationship': return 'Relationship';
    case 'single_asset_history': return 'Single asset';
    case 'anomaly_search': return 'Anomaly search';
    default: return String(i);
  }
}
