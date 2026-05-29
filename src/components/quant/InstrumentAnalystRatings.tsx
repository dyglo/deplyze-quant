import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Lock, ExternalLink } from 'lucide-react';
import { useAnalystRatings } from '../../hooks/useAnalystRatings';
import type { AnalystRatings } from '../../services/instrumentService';

type ConsensusLabel = 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';

function deriveConsensus(rec: NonNullable<AnalystRatings['recommendations']>): ConsensusLabel {
  const total = rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell;
  if (!total) return 'Hold';
  const score =
    (rec.strongBuy * 5 + rec.buy * 4 + rec.hold * 3 + rec.sell * 2 + rec.strongSell * 1) / total;
  if (score >= 4.5) return 'Strong Buy';
  if (score >= 3.5) return 'Buy';
  if (score >= 2.5) return 'Hold';
  if (score >= 1.5) return 'Sell';
  return 'Strong Sell';
}

const CONSENSUS_COLOR: Record<ConsensusLabel, { bg: string; fg: string }> = {
  'Strong Buy':  { bg: 'rgba(90,112,82,0.14)',  fg: 'var(--ds-gain)' },
  'Buy':         { bg: 'rgba(120,140,93,0.14)', fg: 'var(--chart-2)' },
  'Hold':        { bg: 'rgba(234,179,8,0.14)',  fg: '#ca8a04' },
  'Sell':        { bg: 'rgba(184,92,42,0.14)', fg: '#B85C2A' },
  'Strong Sell': { bg: 'rgba(176,58,46,0.14)',  fg: 'var(--ds-loss)' },
};

const POSITION_COLOR: Record<string, string> = {
  buy: 'var(--ds-gain)', 'strong buy': 'var(--ds-gain)', outperform: 'var(--ds-gain)', overweight: 'var(--ds-gain)',
  hold: '#ca8a04', neutral: '#ca8a04', 'market perform': '#ca8a04', 'equal-weight': '#ca8a04',
  sell: 'var(--ds-loss)', 'strong sell': 'var(--ds-loss)', underperform: 'var(--ds-loss)', underweight: 'var(--ds-loss)',
};

function posColor(pos: string): string {
  return POSITION_COLOR[pos.toLowerCase()] ?? 'var(--muted-foreground)';
}

// ─── SVG Donut ────────────────────────────────────────────────────────────────

interface DonutProps {
  buy: number;
  hold: number;
  sell: number;
  total: number;
}

const DonutChart: React.FC<DonutProps> = ({ buy, hold, sell, total }) => {
  const size = 120;
  const cx = 60, cy = 60, R = 46, sw = 14;

  function arc(startPct: number, endPct: number, color: string) {
    if (startPct === endPct) return null;
    const toRad = (pct: number) => (pct * 2 * Math.PI) - Math.PI / 2;
    const x1 = cx + R * Math.cos(toRad(startPct));
    const y1 = cy + R * Math.sin(toRad(startPct));
    const x2 = cx + R * Math.cos(toRad(endPct));
    const y2 = cy + R * Math.sin(toRad(endPct));
    const large = (endPct - startPct) > 0.5 ? 1 : 0;
    return <path d={`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`}
      stroke={color} strokeWidth={sw} fill="none" strokeLinecap="butt" />;
  }

  const t = total || 1;
  const buyEnd   = buy / t;
  const holdEnd  = buyEnd + hold / t;
  // sell goes rest

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" strokeWidth={sw} />
      {arc(0, buyEnd, 'var(--ds-gain)')}
      {arc(buyEnd, holdEnd, '#ca8a04')}
      {arc(holdEnd, 1, 'var(--ds-loss)')}
      <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--foreground)"
        fontSize={18} fontWeight={700} fontFamily="inherit">{total}</text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="var(--muted-foreground)"
        fontSize={9} fontFamily="inherit">Analysts</text>
    </svg>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────

