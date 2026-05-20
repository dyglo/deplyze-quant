/**
 * EmergingRiskCluster — per-holding stress histogram derived from the
 * agent vulnerability dimensions, paired with a compact dimension chip
 * grid and the current portfolio-aware agent observations.
 *
 * Method:
 *   - The /agents/vulnerability endpoint returns 6 macro-regime dimensions
 *     (growth, liquidity, inflation, rates, vol, concentration). Each
 *     dimension carries a |score| and a list of `top_contributors` — the
 *     symbols most responsible for that dimension's stress.
 *   - We pivot: for every holding we accumulate a *stress intensity*
 *     (Σ |dim.score| across dimensions naming the holding) and a *stress
 *     count* (how many dimensions name it).
 *   - One bar per holding, sized by intensity, coloured by count.
 */

import React, { useMemo } from 'react';
import { AlertTriangle, ShieldCheck, ShieldAlert, Activity } from 'lucide-react';
import type { Holding } from '../../../lib/portfolio/schemas';
import type { VulnerabilityResult, VulnerabilityDimension } from '../../../services/reasoningService';
import type { AgentOutput, AgentSeverity } from '../../../types/agents';
import { SystemAnalyzingState } from '../../quant/SystemAnalyzingState';
import {
  computeClientStress,
  type ClientHoldingStress,
  type ClientStressDimensionSummary,
  type HoldingCurveInput,
} from '../../../lib/portfolio/clientStress';

interface EmergingRiskClusterProps {
  vulnerability: VulnerabilityResult | null;
  vulnerabilityLoading: boolean;
  portfolioObservations: AgentOutput[];
  holdings: Holding[];
  effectiveWeights: Record<string, number>;
  holdingsCount: number;
  /** Per-holding rebased price curves from usePortfolioPerformance. Drives the
   *  client-side stress histogram fallback when /agents/vulnerability is empty. */
  holdingCurves?: HoldingCurveInput[];
}

const SEV_ORDER: Record<AgentSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };

const DIM_LABEL: Record<string, string> = {
  growth_sensitivity:      'Growth',
  liquidity_sensitivity:   'Liquidity',
  inflation_sensitivity:   'Inflation',
  rates_sensitivity:       'Rates',
  vol_sensitivity:         'Volatility',
  concentration_risk:      'Concentration',
};

const LABEL_TONE: Record<VulnerabilityDimension['label'], { color: string; icon: React.ReactNode }> = {
  high_risk:     { color: '#ef4444', icon: <AlertTriangle size={11} /> },
  moderate_risk: { color: '#f59e0b', icon: <ShieldAlert size={11} /> },
  neutral:       { color: '#6b7280', icon: <Activity size={11} /> },
  resilient:     { color: '#10b981', icon: <ShieldCheck size={11} /> },
};

interface HoldingStress {
  symbol: string;
  weight: number;
  intensity: number;
  count: number;
  dimensions: string[];
}

