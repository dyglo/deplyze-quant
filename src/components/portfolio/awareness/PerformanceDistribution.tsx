/**
 * PerformanceDistribution — Bloomberg-PORT "Return Distribution Summary"
 * pattern. Rows are sectors (auto-classified when Firestore lacks metadata),
 * columns are: Avg Weight · Sector Return (weighted) · Contribution ·
 * Active vs Portfolio Avg · Vol.
 *
 * Sits between Position Activity and Correlation Profile, providing the
 * sector-level lens of attribution. Single source of truth for sector
 * data: `useSectorMetadata` + holdings + curves.
 */

import React, { useMemo } from 'react';
import type { Holding } from '../../../lib/portfolio/schemas';
import type { SectorClassification } from '../../../hooks/useSectorMetadata';
import {
  computePositionMetrics,
  type PositionMetrics,
} from '../../../lib/portfolio/holdingAnalytics';
import type { HoldingCurveInput } from '../../../lib/portfolio/clientStress';

interface Props {
  holdings: Holding[];
  effectiveWeights: Record<string, number>;
  holdingCurves: HoldingCurveInput[];
  sectorBySymbol: Record<string, SectorClassification>;
  benchLogReturns: number[];
  totalPortfolioReturn: number;
}

interface SectorRow {
  sector: string;
  weight: number;
  sectorReturn: number;
  contribution: number;
  members: number;
  vol: number;
  alphaVsPortfolio: number;
}

function fmtPctSigned(v: number): string {
  if (!isFinite(v)) return '—';
  const s = (v * 100).toFixed(2);
  return v > 0 ? `+${s}%` : `${s}%`;
}
function fmtPct(v: number): string {
  if (!isFinite(v)) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

const returnColor = (v: number) =>
  !isFinite(v) || v === 0 ? 'var(--foreground)' : v > 0 ? 'var(--chart-2)' : 'var(--destructive)';

function buildSectorRows(
  positions: PositionMetrics[],
  holdings: Holding[],
  sectorBySymbol: Record<string, SectorClassification>,
  totalPortfolioReturn: number,
): SectorRow[] {
  const sectorOf = (sym: string): string => {
    const h = holdings.find(x => x.symbol === sym);
    return (h?.sector || sectorBySymbol[sym]?.sector || 'Unclassified');
  };
  const buckets = new Map<string, PositionMetrics[]>();
  for (const p of positions) {
    const sector = sectorOf(p.symbol);
    const arr = buckets.get(sector) ?? [];
    arr.push(p);
    buckets.set(sector, arr);
  }
  const rows: SectorRow[] = [];
  for (const [sector, members] of buckets.entries()) {
    const weight = members.reduce((s, m) => s + m.weight, 0);
    if (weight <= 0) continue;
    const wReturn = members.reduce((s, m) => s + m.weight * m.retFull, 0) / weight;
    const wVol    = members.reduce((s, m) => s + m.weight * m.vol, 0) / weight;
    const contribution = members.reduce((s, m) => s + m.contribution, 0);
    rows.push({
      sector,
      weight,
      sectorReturn: wReturn,
      contribution,
      members: members.length,
      vol: wVol,
      alphaVsPortfolio: wReturn - totalPortfolioReturn,
    });
  }
  return rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

const Bar: React.FC<{ value: number; max: number; positive: boolean }> = ({ value, max, positive }) => {
  const widthPct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <div style={{
      position: 'relative', height: 6, borderRadius: 2,
      background: 'var(--muted)', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        width: `${widthPct}%`,
        background: positive ? 'var(--chart-2)' : 'var(--destructive)',
        opacity: 0.85,
      }} />
    </div>
  );
};

export const PerformanceDistribution: React.FC<Props> = ({
  holdings,
  effectiveWeights,
  holdingCurves,
  sectorBySymbol,
  benchLogReturns,
  totalPortfolioReturn,
}) => {
  const positions = useMemo(
    () => computePositionMetrics(holdings.map(h => h.symbol), effectiveWeights, holdingCurves, benchLogReturns),
    [holdings, effectiveWeights, holdingCurves, benchLogReturns],
  );

  const rows = useMemo(
    () => buildSectorRows(positions, holdings, sectorBySymbol, totalPortfolioReturn),
    [positions, holdings, sectorBySymbol, totalPortfolioReturn],
  );

  const maxContrib = Math.max(0.0001, ...rows.map(r => Math.abs(r.contribution)));

  return (
    <section aria-label="Performance distribution" style={{ padding: '0 32px', marginTop: 56 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ marginBottom: 14 }}>
          <p style={{
            margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            Performance Distribution
          </p>
          <h2 style={{
            margin: '4px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
            color: 'var(--foreground)',
          }}>
            How returns distributed by sector.
          </h2>
        </header>

        <div style={{
          borderRadius: 10, overflow: 'hidden',
          border: '1px solid var(--border)', background: 'var(--card)',
        }}>
          {rows.length === 0 ? (
            <p style={{ padding: '20px 16px', margin: 0, fontSize: 12, color: 'var(--muted-foreground)' }}>
              Sector attribution will appear once at least one holding has price history and a resolved sector.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--muted)' }}>
                    {(['Sector', 'Members', 'Avg Weight', 'Sector Rtn', 'Vol', 'α vs Port', 'Contribution', 'Magnitude'] as const).map((label, i) => (
                      <th key={label} style={{
                        padding: '7px 10px',
                        borderBottom: '1px solid var(--border)',
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: 'var(--muted-foreground)',
                        textAlign: i === 0 ? 'left' : 'right',
                        whiteSpace: 'nowrap',
                      }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.sector}>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>
                        {r.sector}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted-foreground)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {r.members}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--foreground)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtPct(r.weight)}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: returnColor(r.sectorReturn), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtPctSigned(r.sectorReturn)}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--chart-4)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtPct(r.vol)}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: returnColor(r.alphaVsPortfolio), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtPctSigned(r.alphaVsPortfolio)}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: returnColor(r.contribution), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtPctSigned(r.contribution)}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', minWidth: 120 }}>
                        <Bar value={r.contribution} max={maxContrib} positive={r.contribution >= 0} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p style={{
          margin: '10px 0 0', fontSize: 10, color: 'var(--muted-foreground)',
          lineHeight: 1.55, fontStyle: 'italic',
        }}>
          Sector return is weight-averaged over the loaded window. Alpha vs Portfolio is the
          sector return minus the portfolio total return. Contribution is the sum of member
          (weight × return).
        </p>
      </div>
    </section>
  );
};
