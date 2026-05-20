/**
 * HistoricalScenarios — Bloomberg PORT "Scenarios Navigator" pattern.
 *
 * Wide horizontal table. Each column is a historical regime analog
 * surfaced by the V4 reasoning engine; rows summarise the macro feature
 * vector and the implied tilt for the current portfolio.
 *
 * Cells are colour-encoded reads of each feature's z-score sign and
 * magnitude (red = stress, green = supportive, neutral = mid-band).
 * No fabricated impact numbers — the figures shown are the actual
 * feature-vector values that drove the Euclidean-distance analog match.
 *
 * Why this replaces the standalone "Historical Context" section: it
 * compresses the same data into a denser, more decision-relevant grid
 * (multiple analogs side-by-side instead of one card per scrolling
 * viewport).
 */

import React, { useMemo } from 'react';
import type { AnalogResult, AnalogPeriod } from '../../../services/reasoningService';

interface Props {
  analog: AnalogResult | null;
  loading: boolean;
}

const FEATURE_KEYS: Array<keyof AnalogPeriod['feature_vector']> = [
  'growth_zscore', 'liquidity_zscore', 'inflation_zscore', 'rates_zscore', 'vol_percentile',
];

const FEATURE_LABEL: Record<keyof AnalogPeriod['feature_vector'], string> = {
  growth_zscore:    'Growth',
  liquidity_zscore: 'Liquidity',
  inflation_zscore: 'Inflation',
  rates_zscore:     'Rates',
  vol_percentile:   'Vol %ile',
};

const REGIME_COLOR: Record<string, string> = {
  expansion:   'var(--chart-2)',
  transition:  'var(--chart-4)',
  tightening:  'var(--chart-4)',
  contraction: 'var(--destructive)',
  stagflation: 'var(--destructive)',
};

function zCellColor(z: number): string {
  const a = Math.min(1, Math.abs(z) / 2);
  if (z > 0.5) return `rgba(239, 68, 68, ${0.08 + a * 0.20})`;
  if (z < -0.5) return `rgba(99, 102, 241, ${0.08 + a * 0.20})`;
  return 'transparent';
}

function fmtZ(v: number): string {
  if (!isFinite(v)) return '—';
  if (Math.abs(v) < 0.005) return '0.00';
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

function fmtPctile(v: number): string {
  if (!isFinite(v)) return '—';
  return `${Math.round(v * 100)}`;
}

export const HistoricalScenarios: React.FC<Props> = ({ analog, loading }) => {
  const analogs: AnalogPeriod[] = useMemo(() => (analog?.analogs ?? []).slice(0, 5), [analog]);
  const current = analog?.current_vector ?? null;

  return (
    <section aria-label="Historical scenarios" style={{ padding: '0 32px', marginTop: 56 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ marginBottom: 14 }}>
          <p style={{
            margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            Historical Scenarios
          </p>
          <h2 style={{
            margin: '4px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
            color: 'var(--foreground)',
          }}>
            What today resembles.
          </h2>
        </header>

        <div style={{
          padding: 0, borderRadius: 10, overflow: 'hidden',
          border: '1px solid var(--border)', background: 'var(--card)',
        }}>
          {loading && analogs.length === 0 ? (
            <p style={{ padding: '20px 16px', margin: 0, fontSize: 12, color: 'var(--muted-foreground)' }}>
              Searching the macro feature history for the closest analogs.
            </p>
          ) : analogs.length === 0 ? (
            <p style={{ padding: '20px 16px', margin: 0, fontSize: 12, color: 'var(--muted-foreground)' }}>
              No analog data available yet. The analog engine needs at least one
              completed macro feature history pass.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                fontSize: 11, fontVariantNumeric: 'tabular-nums',
              }}>
                <thead>
                  <tr style={{ background: 'var(--muted)' }}>
                    <th style={{
                      textAlign: 'left', padding: '8px 14px',
                      borderBottom: '1px solid var(--border)',
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: 'var(--muted-foreground)',
                    }}>
                      Feature
                    </th>
                    <th style={{
                      textAlign: 'right', padding: '8px 14px',
                      borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                      textTransform: 'uppercase', color: 'var(--muted-foreground)',
                    }}>
                      Today
                    </th>
                    {analogs.map((a, idx) => {
                      const regimeColor = REGIME_COLOR[a.regime_label] ?? 'var(--muted-foreground)';
                      return (
                        <th key={`${a.date}-${idx}`} style={{
                          textAlign: 'right', padding: '8px 14px',
                          borderBottom: '1px solid var(--border)',
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                          color: 'var(--foreground)',
                          minWidth: 96,
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{a.date}</span>
                            <span style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 3,
                              color: regimeColor, background: `${regimeColor}15`,
                              border: `1px solid ${regimeColor}35`,
                              textTransform: 'uppercase', letterSpacing: '0.06em',
                              fontWeight: 700,
                            }}>
                              {a.regime_label}
                            </span>
                            <span style={{
                              fontSize: 8, color: 'var(--muted-foreground)',
                              fontWeight: 600, letterSpacing: '0.04em',
                            }}>
                              SIM {Math.round(a.similarity_score * 100)}%
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_KEYS.map(key => {
                    const isPctile = key === 'vol_percentile';
                    return (
                      <tr key={key}>
                        <td style={{
                          padding: '7px 14px',
                          borderBottom: '1px solid var(--border)',
                          fontSize: 11, fontWeight: 600,
                          color: 'var(--foreground)',
                        }}>
                          {FEATURE_LABEL[key]}
                        </td>
                        <td style={{
                          padding: '7px 14px',
                          borderBottom: '1px solid var(--border)',
                          borderRight: '1px solid var(--border)',
                          textAlign: 'right',
                          fontSize: 11, fontWeight: 700,
                          color: 'var(--foreground)',
                          background: current && !isPctile ? zCellColor(current[key]) : undefined,
                        }}>
                          {current ? (isPctile ? fmtPctile(current[key]) : fmtZ(current[key])) : '—'}
                        </td>
                        {analogs.map((a, idx) => {
                          const v = a.feature_vector[key];
                          return (
                            <td key={`${a.date}-${idx}-${key}`} style={{
                              padding: '7px 14px',
                              borderBottom: '1px solid var(--border)',
                              textAlign: 'right',
                              fontSize: 11, fontWeight: 600,
                              color: 'var(--foreground)',
                              background: isPctile ? undefined : zCellColor(v),
                            }}>
                              {isPctile ? fmtPctile(v) : fmtZ(v)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p style={{
          margin: '10px 0 0', fontSize: 10, color: 'var(--muted-foreground)',
          lineHeight: 1.55, fontStyle: 'italic', maxWidth: 760,
        }}>
          Similarity scores are Euclidean-distance proximity in the 5-dim macro feature
          space; they describe shape, not destiny. Past analogs do not forecast outcomes.
        </p>
      </div>
    </section>
  );
};