function buildHoldingStress(
  holdings: Holding[],
  effectiveWeights: Record<string, number>,
  vulnerability: VulnerabilityResult | null,
): HoldingStress[] {
  if (!vulnerability) return [];
  const map = new Map<string, HoldingStress>();
  for (const h of holdings) {
    map.set(h.symbol, {
      symbol: h.symbol,
      weight: effectiveWeights[h.symbol] ?? 0,
      intensity: 0,
      count: 0,
      dimensions: [],
    });
  }
  for (const [dimKey, dim] of Object.entries(vulnerability.dimensions ?? {})) {
    const dimLabel = DIM_LABEL[dimKey] ?? dimKey;
    const score = Math.abs(Number(dim.score) || 0);
    for (const sym of dim.top_contributors ?? []) {
      const row = map.get(sym);
      if (!row) continue;
      row.intensity += score;
      row.count += 1;
      row.dimensions.push(dimLabel);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.intensity - a.intensity);
}

function fmtPct(v: number): string {
  if (!isFinite(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

const COUNT_COLOR = (count: number): string => {
  if (count >= 4) return '#ef4444';
  if (count === 3) return '#f97316';
  if (count === 2) return '#f59e0b';
  if (count === 1) return '#6366f1';
  return '#9ca3af';
};

const StressBar: React.FC<{ row: HoldingStress; maxIntensity: number }> = ({ row, maxIntensity }) => {
  const widthPct = maxIntensity > 0 ? Math.min(100, (row.intensity / maxIntensity) * 100) : 0;
  const color = COUNT_COLOR(row.count);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '92px 1fr 64px',
      gap: 14, alignItems: 'center',
      padding: '9px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color: 'var(--foreground)',
          letterSpacing: '-0.005em', fontVariantNumeric: 'tabular-nums',
        }}>
          {row.symbol}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 600, color: 'var(--muted-foreground)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {fmtPct(row.weight)}
        </span>
      </div>
      <div
        title={row.dimensions.length ? row.dimensions.join(', ') : 'No stress dimensions'}
        style={{
          position: 'relative', height: 10, borderRadius: 3, background: 'var(--muted)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0, width: `${widthPct}%`,
          background: color, opacity: 0.85,
        }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {row.count}/6
        </span>
      </div>
    </div>
  );
};

const ClientDimRow: React.FC<{ dim: ClientStressDimensionSummary; totalHoldings: number }> = ({ dim, totalHoldings }) => {
  const flagged = dim.flaggedSymbols.length;
  const tone =
    flagged === 0           ? '#10b981' :
    flagged >= totalHoldings * 0.5 ? '#ef4444' :
    flagged >= totalHoldings * 0.25 ? '#f59e0b' :
    '#6366f1';
  return (
    <div
      title={dim.description}
      style={{
        display: 'grid', gridTemplateColumns: '1fr 38px 64px', gap: 10, alignItems: 'center',
        padding: '6px 10px', borderRadius: 7,
        border: '1px solid var(--border)', background: 'var(--background)',
      }}
    >
      <span style={{
        fontSize: 11, fontWeight: 600, color: 'var(--foreground)',
        letterSpacing: '-0.005em',
      }}>
        {dim.label}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 700, color: tone, textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {flagged}/{totalHoldings}
      </span>
      <span style={{
        fontSize: 9, fontWeight: 600, color: 'var(--muted-foreground)',
        letterSpacing: '0.04em', textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {flagged > 0 ? `μ ${(dim.meanSeverity * 100).toFixed(0)}` : '—'}
      </span>
    </div>
  );
};

const DimChip: React.FC<{ dimKey: string; dim: VulnerabilityDimension }> = ({ dimKey, dim }) => {
  const tone = LABEL_TONE[dim.label] ?? LABEL_TONE.neutral;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px', borderRadius: 7,
      border: '1px solid var(--border)', background: 'var(--background)',
    }}>
      <span style={{ color: tone.color, display: 'inline-flex' }}>{tone.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 9, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          color: 'var(--muted-foreground)',
        }}>
          {DIM_LABEL[dimKey] ?? dimKey}
        </p>
        <p style={{
          margin: '2px 0 0', fontSize: 11, fontWeight: 600,
          color: tone.color, textTransform: 'capitalize',
          letterSpacing: '-0.005em',
        }}>
          {dim.label.replace('_', ' ')}
        </p>
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700, color: 'var(--foreground)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {(Math.abs(dim.score) * 100).toFixed(0)}
      </span>
    </div>
  );
};

