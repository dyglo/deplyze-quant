import React from 'react';
import type { RegimeLabel } from '../../types';

const PILLS: Record<RegimeLabel, string> = {
  'trending-bull':           'ds-pill-low',     // sage
  'trending-bear':           'ds-pill-high',    // burnt orange
  'ranging':                 'ds-pill-neutral',
  'volatility-expansion':    'ds-pill-medium',
  'volatility-compression':  'ds-pill-blue',
  'risk-on':                 'ds-pill-low',
  'risk-off':                'ds-pill-critical',
};

const LABELS: Record<RegimeLabel, string> = {
  'trending-bull':          'Trending · Bull',
  'trending-bear':          'Trending · Bear',
  'ranging':                'Ranging',
  'volatility-expansion':   'Vol Expansion',
  'volatility-compression': 'Vol Compression',
  'risk-on':                'Risk-On',
  'risk-off':               'Risk-Off',
};

export const RegimeBadge: React.FC<{ regime: RegimeLabel }> = ({ regime }) => (
  <span className={`ds-badge ${PILLS[regime]}`} style={{ padding: '2px 8px', borderRadius: 6 }}>
    {LABELS[regime]}
  </span>
);
