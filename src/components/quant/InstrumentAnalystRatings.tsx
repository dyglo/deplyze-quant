import React from 'react';
import { useAnalystRatings } from '../../hooks/useAnalystRatings';
import type { AnalystRatings } from '../../services/instrumentService';

// ─── Consensus derivation ─────────────────────────────────────────────────

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

const CONSENSUS_COLORS: Record<ConsensusLabel, { bg: string; fg: string }> = {
  'Strong Buy': { bg: 'rgba(78, 96, 64, 0.12)', fg: '#4E6040' },
  'Buy':        { bg: 'rgba(78, 96, 64, 0.08)', fg: '#5A7052' },
  'Hold':       { bg: 'var(--muted)',           fg: 'var(--muted-foreground)' },
  'Sell':       { bg: 'rgba(193, 95, 60, 0.08)', fg: 'var(--primary)' },
  'Strong Sell':{ bg: 'rgba(176, 58, 46, 0.12)', fg: '#B03A2E' },
};

// ─── Ratings distribution bar ─────────────────────────────────────────────

const RatingsBar: React.FC<{ rec: NonNullable<AnalystRatings['recommendations']> }> = ({ rec }) => {
  const total = rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell || 1;
  const segments = [
    { label: 'Strong Buy', count: rec.strongBuy, color: '#4E6040' },
    { label: 'Buy',        count: rec.buy,        color: '#5A7052' },
    { label: 'Hold',       count: rec.hold,       color: '#8A8F82' },
    { label: 'Sell',       count: rec.sell,       color: 'var(--primary)' },
    { label: 'Strong Sell',count: rec.strongSell, color: '#B03A2E' },
  ].filter((s) => s.count > 0);

  return (
    <div>
      {/* Stacked bar */}
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1, marginBottom: 10 }}>
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ flex: s.count / total * 100, background: s.color, minWidth: s.count > 0 ? 2 : 0 }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
        {[
          { label: 'Strong Buy', count: rec.strongBuy, color: '#4E6040' },
          { label: 'Buy',        count: rec.buy,       color: '#5A7052' },
          { label: 'Hold',       count: rec.hold,      color: '#8A8F82' },
          { label: 'Sell',       count: rec.sell,      color: 'var(--primary)' },
          { label: 'Strong Sell',count: rec.strongSell,color: '#B03A2E' },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.count}</div>
            <div style={{ fontSize: 9, color: 'var(--muted-foreground)', lineHeight: 1.2, marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Price target gauge ───────────────────────────────────────────────────

const PriceTargetGauge: React.FC<{
  pt: AnalystRatings['priceTargets'];
  currentPrice?: number;
}> = ({ pt, currentPrice }) => {
  if (!pt.avg || !pt.low || !pt.high) return null;

  const rangeSpan = pt.high - pt.low;
  const avgPct = rangeSpan > 0 ? ((pt.avg - pt.low) / rangeSpan) * 100 : 50;
  const curPct = currentPrice != null && rangeSpan > 0
    ? Math.min(100, Math.max(0, ((currentPrice - pt.low) / rangeSpan) * 100))
    : null;
  const upside = currentPrice != null ? ((pt.avg - currentPrice) / currentPrice) * 100 : null;

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 12 }}>
        Price Target ({pt.count} analysts)
      </div>

      {/* Avg PT + upside */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          ${pt.avg.toFixed(2)}
        </span>
        {upside != null && (
          <span style={{
            fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
            color: upside >= 0 ? 'var(--ds-gain)' : 'var(--ds-loss)',
          }}>
            {upside >= 0 ? '+' : ''}{upside.toFixed(1)}% potential
          </span>
        )}
      </div>

      {/* Range bar */}
      <div style={{ position: 'relative', height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 6 }}>
        {/* Fill from low to high (full bar, lighter) */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '100%', background: 'rgba(90,112,82,0.15)', borderRadius: 2 }} />
        {/* Avg marker */}
        <div style={{
          position: 'absolute', left: `${avgPct}%`, top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 10, height: 10, borderRadius: '50%',
          background: '#5A7052', border: '2px solid var(--background)',
        }} />
        {/* Current price marker */}
        {curPct != null && (
          <div style={{
            position: 'absolute', left: `${curPct}%`, top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--foreground)', border: '2px solid var(--background)',
            zIndex: 1,
          }} />
        )}
      </div>

      {/* Low / High labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--ds-loss)' }}>${pt.low.toFixed(2)}</div>
          <div style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>Low PT</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--ds-gain)' }}>${pt.high.toFixed(2)}</div>
          <div style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>High PT</div>
        </div>
      </div>

      {/* Recent targets */}
      {pt.recent.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 6 }}>Recent Targets</div>
          {pt.recent.map((r, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 11,
            }}>
              <div>
                <span style={{ fontWeight: 500 }}>{r.company || r.analyst}</span>
                <span style={{ color: 'var(--muted-foreground)', marginLeft: 6, fontSize: 10 }}>
                  {new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                </span>
              </div>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>${r.target.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────

export const InstrumentAnalystRatings: React.FC<{ symbol: string; currentPrice?: number }> = ({ symbol, currentPrice }) => {
  const ratings = useAnalystRatings(symbol);
  const data = ratings.data;
  const rec = data?.recommendations ?? null;
  const consensus = rec ? deriveConsensus(rec) : null;
  const consColors = consensus ? CONSENSUS_COLORS[consensus] : null;
  const totalAnalysts = rec ? rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell : 0;

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Analyst Ratings</h2>
      </div>

      {ratings.loading && !data ? (
        <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: 0 }}>Loading analyst data…</p>
      ) : !data || (!rec && !data.priceTargets.avg) ? (
        <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: 0 }}>No analyst coverage data available.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>

          {/* Left: consensus badge + ratings distribution */}
          <div>
            {consensus && consColors && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <div style={{
                  padding: '8px 18px', borderRadius: 8,
                  background: consColors.bg, color: consColors.fg,
                  fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
                  border: `1px solid ${consColors.fg}22`,
                }}>
                  {consensus}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                  {totalAnalysts} analyst{totalAnalysts !== 1 ? 's' : ''}
                  {rec?.date ? ` · ${new Date(rec.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''}
                </div>
              </div>
            )}
            {rec && <RatingsBar rec={rec} />}
          </div>

          {/* Right: price target */}
          <PriceTargetGauge pt={data.priceTargets} currentPrice={currentPrice} />
        </div>
      )}
    </section>
  );
};
