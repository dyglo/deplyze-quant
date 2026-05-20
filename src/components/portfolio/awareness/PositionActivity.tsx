/**
 * PositionActivity — replaces CausalTimeline with a Bloomberg-style
 * per-holding multi-period activity table. Always populated from
 * `holdingCurves` so the section is informative regardless of agent /
 * reasoning backend state.
 *
 * Columns: Symbol · Weight · 5D · 1M · 3M · YTD · Vol · Beta · Contrib
 *
 * Visual idiom mirrors Bloomberg PORT "Top/Bottom Contributors" but at
 * the per-position level with multi-period return columns. Tabular-nums
 * throughout, hairline dividers, sortable by user click.
 */

import React, { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import type { Holding } from '../../../lib/portfolio/schemas';
import { computePositionMetrics, type PositionMetrics } from '../../../lib/portfolio/holdingAnalytics';
import type { HoldingCurveInput } from '../../../lib/portfolio/clientStress';

interface Props {
  holdings: Holding[];
  effectiveWeights: Record<string, number>;
  holdingCurves: HoldingCurveInput[];
  benchLogReturns: number[];
  benchmarkId?: string;
}

type SortKey = 'symbol' | 'weight' | 'ret5' | 'ret21' | 'ret63' | 'retFull' | 'vol' | 'beta' | 'contribution';
type SortDir = 'asc' | 'desc';

function fmtPctSigned(v: number): string {
  if (!isFinite(v)) return '—';
  const s = (v * 100).toFixed(2);
  return v > 0 ? `+${s}%` : `${s}%`;
}
function fmtPct(v: number): string {
  if (!isFinite(v)) return '—';
  return `${(v * 100).toFixed(2)}%`;
}
function fmtNum(v: number, dp = 2): string {
  if (!isFinite(v)) return '—';
  return v.toFixed(dp);
}

const returnColor = (v: number): string => {
  if (!isFinite(v) || v === 0) return 'var(--foreground)';
  return v > 0 ? 'var(--chart-2)' : 'var(--destructive)';
};

const HeaderCell: React.FC<{
  label: string;
  sortKey?: SortKey;
  align?: 'left' | 'right';
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}> = ({ label, sortKey, align = 'right', active, dir, onSort }) => {
  const isActive = sortKey && sortKey === active;
  return (
    <th
      onClick={sortKey ? () => onSort(sortKey) : undefined}
      style={{
        padding: '7px 10px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--muted)',
        textAlign: align,
        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
        cursor: sortKey ? 'pointer' : 'default',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
        {label}
        {sortKey && (
          isActive
            ? (dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)
            : <ArrowUpDown size={9} style={{ opacity: 0.4 }} />
        )}
      </span>
    </th>
  );
};

const BodyCell: React.FC<React.PropsWithChildren<{ align?: 'left' | 'right'; color?: string; weight?: number; bold?: boolean }>> = ({ children, align = 'right', color, weight, bold }) => (
  <td style={{
    padding: '6px 10px',
    borderBottom: '1px solid var(--border)',
    textAlign: align,
    fontSize: 11,
    fontVariantNumeric: 'tabular-nums',
    color: color ?? 'var(--foreground)',
    fontWeight: bold ? 700 : weight ?? 500,
    whiteSpace: 'nowrap',
  }}>
    {children}
  </td>
);

export const PositionActivity: React.FC<Props> = ({
  holdings,
  effectiveWeights,
  holdingCurves,
  benchLogReturns,
  benchmarkId,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('contribution');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rows = useMemo(() => {
    const symbols = holdings.map(h => h.symbol);
    const metrics = computePositionMetrics(symbols, effectiveWeights, holdingCurves, benchLogReturns);
    return metrics;
  }, [holdings, effectiveWeights, holdingCurves, benchLogReturns]);

  const sorted = useMemo(() => {
    const factor = sortDir === 'asc' ? 1 : -1;
    const get = (r: PositionMetrics): number | string => {
      switch (sortKey) {
        case 'symbol': return r.symbol;
        case 'weight': return r.weight;
        case 'ret5': return r.ret5;
        case 'ret21': return r.ret21;
        case 'ret63': return r.ret63;
        case 'retFull': return r.retFull;
        case 'vol': return r.vol;
        case 'beta': return r.beta;
        case 'contribution': return r.contribution;
      }
    };
    return [...rows].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (typeof av === 'string' && typeof bv === 'string') return factor * av.localeCompare(bv);
      return factor * ((av as number) - (bv as number));
    });
  }, [rows, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  // Aggregate footer
  const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
  const totalContrib = rows.reduce((s, r) => s + r.contribution, 0);
  const weighted = (acc: number, r: PositionMetrics, getV: (r: PositionMetrics) => number) =>
    acc + r.weight * getV(r);
  const wAvgVol  = rows.reduce((a, r) => weighted(a, r, x => x.vol), 0)  / (totalWeight || 1);
  const wAvgBeta = rows.reduce((a, r) => weighted(a, r, x => x.beta), 0) / (totalWeight || 1);

  return (
    <section aria-label="Position activity" style={{ padding: '0 32px', marginTop: 56 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ marginBottom: 14 }}>
          <p style={{
            margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            Position Activity
          </p>
          <h2 style={{
            margin: '4px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
            color: 'var(--foreground)',
          }}>
            How each position moved.
          </h2>
        </header>

        <div style={{
          borderRadius: 10, overflow: 'hidden',
          border: '1px solid var(--border)', background: 'var(--card)',
        }}>
          {rows.length === 0 ? (
            <p style={{ padding: '20px 16px', margin: 0, fontSize: 12, color: 'var(--muted-foreground)' }}>
              No price history loaded for these holdings yet.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <HeaderCell label="Symbol" sortKey="symbol" align="left" active={sortKey} dir={sortDir} onSort={onSort} />
                    <HeaderCell label="Weight" sortKey="weight" active={sortKey} dir={sortDir} onSort={onSort} />
                    <HeaderCell label="5D" sortKey="ret5" active={sortKey} dir={sortDir} onSort={onSort} />
                    <HeaderCell label="1M" sortKey="ret21" active={sortKey} dir={sortDir} onSort={onSort} />
                    <HeaderCell label="3M" sortKey="ret63" active={sortKey} dir={sortDir} onSort={onSort} />
                    <HeaderCell label="1Y" sortKey="retFull" active={sortKey} dir={sortDir} onSort={onSort} />
                    <HeaderCell label="Vol" sortKey="vol" active={sortKey} dir={sortDir} onSort={onSort} />
                    <HeaderCell label={`β ${benchmarkId ?? 'Bmk'}`} sortKey="beta" active={sortKey} dir={sortDir} onSort={onSort} />
                    <HeaderCell label="Contrib" sortKey="contribution" active={sortKey} dir={sortDir} onSort={onSort} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(r => (
                    <tr key={r.symbol}>
                      <BodyCell align="left" bold>{r.symbol}</BodyCell>
                      <BodyCell color="var(--muted-foreground)">{fmtPct(r.weight)}</BodyCell>
                      <BodyCell color={returnColor(r.ret5)} weight={600}>{fmtPctSigned(r.ret5)}</BodyCell>
                      <BodyCell color={returnColor(r.ret21)} weight={600}>{fmtPctSigned(r.ret21)}</BodyCell>
                      <BodyCell color={returnColor(r.ret63)} weight={600}>{fmtPctSigned(r.ret63)}</BodyCell>
                      <BodyCell color={returnColor(r.retFull)} bold>{fmtPctSigned(r.retFull)}</BodyCell>
                      <BodyCell color="var(--chart-4)">{fmtPct(r.vol)}</BodyCell>
                      <BodyCell>{fmtNum(r.beta)}</BodyCell>
                      <BodyCell color={returnColor(r.contribution)} bold>{fmtPctSigned(r.contribution)}</BodyCell>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--muted)' }}>
                    <BodyCell align="left" bold>Portfolio</BodyCell>
                    <BodyCell bold>{fmtPct(totalWeight)}</BodyCell>
                    <BodyCell color="var(--muted-foreground)">—</BodyCell>
                    <BodyCell color="var(--muted-foreground)">—</BodyCell>
                    <BodyCell color="var(--muted-foreground)">—</BodyCell>
                    <BodyCell color="var(--muted-foreground)">—</BodyCell>
                    <BodyCell bold color="var(--chart-4)">{fmtPct(wAvgVol)}</BodyCell>
                    <BodyCell bold>{fmtNum(wAvgBeta)}</BodyCell>
                    <BodyCell color={returnColor(totalContrib)} bold>{fmtPctSigned(totalContrib)}</BodyCell>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <p style={{
          margin: '10px 0 0', fontSize: 10, color: 'var(--muted-foreground)',
          lineHeight: 1.55, fontStyle: 'italic',
        }}>
          Returns are simple period returns. Vol is annualised realised vol over the loaded
          window. β is OLS of holding log-returns onto the benchmark log-returns. Contribution
          is weight × 1Y return.
        </p>
      </div>
    </section>
  );
};
