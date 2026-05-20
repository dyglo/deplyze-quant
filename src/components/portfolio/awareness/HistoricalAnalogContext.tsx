/**
 * HistoricalAnalogContext — wraps the existing MacroAnalogPanel with a
 * portfolio-overlay framing. The analog itself comes from the V4 reasoning
 * engine (Euclidean macro feature distance); this section adds the
 * reflective second-person frame.
 */

import React from 'react';
import { MacroAnalogPanel } from '../../quant/MacroAnalogPanel';
import type { AnalogResult } from '../../../services/reasoningService';

interface Props {
  analog: AnalogResult | null;
  loading: boolean;
}

export const HistoricalAnalogContext: React.FC<Props> = ({ analog, loading }) => {
  const top = analog?.analogs?.[0] ?? null;
  return (
    <section aria-label="Historical analog context" style={{ padding: '0 32px', marginTop: 56 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ marginBottom: 22 }}>
          <p style={{
            margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            Historical Context
          </p>
          <h2 style={{
            margin: '6px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
            color: 'var(--foreground)',
          }}>
            Conditions that today most resembles.
          </h2>
          <p style={{
            margin: '6px 0 0', fontSize: 12, lineHeight: 1.6,
            color: 'var(--muted-foreground)', maxWidth: 720,
          }}>
            {top
              ? `Closest analog is ${top.date}, a ${top.regime_label} regime with ${(top.similarity_score * 100).toFixed(0)}% feature-vector similarity. Past analogs are descriptive — they do not forecast outcomes.`
              : 'Searching macro feature history for the closest analog to today.'}
          </p>
        </header>

        <MacroAnalogPanel result={analog} loading={loading} compact />
      </div>
    </section>
  );
};
