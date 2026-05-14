import React from 'react';
import type { ConfidenceBand } from '../../types';

const LABELS: Record<ConfidenceBand, string> = {
  'low': 'Low',
  'medium': 'Medium',
  'high': 'High',
  'very-high': 'Very High',
};

const CLASSES: Record<ConfidenceBand, string> = {
  'low': 'ds-pill-neutral',
  'medium': 'ds-pill-medium',
  'high': 'ds-pill-blue',
  'very-high': 'ds-pill-low', // reuse sage for very-high confidence
};

export function bandFromScore(score: number): ConfidenceBand {
  if (score >= 0.85) return 'very-high';
  if (score >= 0.65) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

export const ConfidenceBadge: React.FC<{ score?: number; band?: ConfidenceBand }> = ({ score, band }) => {
  const b: ConfidenceBand = band ?? (score != null ? bandFromScore(score) : 'medium');
  const pct = score != null ? Math.round(score * 100) : null;
  return (
    <span className={`ds-badge ${CLASSES[b]}`} style={{ padding: '2px 8px', borderRadius: 999 }}>
      {LABELS[b]}{pct != null ? ` · ${pct}%` : ''}
    </span>
  );
};
