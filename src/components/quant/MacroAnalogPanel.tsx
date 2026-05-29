/**
 * MacroAnalogPanel — displays macro-regime historical analogs from the V4
 * reasoning engine. Distinct from the existing HistoricalAnalogPanel (which
 * uses a different data source).
 *
 * Data source: GET /v1/agents/analog (macro_features + vol_features BQ tables)
 * Transparent about data quality. No guaranteed outcomes. Evidence-based only.
 */

import React from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import type { AnalogResult, AnalogPeriod } from '../../services/reasoningService';
import { ConfidenceBadge } from './ConfidenceBadge';
import { SystemAnalyzingState } from './SystemAnalyzingState';

const FEATURE_LABELS: Record<string, string> = {
  growth_zscore:    'Growth',
  liquidity_zscore: 'Liquidity',
  inflation_zscore: 'Inflation',
  rates_zscore:     'Rates',
  vol_percentile:   'Vol Pct',
};

const REGIME_COLORS: Record<string, string> = {
  expansion:   'var(--ds-gain)',
  transition:  '#C9A227',
  tightening:  '#C9A227',
  contraction: 'var(--ds-loss)',
  stagflation: 'var(--ds-loss)',
};

const AnalogCard: React.FC<{ analog: AnalogPeriod; rank: number }> = ({ analog, rank }) => {
  const regimeColor = REGIME_COLORS[analog.regime_label] ?? 'var(--muted-foreground)';
  return (
    <div style={{
      background: 'var(--muted)', border: '1px solid var(--border)',
      borderRadius: 7, padding: '9px 11px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted-foreground)', width: 14 }}>#{rank}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', flex: 1 }}>{analog.date}</span>
        <span style={{
          fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
          color: regimeColor, background: `${regimeColor}18`,
          borderRadius: 3, padding: '1px 5px',
        }}>{analog.regime_label}</span>
        <ConfidenceBadge score={analog.similarity_score} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 5 }}>
        {Object.entries(analog.feature_vector).map(([k, v]) => {
          const isNeg = v < -0.3; const isPos = v > 0.3;
          return (
            <span key={k} style={{
              fontSize: 8.5, padding: '1px 5px', borderRadius: 3,
              background: isNeg ? 'rgba(176,58,46,0.09)' : isPos ? 'rgba(90,112,82,0.09)' : 'var(--card)',
              color: isNeg ? 'var(--ds-loss)' : isPos ? 'var(--ds-gain)' : 'var(--muted-foreground)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {FEATURE_LABELS[k] ?? k}: {k === 'vol_percentile' ? `${(v * 100).toFixed(0)}%` : `${v > 0 ? '+' : ''}${v.toFixed(2)}σ`}
            </span>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: 9, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
        {analog.context_note}
      </p>
    </div>
  );
};

export const MacroAnalogPanel: React.FC<{
  result: AnalogResult | null;
  loading?: boolean;
  compact?: boolean;
}> = ({ result, loading, compact = false }) => (
  <div style={{
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, overflow: 'hidden',
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 14px', borderBottom: '1px solid var(--border)',
    }}>
      <Clock size={13} color="var(--primary)" />
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        Historical Macro Analogs
      </span>
      {result?.current_day && (
        <span style={{ fontSize: 9, color: 'var(--muted-foreground)', marginLeft: 'auto' }}>
          {result.history_days}d history · {result.data_quality}
        </span>
      )}
    </div>

    <div style={{ padding: '12px 14px' }}>
      {loading ? (
        <SystemAnalyzingState label="Searching historical analogs" />
      ) : !result ? (
        <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: 0 }}>Analog engine unavailable.</p>
      ) : result.data_quality === 'insufficient' || result.data_quality === 'unavailable' ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertCircle size={12} color="var(--muted-foreground)" />
          <p style={{ margin: 0, fontSize: 10, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
            {result.data_quality_note ?? 'Insufficient historical data. Minimum 3 years of macro feature history required.'}
          </p>
        </div>
      ) : result.analogs.length === 0 ? (
        <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: 0 }}>No close analogs found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {result.analogs.slice(0, compact ? 2 : 4).map((a, i) => (
            <AnalogCard key={a.date} analog={a} rank={i + 1} />
          ))}
          <p style={{ margin: '4px 0 0', fontSize: 9, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
            Similarity based on 5-dimensional macro/vol distance. Past analogs are not predictive of returns.
          </p>
        </div>
      )}
    </div>
  </div>
);
