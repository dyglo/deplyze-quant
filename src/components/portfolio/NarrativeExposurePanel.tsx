/**
 * NarrativeExposurePanel — displays narrative theme exposure for a portfolio.
 *
 * Shows which narrative themes (AI, rates, semiconductors, consumer weakness,
 * energy, supply chain, etc.) have portfolio holdings in their related_symbols.
 *
 * Weight bar shows portfolio exposure magnitude.
 * Polarity indicator shows narrative sentiment direction.
 */

import React from 'react';
import { BookOpen, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { NarrativeExposure, NarrativeExposureResult } from '../../services/reasoningService';
import { SystemAnalyzingState } from '../quant/SystemAnalyzingState';

// ─── Polarity config ─────────────────────────────────────────────────────────

const POLARITY_CONFIG = {
  positive: { color: 'var(--ds-gain)', icon: <TrendingUp size={10} />,  label: '+' },
  negative: { color: 'var(--ds-loss)', icon: <TrendingDown size={10} />, label: '−' },
  neutral:  { color: 'var(--muted-foreground)', icon: <Minus size={10} />,        label: '~' },
};

// ─── Intensity bar ────────────────────────────────────────────────────────────

const IntensityBar: React.FC<{ value: number; max?: number }> = ({ value, max = 1 }) => (
  <div style={{ width: 60, height: 3, background: 'var(--muted)', borderRadius: 2, flexShrink: 0 }}>
    <div style={{
      height: 3, borderRadius: 2,
      width: `${Math.min((value / max) * 100, 100)}%`,
      background: 'var(--primary)',
    }} />
  </div>
);

// ─── Exposure row ─────────────────────────────────────────────────────────────

const ExposureRow: React.FC<{ exposure: NarrativeExposure; maxWeight: number }> = ({ exposure, maxWeight }) => {
  const polCfg = POLARITY_CONFIG[exposure.polarity_label] ?? POLARITY_CONFIG.neutral;
  const pct = maxWeight > 0 ? (exposure.portfolio_weight / maxWeight) : 0;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 50px 60px 60px',
      alignItems: 'center',
      gap: 8,
      padding: '7px 14px',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Theme label + symbols */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--foreground)' }}>
            {exposure.theme_label}
          </span>
          <span style={{
            fontSize: 8, fontWeight: 700, color: polCfg.color,
            display: 'flex', alignItems: 'center', gap: 2,
          }}>
            {polCfg.icon}
          </span>
        </div>
        <div style={{ fontSize: 9, color: 'var(--muted-foreground)', lineHeight: 1.3 }}>
          {exposure.matching_symbols.slice(0, 5).join('  ·  ')}
        </div>
      </div>

      {/* Portfolio weight */}
      <div style={{ textAlign: 'right' }}>
        <div style={{
          height: 3, width: `${Math.min(pct * 100, 100)}%`,
          background: 'var(--primary)', borderRadius: 2, marginLeft: 'auto',
        }} />
        <span style={{ fontSize: 9, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>
          {(exposure.portfolio_weight * 100).toFixed(1)}%
        </span>
      </div>

      {/* Intensity */}
      <IntensityBar value={exposure.intensity} />

      {/* Mentions 7d */}
      <span style={{
        fontSize: 9, color: 'var(--muted-foreground)',
        textAlign: 'right', fontVariantNumeric: 'tabular-nums',
      }}>
        {exposure.mentions_7d > 0 ? `${exposure.mentions_7d}×` : '—'}
      </span>
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export const NarrativeExposurePanel: React.FC<{
  result: NarrativeExposureResult | null;
  loading?: boolean;
}> = ({ result, loading }) => {
  const maxWeight = result?.exposures.length
    ? Math.max(...result.exposures.map(e => e.portfolio_weight))
    : 1;

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
      }}>
        <BookOpen size={13} color="var(--primary)" />
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Narrative Theme Exposure
        </span>
        {result && (
          <span style={{
            marginLeft: 'auto', fontSize: 9, color: 'var(--muted-foreground)',
          }}>
            {result.themes_matched} themes matched / {result.themes_scanned} scanned
          </span>
        )}
      </div>

      {/* Column headers */}
      {!loading && result?.exposures.length ? (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 50px 60px 60px',
          gap: 8, padding: '4px 14px',
          fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'var(--muted-foreground)',
          borderBottom: '1px solid var(--border)',
        }}>
          <span>Theme</span>
          <span style={{ textAlign: 'right' }}>Exposure</span>
          <span>Intensity</span>
          <span style={{ textAlign: 'right' }}>7d Mentions</span>
        </div>
      ) : null}

      {loading ? (
        <div style={{ padding: '16px 14px' }}>
          <SystemAnalyzingState label="Mapping narrative exposure" />
        </div>
      ) : !result || result.exposures.length === 0 ? (
        <div style={{ padding: '16px 14px', fontSize: 10, color: 'var(--muted-foreground)' }}>
          {result?.data_quality === 'unavailable'
            ? 'Narrative exposure data isn’t available yet.'
            : 'No active narrative themes match current holdings.'
          }
        </div>
      ) : (
        result.exposures.map(e => (
          <ExposureRow key={e.theme_id} exposure={e} maxWeight={maxWeight} />
        ))
      )}

      {result && result.exposures.length > 0 && (
        <div style={{ padding: '6px 14px', fontSize: 9, color: 'var(--muted-foreground)' }}>
          Source: narrative_memory · narrative_features · {result.generated_at}
        </div>
      )}
    </div>
  );
};
