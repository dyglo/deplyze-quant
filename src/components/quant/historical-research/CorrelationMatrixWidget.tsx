/**
 * CorrelationMatrixWidget — full pairwise correlation heatmap, only rendered
 * when the investigation has 3+ assets. Reuses the existing
 * `CorrelationHeatmap` component used elsewhere in the app so visuals stay
 * consistent across pages.
 */

import React from 'react';
import { CorrelationHeatmap } from '../CorrelationHeatmap';
import type { CorrelationMatrixResult } from '../../../lib/historicalResearchAnalytics';
import type { CorrelationSnapshot, CorrelationCell } from '../../../types';
import { Explainer } from './Explainer';

export const CorrelationMatrixWidget: React.FC<{ matrix: CorrelationMatrixResult }> = ({ matrix }) => {
  const snapshot: CorrelationSnapshot = React.useMemo(() => {
    const cells: CorrelationCell[] = [];
    for (let i = 0; i < matrix.symbols.length; i++) {
      for (let j = 0; j < matrix.symbols.length; j++) {
        cells.push({
          rowSymbol: matrix.symbols[i],
          colSymbol: matrix.symbols[j],
          value: matrix.matrix[i][j],
          windowDays: matrix.sampleSize,
        });
      }
    }
    return { ts: matrix.asOf, windowDays: matrix.sampleSize, symbols: matrix.symbols, cells };
  }, [matrix]);

  return (
    <div>
      <CorrelationHeatmap snapshot={snapshot} />
      <Explainer text={explain(matrix)} />
    </div>
  );
};

function explain(m: CorrelationMatrixResult): string {
  if (m.symbols.length < 2) return '';
  // Walk the upper triangle; record strongest positive and strongest negative.
  let bestPair: [string, string, number] | null = null;
  let worstPair: [string, string, number] | null = null;
  for (let i = 0; i < m.symbols.length; i++) {
    for (let j = i + 1; j < m.symbols.length; j++) {
      const v = m.matrix[i][j];
      if (!bestPair || v > bestPair[2]) bestPair = [m.symbols[i], m.symbols[j], v];
      if (!worstPair || v < worstPair[2]) worstPair = [m.symbols[i], m.symbols[j], v];
    }
  }
  const parts: string[] = [];
  if (bestPair) parts.push(`Most correlated pair: ${bestPair[0]}/${bestPair[1]} at ${bestPair[2].toFixed(2)}.`);
  if (worstPair && worstPair !== bestPair) {
    parts.push(`Least correlated (or most negative): ${worstPair[0]}/${worstPair[1]} at ${worstPair[2].toFixed(2)}.`);
  }
  parts.push(`Computed on ${m.sampleSize.toLocaleString()} overlapping daily returns.`);
  return parts.join(' ');
}
