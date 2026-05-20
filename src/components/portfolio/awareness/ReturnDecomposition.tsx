/**
 * ReturnDecomposition — Bloomberg-PORT-inspired attribution panel.
 *
 * Layout:
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ Drivers · 1Y                                                     │
 *   │ Total Return +24.80%  ·  Active Return +6.60%  ·  vs SPY         │
 *   ├──────────┬───────────────────────────────────────────────────────┤
 *   │  Sector  │ Top Contributors                                      │
 *   │  Donut   │ NVDA   12.4%   +2.81%  ████████████████              │
 *   │          │ MSFT   10.1%   +1.94%  ██████████                    │
 *   │  + Legend│ ...                                                   │
 *   │          ├───────────────────────────────────────────────────────┤
 *   │          │ Bottom Detractors                                     │
 *   │          │ TSLA    4.2%   -0.84%   ██████                        │
 *   │          │ ...                                                   │
 *   └──────────┴───────────────────────────────────────────────────────┘
 *
 * Inspired by BBG PORT "Attribution Effects" / "Top Contributors by
 * Security Selection" but rendered in our design language (calm,
 * institutional, design-tokens, no orange/black).
 *
 * Data sources:
 *   - Holdings + effective weights + holdingCurves from usePortfolioPerformance
 *   - Sector field on each holding (auto-filled from useSectorMetadata when
 *     Firestore lacks it)
 *
 * Pure presentational — all math lives in `awarenessAttribution.ts`.
 */

import React, { useMemo, useState } from 'react';
import type { Holding } from '../../../lib/portfolio/schemas';
import {
  contributionByHolding,
  contributionBySector,
  type ContributionRow,
  type HoldingCurveLike,
} from '../../../lib/portfolio/awarenessAttribution';
import type { SectorClassification } from '../../../hooks/useSectorMetadata';
import { SectorDonut, SECTOR_PALETTE, type SectorSlice } from './SectorDonut';
import { SectionNarrative } from './SectionNarrative';
import { narrateReturnDecomposition } from '../../../lib/portfolio/sectionNarratives';

interface Props {
  holdings: Holding[];
  effectiveWeights: Record<string, number>;
  holdingCurves: HoldingCurveLike[];
  /** Auto-filled sector metadata (from FMP); merged with holdings' Firestore values. */
  sectorBySymbol: Record<string, SectorClassification>;
  totalReturn: number;
  benchmarkTotalReturn?: number;
  benchmarkId?: string;
  periodLabel: string;
  loadingSectors?: boolean;
}

function fmtPctSigned(v: number): string {
  if (!isFinite(v)) return '—';
  const s = (v * 100).toFixed(2);
  return v >= 0 ? `+${s}%` : `${s}%`;
}
function fmtPct(v: number): string {
  if (!isFinite(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

interface ResolvedHolding extends Holding {
  resolvedSector?: string;
}

function withSectors(holdings: Holding[], bySymbol: Record<string, SectorClassification>): ResolvedHolding[] {
  return holdings.map(h => ({
    ...h,
    resolvedSector: h.sector || bySymbol[h.symbol]?.sector || undefined,
    sector: h.sector || bySymbol[h.symbol]?.sector || h.sector,
  }));
}

const ContribRow: React.FC<{
  row: ContributionRow;
  maxAbs: number;
  align: 'positive' | 'negative';
  colorBars: boolean;
  rankColor?: string;
}> = ({ row, maxAbs, align, colorBars, rankColor }) => {
  const widthPct = maxAbs > 0 ? Math.min(100, (Math.abs(row.contribution) / maxAbs) * 100) : 0;
  const positive = row.contribution >= 0;
  const barColor = colorBars
    ? (positive ? 'var(--chart-2)' : 'var(--destructive)')
    : (positive ? 'var(--chart-2)' : 'var(--destructive)');
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '4px 92px 56px 72px 1fr',
      gap: 10, alignItems: 'center',
      padding: '7px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{
        width: 4, height: 14, borderRadius: 2,
        background: rankColor ?? 'transparent',
      }} />
      <span style={{
        fontSize: 12, fontWeight: 700, color: 'var(--foreground)',
        letterSpacing: '-0.005em', fontVariantNumeric: 'tabular-nums',
      }}>
        {row.label}
      </span>
      <span style={{
        fontSize: 10, color: 'var(--muted-foreground)',
        fontVariantNumeric: 'tabular-nums', textAlign: 'right',
      }}>
        {fmtPct(row.weight)}
      </span>
      <span style={{
        fontSize: 11, fontWeight: 700,
        color: positive ? 'var(--chart-2)' : 'var(--destructive)',
        fontVariantNumeric: 'tabular-nums', textAlign: 'right',
      }}>
        {fmtPctSigned(row.contribution)}
      </span>
      <div style={{
        position: 'relative', height: 8, borderRadius: 2,
        background: 'var(--muted)', overflow: 'hidden',
        // For negative-only column, anchor bars to the left; for positive-only, also left.
        // This is a single-direction bar, not a centred one (BBG style).
      }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: 0, width: `${widthPct}%`,
          background: barColor, opacity: 0.9,
        }} />
      </div>
    </div>
  );
};

