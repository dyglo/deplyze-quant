/**
 * CorrelationProfile — Bloomberg-style correlation panel.
 *
 * Left:  per-holding correlation to benchmark (sorted desc), β reminder.
 * Right: intra-portfolio correlation heatmap (top N positions).
 *
 * Both views are derived from log returns of `holdingCurves` and the
 * benchmark return series passed in. No backend dependency.
 *
 * Replaces the previous single-line RelationshipShifts summary which
 * required agent observations to be useful.
 */

import React, { useMemo } from 'react';
import type { Holding } from '../../../lib/portfolio/schemas';
import { correlation, computePositionMetrics } from '../../../lib/portfolio/holdingAnalytics';
import type { HoldingCurveInput } from '../../../lib/portfolio/clientStress';
import { SectionNarrative } from './SectionNarrative';
import { narrateCorrelationProfile } from '../../../lib/portfolio/sectionNarratives';

interface Props {
  holdings: Holding[];
  effectiveWeights: Record<string, number>;
  holdingCurves: HoldingCurveInput[];
  benchLogReturns: number[];
  benchmarkId?: string;
  topN?: number;
}

function fmt(v: number): string {
  if (!isFinite(v)) return '—';
  if (Math.abs(v) < 0.005) return '0.00';
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

function corrColor(c: number): string {
  if (!isFinite(c)) return 'transparent';
  const a = Math.min(1, Math.abs(c));
  if (c > 0.05) return `rgba(90, 112, 82, ${0.10 + a * 0.45})`;  // gain (olive green)
  if (c < -0.05) return `rgba(176, 58, 46, ${0.10 + a * 0.45})`; // loss (brick red)
  return 'rgba(138, 134, 128, 0.10)';                            // neutral (muted)
}

const Row: React.FC<{ symbol: string; weight: number; corr: number; beta: number; maxAbs: number }> = ({ symbol, weight, corr, beta, maxAbs }) => {
  const widthPct = maxAbs > 0 ? Math.min(100, (Math.abs(corr) / maxAbs) * 100) : 0;
  const positive = corr >= 0;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '80px 44px 1fr 60px',
      gap: 10, alignItems: 'center',
      padding: '6px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700, color: 'var(--foreground)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {symbol}
      </span>
      <span style={{
        fontSize: 10, color: 'var(--muted-foreground)',
        fontVariantNumeric: 'tabular-nums', textAlign: 'right',
      }}>
        {(weight * 100).toFixed(1)}%
      </span>
      <div style={{
        position: 'relative', height: 8, borderRadius: 2,
        background: 'var(--muted)', overflow: 'hidden',
      }}>
        {/* centered axis */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: positive ? '50%' : `${50 - widthPct / 2}%`,
          width: `${widthPct / 2}%`,
          background: positive ? 'var(--chart-2)' : 'var(--destructive)',
          opacity: 0.85,
        }} />
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: '50%', width: 1, background: 'var(--border)',
        }} />
      </div>
      <span style={{
        fontSize: 10, fontWeight: 600,
        color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums', textAlign: 'right',
      }}>
        β {beta.toFixed(2)}
      </span>
    </div>
  );
};

