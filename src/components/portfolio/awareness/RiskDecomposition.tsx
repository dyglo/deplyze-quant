/**
 * RiskDecomposition — Bloomberg-PORT-inspired risk panel.
 *
 * Replaces the previous "Emerging Risk" composition. Layout:
 *
 *   Active Risk · Total Vol · Max Drawdown · Concentration (HHI)
 *   ┌────────────────────────┬────────────────────────┬───────────────────────────┐
 *   │ By Sector              │ Per-Holding Stress      │ Macro Regime (when avail) │
 *   │ Sector | weight | risk │ histogram (existing)    │ 6-dim mini chips           │
 *   └────────────────────────┴────────────────────────┴───────────────────────────┘
 *
 * "Active Risk" here is the cross-sectional dispersion of holding
 * realised vol weighted by position — a transparent client-side proxy
 * for tracking-error contribution. Not a factor model.
 *
 * Data sources (all already-fetched, no new network):
 *   - holdingCurves + effectiveWeights from usePortfolioPerformance
 *     → drives per-holding stress (computeClientStress) and sector-risk table
 *   - vulnerability from usePortfolioVulnerability (macro 6-dim, optional)
 *   - sectorBySymbol from useSectorMetadata
 */

import React, { useMemo } from 'react';
import { AlertTriangle, ShieldCheck, ShieldAlert, Activity } from 'lucide-react';
import type { Holding } from '../../../lib/portfolio/schemas';
import type { VulnerabilityResult, VulnerabilityDimension } from '../../../services/reasoningService';
import type { SectorClassification } from '../../../hooks/useSectorMetadata';
import {
  computeClientStress,
  type HoldingCurveInput,
} from '../../../lib/portfolio/clientStress';
import { SystemAnalyzingState } from '../../quant/SystemAnalyzingState';
import { SectionNarrative } from './SectionNarrative';
import { narrateRiskDecomposition } from '../../../lib/portfolio/sectionNarratives';

interface RiskDecompositionProps {
  holdings: Holding[];
  effectiveWeights: Record<string, number>;
  holdingCurves: HoldingCurveInput[];
  sectorBySymbol: Record<string, SectorClassification>;
  vulnerability: VulnerabilityResult | null;
  vulnerabilityLoading: boolean;
  annVol?: number;
  maxDrawdown?: number;
}

const DIM_LABEL: Record<string, string> = {
  growth_sensitivity:    'Growth',
  liquidity_sensitivity: 'Liquidity',
  inflation_sensitivity: 'Inflation',
  rates_sensitivity:     'Rates',
  vol_sensitivity:       'Volatility',
  concentration_risk:    'Concentration',
};

const LABEL_TONE: Record<VulnerabilityDimension['label'], { color: string; icon: React.ReactNode }> = {
  high_risk:     { color: 'var(--ds-loss)', icon: <AlertTriangle size={10} /> },
  moderate_risk: { color: '#C9A227', icon: <ShieldAlert size={10} /> },
  neutral:       { color: 'var(--muted-foreground)', icon: <Activity size={10} /> },
  resilient:     { color: 'var(--ds-gain)', icon: <ShieldCheck size={10} /> },
};

const COUNT_COLOR = (count: number): string => {
  if (count >= 4) return 'var(--ds-loss)';
  if (count === 3) return '#B85C2A';
  if (count === 2) return '#C9A227';
  if (count === 1) return 'var(--chart-3)';
  return '#9ca3af';
};

function fmtPct(v: number | undefined, signed = false): string {
  if (v == null || !isFinite(v)) return '—';
  const s = (v * 100).toFixed(2);
  return signed && v > 0 ? `+${s}%` : `${s}%`;
}

// ─── Math helpers ────────────────────────────────────────────────────────────

function logReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1], b = values[i];
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

function annualisedVol(rets: number[]): number {
  if (rets.length < 5) return 0;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const sse = rets.reduce((s, r) => s + (r - mean) ** 2, 0);
  return Math.sqrt(sse / Math.max(1, rets.length - 1)) * Math.sqrt(252);
}

function herfindahl(weights: number[]): number {
  return weights.reduce((s, w) => s + w * w, 0);
}

// ─── Sector risk table ───────────────────────────────────────────────────────

interface SectorRiskRow {
  sector: string;
  weight: number;
  weightedVol: number;
  contribPct: number;  // share of total weightedVol
  members: number;
}