export const ReturnDecomposition: React.FC<Props> = ({
  holdings,
  effectiveWeights,
  holdingCurves,
  sectorBySymbol,
  totalReturn,
  benchmarkTotalReturn,
  benchmarkId,
  periodLabel,
  loadingSectors,
}) => {
  const [activeSector, setActiveSector] = useState<string | null>(null);

  const resolvedHoldings = useMemo(
    () => withSectors(holdings, sectorBySymbol),
    [holdings, sectorBySymbol],
  );

  const allHoldingRows = useMemo(
    () => contributionByHolding(resolvedHoldings, effectiveWeights, holdingCurves),
    [resolvedHoldings, effectiveWeights, holdingCurves],
  );

  const sectorRows = useMemo(
    () => contributionBySector(resolvedHoldings, effectiveWeights, holdingCurves),
    [resolvedHoldings, effectiveWeights, holdingCurves],
  );

  // Filter contributors by active sector when one is selected.
  const holdingRows = useMemo(() => {
    if (!activeSector) return allHoldingRows;
    const sectorSymbols = new Set(
      resolvedHoldings
        .filter(h => (h.resolvedSector ?? h.sector) === activeSector)
        .map(h => h.symbol),
    );
    return allHoldingRows.filter(r => sectorSymbols.has(r.symbol));
  }, [allHoldingRows, activeSector, resolvedHoldings]);

  const positives = useMemo(
    () => holdingRows.filter(r => r.contribution > 0).slice(0, 8),
    [holdingRows],
  );
  const negatives = useMemo(
    () => [...holdingRows].filter(r => r.contribution < 0).sort((a, b) => a.contribution - b.contribution).slice(0, 6),
    [holdingRows],
  );

  const maxAbs = useMemo(
    () => Math.max(
      0.0001,
      ...holdingRows.map(r => Math.abs(r.contribution)),
    ),
    [holdingRows],
  );

  const donutSlices: SectorSlice[] = useMemo(
    () => sectorRows
      .filter(r => r.label && r.label !== '—' && r.label !== 'Unclassified' && r.weight > 0)
      .map(r => ({ label: r.label, weight: r.weight, contribution: r.contribution })),
    [sectorRows],
  );

  const unclassifiedWeight = useMemo(() => {
    const u = sectorRows.find(r => r.label === '—' || r.label === 'Unclassified');
    return u?.weight ?? 0;
  }, [sectorRows]);

  const activeReturn = benchmarkTotalReturn != null ? totalReturn - benchmarkTotalReturn : null;

  return (
    <section aria-label="Return decomposition" style={{ padding: '0 32px', marginTop: 48 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        {/* Header strip */}
        <header style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: 16, marginBottom: 18, flexWrap: 'wrap',
        }}>
          <div>
            <p style={{
              margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
            }}>
              Drivers · {periodLabel}
            </p>
            <h2 style={{
              margin: '4px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
              color: 'var(--foreground)',
            }}>
              What drove the period.
            </h2>
          </div>
          <div style={{
            display: 'flex', gap: 18, alignItems: 'baseline',
            fontVariantNumeric: 'tabular-nums',
          }}>
            <span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
                Total
              </span>
              <span style={{
                marginLeft: 8, fontSize: 16, fontWeight: 700,
                color: totalReturn >= 0 ? 'var(--chart-2)' : 'var(--destructive)',
              }}>
                {fmtPctSigned(totalReturn)}
              </span>
            </span>
            {activeReturn != null && (
              <span>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
                  Active vs {benchmarkId ?? 'Bmk'}
                </span>
                <span style={{
                  marginLeft: 8, fontSize: 16, fontWeight: 700,
                  color: activeReturn >= 0 ? 'var(--chart-2)' : 'var(--destructive)',
                }}>
                  {fmtPctSigned(activeReturn)}
                </span>
              </span>
            )}
          </div>
        </header>

        <SectionNarrative
          lines={narrateReturnDecomposition({
            totalReturn,
            benchmarkTotalReturn,
            benchmarkId,
            holdingRows: allHoldingRows,
            sectorRows,
          })}
        />

        {activeSector && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
            fontSize: 11, color: 'var(--muted-foreground)',
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 9px', borderRadius: 5,
              background: 'color-mix(in oklab, var(--primary) 12%, transparent)',
              color: 'var(--foreground)', fontWeight: 600,
            }}>
              Filtered: {activeSector}
              <button
                onClick={() => setActiveSector(null)}
                aria-label="Clear filter"
                style={{
                  border: 'none', background: 'transparent',
                  color: 'var(--foreground)', cursor: 'pointer',
                  padding: 0, fontSize: 13, lineHeight: 1,
                }}
              >×</button>
            </span>
            <span>Click a sector legend row to filter; click again to clear.</span>
          </div>
        )}

        {/* Body: donut + tables */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr',
          gap: 18, alignItems: 'flex-start',
          padding: '14px 16px', borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--card)',
        }}>
          {/* Sector donut + legend */}
          <div>
            <p style={{
              margin: '0 0 10px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
            }}>
              Sector Allocation
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <SectorDonut slices={donutSlices} size={170} />
            </div>
            {donutSlices.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {donutSlices.slice(0, 8).map((s, i) => {
                  const isActive = activeSector === s.label;
                  return (
                    <button
                      key={s.label}
                      onClick={() => setActiveSector(prev => prev === s.label ? null : s.label)}
                      style={{
                        display: 'grid', gridTemplateColumns: '10px 1fr 44px', gap: 6,
                        alignItems: 'center', fontSize: 10,
                        border: '1px solid transparent',
                        padding: '3px 4px',
                        borderRadius: 5,
                        background: isActive ? 'color-mix(in oklab, var(--primary) 10%, transparent)' : 'transparent',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <span style={{
                        width: 9, height: 9, borderRadius: 2,
                        background: SECTOR_PALETTE[i % SECTOR_PALETTE.length],
                      }} />
                      <span style={{
                        color: isActive ? 'var(--foreground)' : 'var(--foreground)',
                        fontWeight: isActive ? 700 : 500,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }} title={s.label}>
                        {s.label}
                      </span>
                      <span style={{
                        color: 'var(--muted-foreground)', textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                      }}>
                        {fmtPct(s.weight)}
                      </span>
                    </button>
                  );
                })}
                {unclassifiedWeight > 0 && (
                  <p style={{
                    margin: '8px 0 0', fontSize: 9, color: 'var(--muted-foreground)',
                    fontStyle: 'italic', lineHeight: 1.5,
                  }}>
                    {fmtPct(unclassifiedWeight)} of weight is unclassified.{' '}
                    {loadingSectors ? 'Auto-classifying…' : ''}
                  </p>
                )}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 10, color: 'var(--muted-foreground)', textAlign: 'center' }}>
                {loadingSectors
                  ? 'Auto-classifying holdings…'
                  : 'Sector data unavailable for these symbols.'}
              </p>
            )}
          </div>

          {/* Top contributors + bottom detractors */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{
                display: 'grid', gridTemplateColumns: '4px 92px 56px 72px 1fr',
                gap: 10, padding: '0 0 6px',
                borderBottom: '1px solid var(--border)',
                fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--muted-foreground)',
              }}>
                <span />
                <span>Top Contributors</span>
                <span style={{ textAlign: 'right' }}>Weight</span>
                <span style={{ textAlign: 'right' }}>Contrib</span>
                <span>Magnitude</span>
              </div>
              {positives.length === 0 ? (
                <p style={{ padding: '14px 0', margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>
                  No positive contributors on the period.
                </p>
              ) : (
                positives.map(r => (
                  <ContribRow
                    key={r.key}
                    row={r}
                    maxAbs={maxAbs}
                    align="positive"
                    colorBars
                    rankColor="var(--chart-2)"
                  />
                ))
              )}
            </div>

            <div>
              <div style={{
                display: 'grid', gridTemplateColumns: '4px 92px 56px 72px 1fr',
                gap: 10, padding: '0 0 6px',
                borderBottom: '1px solid var(--border)',
                fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--muted-foreground)',
              }}>
                <span />
                <span>Bottom Detractors</span>
                <span style={{ textAlign: 'right' }}>Weight</span>
                <span style={{ textAlign: 'right' }}>Contrib</span>
                <span>Magnitude</span>
              </div>
              {negatives.length === 0 ? (
                <p style={{ padding: '14px 0', margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>
                  No negative contributors on the period.
                </p>
              ) : (
                negatives.map(r => (
                  <ContribRow
                    key={r.key}
                    row={r}
                    maxAbs={maxAbs}
                    align="negative"
                    colorBars
                    rankColor="var(--destructive)"
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