export const CorrelationProfile: React.FC<Props> = ({
  holdings,
  effectiveWeights,
  holdingCurves,
  benchLogReturns,
  benchmarkId,
  topN = 8,
}) => {
  const positions = useMemo(
    () => computePositionMetrics(holdings.map(h => h.symbol), effectiveWeights, holdingCurves, benchLogReturns),
    [holdings, effectiveWeights, holdingCurves, benchLogReturns],
  );

  const benchRows = useMemo(
    () => [...positions].sort((a, b) => b.corrToBenchmark - a.corrToBenchmark),
    [positions],
  );

  const maxAbsCorr = Math.max(0.0001, ...positions.map(p => Math.abs(p.corrToBenchmark)));

  // Top-N by weight for the matrix
  const topSymbols = useMemo(
    () => [...positions].sort((a, b) => b.weight - a.weight).slice(0, topN).map(p => p.symbol),
    [positions, topN],
  );

  const matrix = useMemo(() => {
    const map = new Map(positions.map(p => [p.symbol, p]));
    const m: number[][] = [];
    for (const a of topSymbols) {
      const row: number[] = [];
      const ra = map.get(a)?.logRets ?? [];
      for (const b of topSymbols) {
        if (a === b) { row.push(1); continue; }
        const rb = map.get(b)?.logRets ?? [];
        row.push(correlation(ra, rb));
      }
      m.push(row);
    }
    return m;
  }, [positions, topSymbols]);

  // Mean intra-portfolio off-diagonal correlation
  const meanIntraCorr = useMemo(() => {
    if (matrix.length < 2) return 0;
    let sum = 0, count = 0;
    for (let i = 0; i < matrix.length; i++) {
      for (let j = i + 1; j < matrix[i].length; j++) {
        sum += matrix[i][j];
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }, [matrix]);

  return (
    <section aria-label="Correlation profile" style={{ padding: '0 32px', marginTop: 56 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ marginBottom: 14 }}>
          <p style={{
            margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            Correlation Profile
          </p>
          <h2 style={{
            margin: '4px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
            color: 'var(--foreground)',
          }}>
            How positions move together.
          </h2>
        </header>

        <SectionNarrative
          lines={narrateCorrelationProfile({
            positions,
            benchmarkId,
            meanIntraCorr,
          })}
        />

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.05fr)',
          gap: 14, alignItems: 'flex-start',
        }}>
          {/* Per-holding correlation to benchmark */}
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--card)',
          }}>
            <p style={{
              margin: '0 0 10px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
            }}>
              Correlation to {benchmarkId ?? 'Benchmark'}
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: '80px 44px 1fr 60px', gap: 10,
              padding: '0 0 5px', borderBottom: '1px solid var(--border)',
              fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
            }}>
              <span>Symbol</span>
              <span style={{ textAlign: 'right' }}>Weight</span>
              <span>Correlation</span>
              <span style={{ textAlign: 'right' }}>Beta</span>
            </div>
            {benchRows.length === 0 ? (
              <p style={{ padding: '14px 0', margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>
                No price history yet for correlation analysis.
              </p>
            ) : (
              benchRows.map(p => (
                <Row
                  key={p.symbol}
                  symbol={p.symbol}
                  weight={p.weight}
                  corr={p.corrToBenchmark}
                  beta={p.beta}
                  maxAbs={maxAbsCorr}
                />
              ))
            )}
          </div>

          {/* Intra-portfolio correlation heatmap */}
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--card)',
          }}>
            <p style={{
              margin: '0 0 10px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
            }}>
              Intra-Portfolio Correlation · top {topSymbols.length}
            </p>
            {topSymbols.length === 0 ? (
              <p style={{ padding: '14px 0', margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>
                Add holdings to see intra-portfolio correlations.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '4px 6px', fontSize: 9, color: 'var(--muted-foreground)', textAlign: 'left' }} />
                      {topSymbols.map(s => (
                        <th key={s} style={{
                          padding: '4px 6px', fontSize: 9, fontWeight: 700,
                          color: 'var(--muted-foreground)', textAlign: 'center',
                          letterSpacing: '0.04em',
                        }}>
                          {s}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topSymbols.map((rowSym, i) => (
                      <tr key={rowSym}>
                        <td style={{
                          padding: '4px 6px', fontSize: 10, fontWeight: 700,
                          color: 'var(--foreground)', whiteSpace: 'nowrap',
                          borderRight: '1px solid var(--border)',
                        }}>
                          {rowSym}
                        </td>
                        {topSymbols.map((colSym, j) => {
                          const v = matrix[i][j];
                          return (
                            <td key={colSym} title={`${rowSym} × ${colSym}: ${fmt(v)}`} style={{
                              padding: '4px 0', textAlign: 'center',
                              background: corrColor(v),
                              fontSize: 9, fontWeight: 600,
                              color: 'var(--foreground)',
                              minWidth: 36,
                            }}>
                              {i === j ? '·' : fmt(v)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14, marginTop: 10,
              fontSize: 9, letterSpacing: '0.04em', color: 'var(--muted-foreground)',
            }}>
              <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>Scale</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 14, height: 9, background: corrColor(0.9), borderRadius: 2 }} />
                positive
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 14, height: 9, background: corrColor(0), borderRadius: 2 }} />
                neutral
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 14, height: 9, background: corrColor(-0.9), borderRadius: 2 }} />
                negative
              </span>
            </div>
          </div>
        </div>

        <p style={{
          margin: '10px 0 0', fontSize: 10, color: 'var(--muted-foreground)',
          lineHeight: 1.55, fontStyle: 'italic',
        }}>
          Correlations are Pearson over log-returns of the loaded window. Heatmap is
          symmetric; diagonal is 1. Rising correlations compress diversification benefit;
          decoupling raises dispersion.
        </p>
      </div>
    </section>
  );
};