function buildSectorRiskTable(
  holdings: Holding[],
  effectiveWeights: Record<string, number>,
  curves: HoldingCurveInput[],
  sectorBySymbol: Record<string, SectorClassification>,
): SectorRiskRow[] {
  const curveMap = new Map(curves.map(c => [c.symbol, c]));
  const groups = new Map<string, { weight: number; weightedVol: number; members: number }>();
  for (const h of holdings) {
    const sector = h.sector || sectorBySymbol[h.symbol]?.sector || 'Unclassified';
    const w = effectiveWeights[h.symbol] ?? 0;
    const c = curveMap.get(h.symbol);
    const vol = c ? annualisedVol(logReturns(c.data.map(p => p.value).filter(v => v > 0 && isFinite(v)))) : 0;
    const existing = groups.get(sector);
    if (existing) {
      existing.weight += w;
      existing.weightedVol += w * vol;
      existing.members += 1;
    } else {
      groups.set(sector, { weight: w, weightedVol: w * vol, members: 1 });
    }
  }
  const total = Array.from(groups.values()).reduce((s, g) => s + g.weightedVol, 0);
  const rows: SectorRiskRow[] = Array.from(groups.entries()).map(([sector, g]) => ({
    sector,
    weight: g.weight,
    weightedVol: g.weightedVol,
    contribPct: total > 0 ? g.weightedVol / total : 0,
    members: g.members,
  })).sort((a, b) => b.weightedVol - a.weightedVol);
  return rows;
}

// ─── Components ─────────────────────────────────────────────────────────────

const StatChip: React.FC<{ label: string; value: string; tone?: 'pos' | 'neg' | 'warn' | 'neutral' }> = ({ label, value, tone = 'neutral' }) => {
  const color =
    tone === 'pos'  ? 'var(--chart-2)' :
    tone === 'neg'  ? 'var(--destructive)' :
    tone === 'warn' ? 'var(--chart-4)' :
    'var(--foreground)';
  return (
    <div style={{ flex: '1 1 0', padding: '10px 14px', borderRight: '1px solid var(--border)', minWidth: 0 }}>
      <p style={{
        margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--muted-foreground)',
      }}>
        {label}
      </p>
      <p style={{
        margin: '4px 0 0', fontSize: 16, fontWeight: 700, color,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.015em',
      }}>
        {value}
      </p>
    </div>
  );
};

const SectorRow: React.FC<{ row: SectorRiskRow; maxContrib: number }> = ({ row, maxContrib }) => {
  const widthPct = maxContrib > 0 ? Math.min(100, (row.contribPct / maxContrib) * 100) : 0;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 44px 56px 1fr',
      gap: 10, alignItems: 'center',
      padding: '6px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{
        fontSize: 11, color: 'var(--foreground)', fontWeight: 500,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }} title={row.sector}>
        {row.sector}
      </span>
      <span style={{
        fontSize: 10, color: 'var(--muted-foreground)',
        fontVariantNumeric: 'tabular-nums', textAlign: 'right',
      }}>
        {fmtPct(row.weight)}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 700, color: 'var(--foreground)',
        fontVariantNumeric: 'tabular-nums', textAlign: 'right',
      }}>
        {(row.contribPct * 100).toFixed(1)}%
      </span>
      <div style={{
        position: 'relative', height: 6, borderRadius: 2,
        background: 'var(--muted)', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, width: `${widthPct}%`,
          background: 'var(--chart-4)', opacity: 0.85,
        }} />
      </div>
    </div>
  );
};

interface HoldingStress {
  symbol: string;
  weight: number;
  intensity: number;
  count: number;
  dimensions: string[];
}