export const EmergingRiskCluster: React.FC<EmergingRiskClusterProps> = ({
  vulnerability,
  vulnerabilityLoading,
  portfolioObservations,
  holdings,
  effectiveWeights,
  holdingsCount,
  holdingCurves = [],
}) => {
  // Backend (macro-regime) per-holding stress.
  const backendStress = useMemo(
    () => buildHoldingStress(holdings, effectiveWeights, vulnerability),
    [holdings, effectiveWeights, vulnerability],
  );

  // Client-side (price-derived) per-holding stress. Always computed so the
  // histogram is informative regardless of backend availability.
  const clientStress = useMemo(
    () => computeClientStress(holdings, effectiveWeights, holdingCurves),
    [holdings, effectiveWeights, holdingCurves],
  );

  // Blend: prefer backend dims when present for a symbol, but always include
  // client dims so price-derived flags surface. Total dim count caps at 6
  // (backend dimensions) + 5 (client dimensions) = 11; display uses the raw count.
  const stressRows = useMemo(() => {
    if (vulnerability) {
      // Merge: per symbol, take max(intensity), union(dimensions), sum count
      const byKey = new Map<string, { symbol: string; weight: number; intensity: number; count: number; dimensions: string[] }>();
      for (const r of backendStress) byKey.set(r.symbol, { ...r });
      for (const r of clientStress.rows) {
        const existing = byKey.get(r.symbol);
        if (!existing) {
          byKey.set(r.symbol, { ...r });
        } else {
          existing.intensity += r.intensity;
          existing.count += r.count;
          existing.dimensions = [...existing.dimensions, ...r.dimensions];
        }
      }
      return Array.from(byKey.values()).sort((a, b) => b.intensity - a.intensity);
    }
    // No backend → use client stress alone
    return clientStress.rows.map((r: ClientHoldingStress) => ({
      symbol: r.symbol, weight: r.weight, intensity: r.intensity, count: r.count, dimensions: r.dimensions,
    }));
  }, [vulnerability, backendStress, clientStress]);

  const maxIntensity = stressRows.reduce((m, r) => Math.max(m, r.intensity), 0);
  const stressedCount = stressRows.filter(r => r.count > 0).length;
  const usingClientFallback = !vulnerability;

  const ranked = useMemo(() => {
    return [...portfolioObservations]
      .filter(o => (o.severity ?? 'info') !== 'info')
      .sort((a, b) => SEV_ORDER[(a.severity ?? 'info') as AgentSeverity] - SEV_ORDER[(b.severity ?? 'info') as AgentSeverity])
      .slice(0, 4);
  }, [portfolioObservations]);

  return (
    <section aria-label="Emerging risks" style={{ padding: '0 32px', marginTop: 56 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ marginBottom: 22 }}>
          <p style={{
            margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            Emerging Risk
          </p>
          <h2 style={{
            margin: '6px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
            color: 'var(--foreground)',
          }}>
            Where the portfolio is becoming vulnerable.
          </h2>
          <p style={{
            margin: '6px 0 0', fontSize: 12, lineHeight: 1.6,
            color: 'var(--muted-foreground)', maxWidth: 760,
          }}>
            {usingClientFallback
              ? `${stressedCount}/${holdingsCount} holdings are flagged by at least one of five price-derived stress dimensions (volatility, drawdown, concentration, underperformance, recent weakness). Bars below show stress intensity; colour encodes how many dimensions stress each holding.`
              : `${stressedCount}/${holdingsCount} holdings are flagged across price-derived stress and the six macro-regime vulnerability dimensions. Bars below show stress intensity; colour encodes how many dimensions stress each holding.`}
          </p>
        </header>

        {/* Histogram */}
        <div style={{
          padding: '16px 18px', borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--card)',
          marginBottom: 18,
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '92px 1fr 64px', gap: 14,
            padding: '0 0 6px', borderBottom: '1px solid var(--border)',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            <span>Holding · w%</span>
            <span>Stress intensity</span>
            <span style={{ textAlign: 'right' }}>Dims</span>
          </div>

          {vulnerabilityLoading && stressRows.length === 0 ? (
            <div style={{ padding: '16px 0' }}>
              <SystemAnalyzingState label="Computing per-holding stress" />
            </div>
          ) : stressRows.length === 0 ? (
            <p style={{
              padding: '18px 0', margin: 0, fontSize: 12, color: 'var(--muted-foreground)',
            }}>
              {holdings.length === 0
                ? 'Add holdings to enable per-holding stress analysis.'
                : 'No price history yet for any holding — stress profile will appear once historical data has loaded.'}
            </p>
          ) : (
            stressRows.map(r => <StressBar key={r.symbol} row={r} maxIntensity={maxIntensity} />)
          )}

          {stressRows.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14, marginTop: 12,
              paddingTop: 10, borderTop: '1px solid var(--border)',
              fontSize: 9, letterSpacing: '0.04em', color: 'var(--muted-foreground)',
            }}>
              <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>Dim count</span>
              {[1, 2, 3, 4, 5].map(n => (
                <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: COUNT_COLOR(n) }} />
                  {n}{n === 5 ? '+' : ''}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Dimension chips + portfolio observations */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 16, alignItems: 'start',
        }}>
          <div style={{
            padding: '14px 16px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--card)',
          }}>
            <p style={{
              margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
            }}>
              {usingClientFallback ? 'Stress Dimensions · Price-Derived' : 'Regime Vulnerability · 6 Dimensions'}
            </p>

            {/* Client-derived dimensions (always shown — they are the always-available baseline) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              {clientStress.dimensions.map(d => (
                <ClientDimRow key={d.key} dim={d} totalHoldings={holdings.length} />
              ))}
            </div>

            {/* Backend macro-regime dimensions stacked below when available */}
            {vulnerability && (
              <>
                <p style={{
                  margin: '14px 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'var(--muted-foreground)',
                }}>
                  Macro Regime · 6 Dimensions
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {Object.entries(vulnerability.dimensions ?? {}).map(([k, d]) => (
                    <DimChip key={k} dimKey={k} dim={d} />
                  ))}
                </div>
                <p style={{
                  margin: '12px 0 0', fontSize: 10, color: 'var(--muted-foreground)',
                  fontStyle: 'italic', lineHeight: 1.55,
                }}>
                  {vulnerability.safety_note ?? 'For monitoring, not direction.'}
                </p>
              </>
            )}

            {usingClientFallback && (
              <p style={{
                margin: '14px 0 0', fontSize: 10, color: 'var(--muted-foreground)',
                fontStyle: 'italic', lineHeight: 1.55,
              }}>
                Macro-regime vulnerability composite is not yet available for this portfolio. The price-derived
                stress profile above is computed from the holdings' realised returns and concentration.
              </p>
            )}
          </div>

          <div>
            <p style={{
              margin: '0 0 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
            }}>
              Active Portfolio Observations
            </p>
            {ranked.length === 0 ? (
              <div style={{
                padding: '14px 16px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--card)',
                fontSize: 12, lineHeight: 1.55, color: 'var(--muted-foreground)',
              }}>
                No elevated portfolio-specific observations in the last 7 days. The
                quiet itself is a useful read.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ranked.map(o => (
                  <div key={o.artifact_id} style={{
                    padding: '10px 12px', borderRadius: 9,
                    border: '1px solid var(--border)', background: 'var(--card)',
                  }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: o.severity === 'high' ? '#ef4444' : o.severity === 'medium' ? '#f59e0b' : '#6366f1',
                      }}>
                        {o.severity ?? 'info'}
                      </span>
                      <span style={{
                        fontSize: 12, fontWeight: 600, color: 'var(--foreground)',
                        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {o.title ?? o.domain}
                      </span>
                    </div>
                    {o.summary && (
                      <p style={{
                        margin: '4px 0 0', fontSize: 11, lineHeight: 1.55,
                        color: 'var(--muted-foreground)',
                      }}>
                        {o.summary}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