export const InstrumentAnalystRatings: React.FC<{ symbol: string; currentPrice?: number }> = ({ symbol, currentPrice }) => {
  const ratings = useAnalystRatings(symbol);
  const data    = ratings.data;
  const rec     = data?.recommendations ?? null;
  const pt      = data?.priceTargets;

  const consensus = useMemo(() => rec ? deriveConsensus(rec) : null, [rec]);
  const totalAnalysts = rec
    ? rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell
    : 0;
  const buyCount  = rec ? rec.strongBuy + rec.buy  : 0;
  const holdCount = rec ? rec.hold                 : 0;
  const sellCount = rec ? rec.sell + rec.strongSell : 0;

  const upside = pt?.avg != null && currentPrice
    ? ((pt.avg - currentPrice) / currentPrice) * 100
    : null;

  if (!ratings.loading && (!data || (!rec && !pt?.avg))) return null;

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>Analyst Ratings</h2>
        <Link to={`/copilot?symbol=${symbol}`} style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
          See full analyst report
        </Link>
      </div>

      {ratings.loading && !data ? null : (
        <>
          {/* Top row: donut + consensus + price target */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '0 40px', alignItems: 'start', marginBottom: 28 }}>

            {/* Donut + buy/hold/sell counts */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <DonutChart buy={buyCount} hold={holdCount} sell={sellCount} total={totalAnalysts} />
              <div style={{ display: 'flex', gap: 16 }}>
                {[
                  { label: 'Buy', count: buyCount, color: 'var(--ds-gain)' },
                  { label: 'Hold', count: holdCount, color: '#ca8a04' },
                  { label: 'Sell', count: sellCount, color: 'var(--ds-loss)' },
                ].map(({ label, count, color }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{count}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Consensus */}
            <div style={{ paddingTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 12 }}>
                Overall Consensus
              </div>
              {consensus && (
                <div style={{
                  display: 'inline-block', padding: '8px 22px',
                  borderRadius: 8, fontSize: 17, fontWeight: 800,
                  background: CONSENSUS_COLOR[consensus].bg,
                  color: CONSENSUS_COLOR[consensus].fg,
                  border: `1px solid ${CONSENSUS_COLOR[consensus].fg}30`,
                  letterSpacing: 0.3, marginBottom: 14,
                }}>
                  {consensus}
                </div>
              )}
              <div style={{ fontSize: 11.5, color: 'var(--muted-foreground)' }}>
                Based on {totalAnalysts} analyst{totalAnalysts !== 1 ? 's' : ''}
                {rec?.date ? ` · Updated ${new Date(rec.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''}
              </div>
            </div>

            {/* 12-Month Price Target */}
            {pt?.avg != null && (
              <div style={{ paddingTop: 8, borderLeft: '1px solid var(--border)', paddingLeft: 32 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 12 }}>
                  Analysts 12-Month Price Target
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>
                    ${pt.avg.toFixed(2)}
                  </span>
                  {upside != null && (
                    <span style={{
                      fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      color: upside >= 0 ? 'var(--ds-gain)' : 'var(--ds-loss)',
                    }}>
                      {upside >= 0 ? '+' : ''}{upside.toFixed(2)}% {upside >= 0 ? 'Upside' : 'Downside'}
                    </span>
                  )}
                </div>
                {pt.low != null && pt.high != null && (() => {
                  const span = pt.high! - pt.low!;
                  const avgPct = span > 0 ? ((pt.avg! - pt.low!) / span) * 100 : 50;
                  const curPct = currentPrice != null && span > 0
                    ? Math.min(100, Math.max(0, ((currentPrice - pt.low!) / span) * 100)) : null;
                  return (
                    <>
                      <div style={{ position: 'relative', height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 6 }}>
                        <div style={{ position: 'absolute', left: `${avgPct}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)', border: '2px solid var(--background)' }} />
                        {curPct != null && (
                          <div style={{ position: 'absolute', left: `${curPct}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 8, height: 8, borderRadius: '50%', background: 'var(--foreground)', border: '2px solid var(--background)', zIndex: 1 }} />
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10, color: 'var(--ds-loss)', fontVariantNumeric: 'tabular-nums' }}>${pt.low!.toFixed(2)} Low</span>
                        <span style={{ fontSize: 10, color: 'var(--ds-gain)', fontVariantNumeric: 'tabular-nums' }}>High ${pt.high!.toFixed(2)}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Recent ratings table */}
          {pt?.recent && pt.recent.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 10 }}>
                Recent Analyst Ratings
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Firm', '', 'Position', 'Price Target', 'Upside / Downside', 'From Price Target', 'Action', 'Date'].map((h, i) => (
                        <th key={i} style={{
                          padding: '6px 8px', textAlign: i === 0 ? 'left' : 'right',
                          fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
                          textTransform: 'uppercase', color: 'var(--muted-foreground)',
                          whiteSpace: 'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pt.recent.map((r, i) => {
                      const tgtUpside = currentPrice && r.target
                        ? ((r.target - currentPrice) / currentPrice) * 100 : null;
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td style={{ padding: '8px 8px', fontWeight: 600, color: 'var(--foreground)' }}>
                            {r.company || r.analyst || '—'}
                          </td>
                          <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                            <ExternalLink size={11} style={{ color: 'var(--muted-foreground)', cursor: 'pointer' }} />
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                            {r.rating ? (
                              <span style={{
                                fontSize: 11, fontWeight: 700, color: posColor(r.rating),
                                background: `${posColor(r.rating)}1a`, padding: '2px 8px', borderRadius: 4,
                              }}>{r.rating}</span>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                            {r.target ? `$${r.target.toFixed(2)}` : '—'}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: tgtUpside != null ? (tgtUpside >= 0 ? 'var(--ds-gain)' : 'var(--ds-loss)') : 'var(--foreground)' }}>
                            {tgtUpside != null ? `${tgtUpside >= 0 ? '+' : ''}${tgtUpside.toFixed(1)}%` : '—'}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, color: 'var(--primary)', fontSize: 11, cursor: 'pointer' }}>
                              <Lock size={9} /> Unlock
                            </div>
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>
                            {r.action ?? '—'}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                            {new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};