const HoldingStressRow: React.FC<{ row: HoldingStress; maxIntensity: number }> = ({ row, maxIntensity }) => {
  const widthPct = maxIntensity > 0 ? Math.min(100, (row.intensity / maxIntensity) * 100) : 0;
  const color = COUNT_COLOR(row.count);
  return (
    <div
      title={row.dimensions.length ? row.dimensions.join(', ') : 'No stress dimensions'}
      style={{
        display: 'grid', gridTemplateColumns: '88px 1fr 48px',
        gap: 10, alignItems: 'center',
        padding: '6px 0', borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: 'var(--foreground)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {row.symbol}
        </span>
        <span style={{
          fontSize: 9, color: 'var(--muted-foreground)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {(row.weight * 100).toFixed(1)}%
        </span>
      </div>
      <div style={{
        position: 'relative', height: 8, borderRadius: 2,
        background: 'var(--muted)', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, width: `${widthPct}%`,
          background: color, opacity: 0.85,
        }} />
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, color, textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {row.count}/6
      </span>
    </div>
  );
};

export const RiskDecomposition: React.FC<RiskDecompositionProps> = ({
  holdings,
  effectiveWeights,
  holdingCurves,
  sectorBySymbol,
  vulnerability,
  vulnerabilityLoading,
  annVol,
  maxDrawdown,
}) => {
  // Effective HHI from non-zero weights
  const hhi = useMemo(() => {
    const ws = holdings.map(h => effectiveWeights[h.symbol] ?? 0).filter(w => w > 0);
    return ws.length ? herfindahl(ws) : 0;
  }, [holdings, effectiveWeights]);

  const sectorRiskRows = useMemo(
    () => buildSectorRiskTable(holdings, effectiveWeights, holdingCurves, sectorBySymbol).slice(0, 10),
    [holdings, effectiveWeights, holdingCurves, sectorBySymbol],
  );
  const maxSectorContrib = sectorRiskRows.reduce((m, r) => Math.max(m, r.contribPct), 0);

  const clientStress = useMemo(
    () => computeClientStress(holdings, effectiveWeights, holdingCurves),
    [holdings, effectiveWeights, holdingCurves],
  );

  // Blend client stress with backend vulnerability top_contributors
  const stressRows: HoldingStress[] = useMemo(() => {
    if (!vulnerability) {
      return clientStress.rows.map(r => ({
        symbol: r.symbol, weight: r.weight,
        intensity: r.intensity, count: r.count, dimensions: r.dimensions,
      }));
    }
    const byKey = new Map<string, HoldingStress>();
    for (const r of clientStress.rows) {
      byKey.set(r.symbol, { symbol: r.symbol, weight: r.weight, intensity: r.intensity, count: r.count, dimensions: [...r.dimensions] });
    }
    for (const [dimKey, dim] of Object.entries(vulnerability.dimensions ?? {})) {
      const label = DIM_LABEL[dimKey] ?? dimKey;
      const score = Math.abs(Number(dim.score) || 0);
      for (const sym of dim.top_contributors ?? []) {
        const row = byKey.get(sym);
        if (!row) continue;
        row.intensity += score;
        row.count += 1;
        row.dimensions.push(label);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => b.intensity - a.intensity);
  }, [clientStress, vulnerability]);

  const maxIntensity = stressRows.reduce((m, r) => Math.max(m, r.intensity), 0);
  const limitedStress = stressRows.slice(0, 12);

  const showMacroPanel = vulnerability || vulnerabilityLoading;

  return (
    <section aria-label="Risk decomposition" style={{ padding: '0 32px', marginTop: 56 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ marginBottom: 14 }}>
          <p style={{
            margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            Risk
          </p>
          <h2 style={{
            margin: '4px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
            color: 'var(--foreground)',
          }}>
            Where risk is concentrating.
          </h2>
        </header>

        <SectionNarrative
          lines={narrateRiskDecomposition({
            annVol,
            maxDrawdown,
            hhi,
            holdingsCount: holdings.length,
            stressedCount: stressRows.filter(r => r.count >= 2).length,
            topSectorRiskShare: sectorRiskRows[0] ? { sector: sectorRiskRows[0].sector, share: sectorRiskRows[0].contribPct } : undefined,
            vulnerability,
          })}
        />

        {/* Risk KPI strip */}
        <div style={{
          display: 'flex', alignItems: 'stretch',
          border: '1px solid var(--border)', borderRadius: 10,
          background: 'var(--card)', overflow: 'hidden',
          marginBottom: 14,
        }}>
          <StatChip label="Ann. Volatility" value={fmtPct(annVol)} tone="warn" />
          <StatChip label="Max Drawdown" value={fmtPct(maxDrawdown, true)} tone="neg" />
          <StatChip label="HHI Concentration" value={hhi ? hhi.toFixed(3) : '—'} tone={hhi > 0.20 ? 'neg' : hhi > 0.12 ? 'warn' : 'neutral'} />
          <StatChip label="Holdings" value={String(holdings.length)} />
          <StatChip
            label="Stressed (>1 dim)"
            value={`${stressRows.filter(r => r.count >= 2).length}/${holdings.length}`}
            tone={stressRows.filter(r => r.count >= 2).length > holdings.length * 0.3 ? 'neg' : 'neutral'}
          />
        </div>

        {/* Three-column body */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: showMacroPanel ? 'minmax(0, 1.05fr) minmax(0, 1.2fr) minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1.4fr)',
          gap: 14, alignItems: 'flex-start',
        }}>
          {/* Sector risk */}
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--card)',
          }}>
            <p style={{
              margin: '0 0 10px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
            }}>
              Risk by Sector
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 44px 56px 1fr', gap: 10,
              padding: '0 0 5px', borderBottom: '1px solid var(--border)',
              fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
            }}>
              <span>Sector</span>
              <span style={{ textAlign: 'right' }}>Weight</span>
              <span style={{ textAlign: 'right' }}>Share</span>
              <span>Magnitude</span>
            </div>
            {sectorRiskRows.length === 0 ? (
              <p style={{ padding: '14px 0', margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>
                Sector risk will appear once at least one holding has historical data and sector metadata.
              </p>
            ) : (
              sectorRiskRows.map(r => <SectorRow key={r.sector} row={r} maxContrib={maxSectorContrib} />)
            )}
            <p style={{
              margin: '8px 0 0', fontSize: 9, color: 'var(--muted-foreground)',
              fontStyle: 'italic', lineHeight: 1.5,
            }}>
              Share of total weighted vol. Not a factor model — a transparent
              client-side decomposition.
            </p>
          </div>

          {/* Per-holding stress histogram */}
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--card)',
          }}>
            <p style={{
              margin: '0 0 10px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
            }}>
              Per-Holding Stress
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: '88px 1fr 48px', gap: 10,
              padding: '0 0 5px', borderBottom: '1px solid var(--border)',
              fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
            }}>
              <span>Symbol · w%</span>
              <span>Intensity</span>
              <span style={{ textAlign: 'right' }}>Dims</span>
            </div>
            {limitedStress.length === 0 ? (
              <p style={{ padding: '14px 0', margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>
                No price history yet for stress computation.
              </p>
            ) : (
              limitedStress.map(r => <HoldingStressRow key={r.symbol} row={r} maxIntensity={maxIntensity} />)
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginTop: 8,
              fontSize: 8, letterSpacing: '0.04em', color: 'var(--muted-foreground)',
            }}>
              <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>Dim count</span>
              {[1, 2, 3, 4, 5].map(n => (
                <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: COUNT_COLOR(n) }} />
                  {n}{n === 5 ? '+' : ''}
                </span>
              ))}
            </div>
          </div>

          {/* Macro regime panel (only when backend has data) */}
          {showMacroPanel && (
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--card)',
            }}>
              <p style={{
                margin: '0 0 10px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--muted-foreground)',
              }}>
                Macro Regime · 6 Dimensions
              </p>
              {vulnerabilityLoading && !vulnerability ? (
                <SystemAnalyzingState label="Computing regime vulnerability" compact />
              ) : vulnerability ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(vulnerability.dimensions ?? {}).map(([k, d]) => {
                    const tone = LABEL_TONE[d.label] ?? LABEL_TONE.neutral;
                    return (
                      <div key={k} style={{
                        display: 'grid', gridTemplateColumns: '1fr 40px',
                        gap: 8, alignItems: 'center',
                        padding: '6px 8px', borderRadius: 7,
                        border: '1px solid var(--border)', background: 'var(--background)',
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{
                            margin: 0, fontSize: 8, fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: '0.08em',
                            color: 'var(--muted-foreground)',
                          }}>
                            {DIM_LABEL[k] ?? k}
                          </p>
                          <p style={{
                            margin: '2px 0 0', fontSize: 10, fontWeight: 600,
                            color: tone.color, textTransform: 'capitalize',
                          }}>
                            <span style={{ marginRight: 4, display: 'inline-flex', verticalAlign: '-1px' }}>{tone.icon}</span>
                            {d.label.replace('_', ' ')}
                          </p>
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: 'var(--foreground)',
                          textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                        }}>
                          {(Math.abs(d.score) * 100).toFixed(0)}
                        </span>
                      </div>
                    );
                  })}
                  <p style={{
                    margin: '6px 0 0', fontSize: 9, color: 'var(--muted-foreground)',
                    fontStyle: 'italic', lineHeight: 1.5,
                  }}>
                    {vulnerability.safety_note ?? 'For monitoring, not direction.'}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
