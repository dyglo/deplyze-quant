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
import { ChevronUp, ChevronDown, ChevronRight, ArrowUpDown, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Holding } from '../../../lib/portfolio/schemas';
import { computePositionMetrics, type PositionMetrics } from '../../../lib/portfolio/holdingAnalytics';
import type { HoldingCurveInput } from '../../../lib/portfolio/clientStress';
import { SectionNarrative } from './SectionNarrative';
import { narratePositionActivity } from '../../../lib/portfolio/sectionNarratives';

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

function describePosition(row: PositionMetrics, benchmarkId?: string): string {
  const parts: string[] = [];
  if (row.retFull >= 0.30) parts.push('a major outperformer on the period');
  else if (row.retFull >= 0.10) parts.push('a positive contributor');
  else if (row.retFull <= -0.20) parts.push('a meaningful detractor');
  else if (row.retFull < 0) parts.push('a mild detractor');
  else parts.push('roughly flat');

  if (row.vol > 0.40) parts.push('high realised volatility');
  else if (row.vol < 0.15 && row.vol > 0) parts.push('compressed volatility');

  if (row.beta >= 1.4) parts.push(`amplifies ${benchmarkId ?? 'benchmark'} moves`);
  else if (row.beta > 0 && row.beta < 0.6) parts.push(`partially decoupled from ${benchmarkId ?? 'benchmark'}`);

  if (row.mdd <= -0.30) parts.push(`carried a drawdown of ${(row.mdd * 100).toFixed(0)}%`);

  if (parts.length === 0) return '';
  return `${row.symbol} is ${parts.slice(0, 3).join('; ')}.`;
}

const MiniSpark: React.FC<{ values: number[]; height?: number }> = ({ values, height = 40 }) => {
  if (values.length < 2) return null;
  const width = 320;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padding = 4;
  const innerH = height - padding * 2;
  const last = values[values.length - 1];
  const first = values[0];
  const positive = last >= first;
  const d = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = padding + (1 - (v - min) / span) * innerH;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={positive ? 'var(--chart-2)' : 'var(--destructive)'} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
};

const PositionDetail: React.FC<{
  row: PositionMetrics;
  benchmarkId?: string;
  onOpenInstrument: () => void;
}> = ({ row, benchmarkId, onOpenInstrument }) => {
  const sentence = describePosition(row, benchmarkId);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
      gap: 18, alignItems: 'flex-start',
    }}>
      <div>
        <p style={{
          margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--primary)',
        }}>
          Deplyze observes
        </p>
        {sentence && (
          <p style={{
            margin: '6px 0 12px', fontSize: 12, lineHeight: 1.55,
            color: 'var(--foreground)', maxWidth: 540,
          }}>
            {sentence}
          </p>
        )}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <DetailKv label="Max DD" value={fmtPctSigned(row.mdd)} color="var(--destructive)" />
          <DetailKv label="Corr to Bmk" value={row.corrToBenchmark.toFixed(2)} />
          <DetailKv label="Ann. Vol" value={fmtPct(row.vol)} color="var(--chart-4)" />
          <DetailKv label={`β ${benchmarkId ?? 'Bmk'}`} value={row.beta.toFixed(2)} />
        </div>
        <button
          onClick={onOpenInstrument}
          style={{
            marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', fontSize: 10, fontWeight: 600,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--foreground)', borderRadius: 6, cursor: 'pointer',
          }}
        >
          Open {row.symbol} workspace <ExternalLink size={10} />
        </button>
      </div>
      <div style={{
        padding: '10px 12px', borderRadius: 8,
        border: '1px solid var(--border)', background: 'var(--card)',
      }}>
        <p style={{
          margin: '0 0 6px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--muted-foreground)',
        }}>
          1Y rebased path
        </p>
        <MiniSpark values={row.values} />
      </div>
    </div>
  );
};

const DetailKv: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div>
    <p style={{
      margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: 'var(--muted-foreground)',
    }}>
      {label}
    </p>
    <p style={{
      margin: '2px 0 0', fontSize: 13, fontWeight: 700,
      color: color ?? 'var(--foreground)', fontVariantNumeric: 'tabular-nums',
    }}>
      {value}
    </p>
  </div>
);

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
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const navigate = useNavigate();

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

        <SectionNarrative
          lines={narratePositionActivity({ positions: rows, benchmarkId })}
        />

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
                    <th style={{
                      padding: '7px 4px 7px 10px',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--muted)', width: 22,
                    }} />
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
                  {sorted.map(r => {
                    const isExpanded = expandedSymbol === r.symbol;
                    return (
                      <React.Fragment key={r.symbol}>
                        <tr
                          onClick={() => setExpandedSymbol(prev => prev === r.symbol ? null : r.symbol)}
                          role="button"
                          aria-expanded={isExpanded}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setExpandedSymbol(prev => prev === r.symbol ? null : r.symbol);
                            }
                          }}
                          style={{
                            cursor: 'pointer',
                            background: isExpanded
                              ? 'color-mix(in oklab, var(--primary) 6%, transparent)'
                              : undefined,
                            transition: 'background 120ms',
                          }}
                          onMouseEnter={(e) => {
                            if (!isExpanded) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--muted)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isExpanded) (e.currentTarget as HTMLTableRowElement).style.background = '';
                          }}
                        >
                          <td style={{
                            padding: '6px 4px 6px 10px',
                            borderBottom: '1px solid var(--border)',
                            color: isExpanded ? 'var(--primary)' : 'var(--muted-foreground)',
                            width: 22,
                          }}>
                            {isExpanded
                              ? <ChevronDown size={12} strokeWidth={2.5} />
                              : <ChevronRight size={12} strokeWidth={2} />}
                          </td>
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
                        {isExpanded && (
                          <tr style={{ background: 'color-mix(in oklab, var(--primary) 3%, transparent)' }}>
                            <td colSpan={10} style={{
                              padding: '14px 16px', borderBottom: '1px solid var(--border)',
                            }}>
                              <PositionDetail
                                row={r}
                                benchmarkId={benchmarkId}
                                onOpenInstrument={() => navigate(`/instruments/${r.symbol}`)}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--muted)' }}>
                    <td style={{ padding: '6px 4px 6px 10px', borderBottom: '1px solid var(--border)' }} />
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
