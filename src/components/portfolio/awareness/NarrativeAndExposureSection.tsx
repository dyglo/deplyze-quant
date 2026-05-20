/**
 * NarrativeAndExposureSection — wraps the existing NarrativeExposurePanel
 * with reflective framing tied to the portfolio's theme exposure.
 */

import React from 'react';
import { NarrativeExposurePanel } from '../NarrativeExposurePanel';
import type { NarrativeExposureResult } from '../../../services/reasoningService';

interface Props {
  result: NarrativeExposureResult | null;
  loading: boolean;
}

function fmtWeightPct(v: number | null | undefined): string | null {
  if (v == null) return null;
  const n = Number(v);
  if (!isFinite(n)) return null;
  return `${(n * 100).toFixed(1)}%`;
}

export const NarrativeAndExposureSection: React.FC<Props> = ({ result, loading }) => {
  const top = result?.exposures?.[0] ?? null;
  const topWeight = fmtWeightPct(top?.portfolio_weight);
  return (
    <section aria-label="Narrative theme exposure" style={{ padding: '0 32px', marginTop: 56 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ marginBottom: 22 }}>
          <p style={{
            margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            Narrative & Exposure
          </p>
          <h2 style={{
            margin: '6px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
            color: 'var(--foreground)',
          }}>
            Themes the portfolio is riding.
          </h2>
          <p style={{
            margin: '6px 0 0', fontSize: 12, lineHeight: 1.6,
            color: 'var(--muted-foreground)', maxWidth: 720,
          }}>
            {top && topWeight
              ? `Dominant theme exposure is "${top.theme_label}" at ${topWeight} portfolio weight.`
              : top
              ? `Dominant theme exposure is "${top.theme_label}" — explicit portfolio weight is unavailable for this theme.`
              : 'Narrative theme exposure will appear once the V3P2 narrative pipeline has matched themes to holdings.'}
          </p>
        </header>

        <NarrativeExposurePanel result={result} loading={loading} />
      </div>
    </section>
  );
};
