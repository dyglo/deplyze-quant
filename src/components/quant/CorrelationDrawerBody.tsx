import React, { useMemo } from 'react';
import { useOHLCV } from '../../hooks/useMarket';
import { Sparkline } from './Sparkline';
import { FreshnessBadge } from './FreshnessBadge';
import { AssetIcon } from './AssetIcon';
import { alignClosesByTs, logReturns, pearson, rollingPearson, interpretCorrelation } from '../../lib/quant';

const WINDOW = 30; // bars per rolling window
const HISTORY = 200; // total bars requested

export const CorrelationDrawerBody: React.FC<{ a: string; b: string; reportedValue: number; window: number }> = ({
  a, b, reportedValue, window: reportedWindow,
}) => {
  const A = useOHLCV(a, '1day', HISTORY);
  const B = useOHLCV(b, '1day', HISTORY);

  const aligned = useMemo(() => {
    const bars = (A.data?.bars ?? []);
    const bars2 = (B.data?.bars ?? []);
    if (!bars.length || !bars2.length) return null;
    return alignClosesByTs(bars, bars2);
  }, [A.data, B.data]);

  const rolling = useMemo(() => {
    if (!aligned || aligned.a.length < WINDOW + 2) return null;
    const ra = logReturns(aligned.a);
    const rb = logReturns(aligned.b);
    const series = rollingPearson(ra, rb, WINDOW);
    const current = pearson(ra, rb);
    return { series, current };
  }, [aligned]);

  const totalLoading = A.loading || B.loading;
  const insufficient = aligned && aligned.a.length < WINDOW + 2;
  const interp = interpretCorrelation(rolling?.current ?? reportedValue);

  const lastA = aligned?.a[aligned.a.length - 1];
  const firstA = aligned?.a[Math.max(0, (aligned?.a.length ?? 0) - 60)];
  const lastB = aligned?.b[aligned.b.length - 1];
  const firstB = aligned?.b[Math.max(0, (aligned?.b.length ?? 0) - 60)];
  const moveA = firstA && lastA ? ((lastA / firstA) - 1) * 100 : null;
  const moveB = firstB && lastB ? ((lastB / firstB) - 1) * 100 : null;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Header */}
      <section style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <AssetIcon symbol={a} size={36} />
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--muted-foreground)' }}>↔</span>
        <AssetIcon symbol={b} size={36} />
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: rolling && rolling.current >= 0 ? '#4E6040' : 'var(--primary)' }}>
            {(rolling?.current ?? reportedValue).toFixed(2)}
          </div>
          <div className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
            current ρ
          </div>
        </div>
      </section>

      {/* Interpretation */}
      <section className="ds-surface" style={{ padding: 12, borderRadius: 10 }}>
        <p className="ds-body" style={{ margin: 0, lineHeight: 1.5 }}>{interp.phrase}</p>
        <p className="ds-caption" style={{ marginTop: 6, color: 'var(--muted-foreground)' }}>
          Reported snapshot: ρ = {reportedValue.toFixed(2)} over {reportedWindow}-bar window. Drawer recomputes
          over {WINDOW}-bar rolling windows on up to {HISTORY} bars.
        </p>
      </section>

      {/* Rolling correlation */}
      <section className="ds-surface" style={{ padding: 12, borderRadius: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Rolling {WINDOW}d correlation</span>
          <FreshnessBadge status={A.status} fetchedAt={A.fetchedAt} compact />
        </div>
        {totalLoading && !rolling ? (
          <div style={{ height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 11 }}>
            Computing…
          </div>
        ) : insufficient || !rolling ? (
          <div style={{ padding: '12px 0', color: 'var(--muted-foreground)', fontSize: 11 }}>
            Insufficient overlapping bars — both symbols need ≥ {WINDOW + 2} aligned daily closes. This usually
            means one of them (FX, crypto) doesn't expose enough daily history through the current provider.
          </div>
        ) : (
          <Sparkline values={rolling.series} width={460} height={70} strokeWidth={1.5} />
        )}
        {rolling && rolling.series.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>min {Math.min(...rolling.series).toFixed(2)}</span>
            <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>max {Math.max(...rolling.series).toFixed(2)}</span>
          </div>
        )}
      </section>

      {/* Recent moves comparison */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { sym: a, move: moveA, closes: aligned?.a },
          { sym: b, move: moveB, closes: aligned?.b },
        ].map((x) => (
          <div key={x.sym} className="ds-surface" style={{ padding: 12, borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AssetIcon symbol={x.sym} size={20} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>{x.sym}</span>
              <span
                style={{
                  marginLeft: 'auto', fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                  color: x.move == null ? 'var(--muted-foreground)' : x.move >= 0 ? '#4E6040' : 'var(--primary)',
                }}
              >
                {x.move != null ? `${x.move >= 0 ? '+' : ''}${x.move.toFixed(2)}% / 60d` : '—'}
              </span>
            </div>
            <div style={{ marginTop: 6 }}>
              {x.closes && x.closes.length > 1
                ? <Sparkline values={x.closes.slice(-60)} width={200} height={36} />
                : <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>no bars</span>}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};
