/**
 * AnalogsTab — historical analog matches for the active symbol.
 *
 * For each top match we surface the similarity score, the fingerprint
 * dimensions that placed it near the current state, and the observed
 * forward-return behavior in the bars *after* the match window (so users
 * can see "what tended to follow"). All numbers come from the engines —
 * no synthesised values.
 */

import React, { useMemo } from 'react';
import { History, Compass, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useOHLCV } from '../../../hooks/useMarket';
import {
  findHistoricalAnalogs,
  buildForwardReturnSamples,
  summariseForwardReturns,
  type AnalogMatch,
} from '../../../lib/quant';
import { ConfidenceBadge } from '../ConfidenceBadge';

const HORIZONS = [5, 20, 60] as const;

export const AnalogsTab: React.FC<{ symbol: string; historyBars?: number }> = ({ symbol, historyBars = 2520 }) => {
  const ohlcv = useOHLCV(symbol, '1day', historyBars);
  const bars = ohlcv.data?.bars ?? [];

  const { matches, perMatchForward } = useMemo(() => {
    if (bars.length < 200) return { matches: [] as AnalogMatch[], perMatchForward: new Map<number, Record<number, ReturnType<typeof summariseForwardReturns>>>() };
    const ms = findHistoricalAnalogs(bars, { window: 60, step: 21, topK: 5 });

    // For each match end, evaluate forward returns at standard horizons
    const map = new Map<number, Record<number, ReturnType<typeof summariseForwardReturns>>>();
    const endIndexByTs = new Map<number, number>();
    for (let i = 0; i < bars.length; i++) endIndexByTs.set(bars[i].ts, i);
    for (const m of ms) {
      const endIdx = endIndexByTs.get(m.windowEnd);
      if (endIdx == null) continue;
      const perH: Record<number, ReturnType<typeof summariseForwardReturns>> = {} as any;
      for (const h of HORIZONS) {
        perH[h] = summariseForwardReturns(buildForwardReturnSamples(bars, [endIdx], h), h);
      }
      map.set(endIdx, perH);
    }
    return { matches: ms, perMatchForward: map };
  }, [bars]);

  if (ohlcv.loading) return <SkeletonState label="Searching 10-year history for fingerprint matches…" />;
  if (bars.length < 200) return <EmptyState label={`Not enough history for ${symbol} — ${bars.length} bars available, need ≥ 200.`} />;
  if (!matches.length) return <EmptyState label="No sufficiently similar historical windows identified at the current threshold." />;

  // For aggregate "what tended to follow", we use the union of match end indices.
  const endIndexByTs = new Map<number, number>();
  for (let i = 0; i < bars.length; i++) endIndexByTs.set(bars[i].ts, i);
  const allIdx = matches
    .map(m => endIndexByTs.get(m.windowEnd))
    .filter((v): v is number => v != null);

  const aggregate = HORIZONS.map(h => summariseForwardReturns(buildForwardReturnSamples(bars, allIdx, h), h));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={iconWrap}>
          <History size={14} color="var(--primary)" />
        </span>
        <div>
          <h2 className="ds-heading" style={{ margin: 0 }}>Historical analogs · {symbol}</h2>
          <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            60-bar volatility / momentum / structure fingerprint matched across {bars.length} bars.
          </p>
        </div>
      </header>

      {/* Aggregate "what followed" */}
      <section style={cardStyle}>
        <h3 className="ds-heading" style={{ margin: 0, fontSize: 13 }}>What historically followed similar windows</h3>
        <p className="ds-caption" style={{ margin: '4px 0 12px', color: 'var(--muted-foreground)' }}>
          Forward-return distributions taken from the bars after each analog window — never lookahead-mixed with the trigger.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          {aggregate.map((d) => (
            <ForwardDistTile key={d.horizon} dist={d} />
          ))}
        </div>
      </section>

      {/* Per-match list */}
      <section style={cardStyle}>
        <h3 className="ds-heading" style={{ margin: 0, fontSize: 13, marginBottom: 8 }}>Top historical matches</h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {matches.map((m) => {
            const idx = endIndexByTs.get(m.windowEnd);
            const fwd = idx != null ? perMatchForward.get(idx) : undefined;
            return <MatchRow key={`${m.windowEnd}`} match={m} forward={fwd} />;
          })}
        </ul>
      </section>
    </div>
  );
};

// ─── Sub-components ─────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: 'var(--card)',
  border: '1px solid var(--border)',
};

const iconWrap: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
  border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const ForwardDistTile: React.FC<{ dist: ReturnType<typeof summariseForwardReturns> }> = ({ dist }) => {
  const positive = dist.mean >= 0;
  const Arrow = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <div style={{
      padding: 10,
      borderRadius: 10,
      background: 'var(--muted)',
      border: '1px solid var(--border)',
      display: 'grid', gap: 6,
    }}>
      <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>
        {dist.horizon}-bar forward
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Arrow size={14} color={positive ? '#4E6040' : 'var(--primary)'} />
        <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {(dist.mean * 100).toFixed(2)}%
        </span>
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>mean</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted-foreground)' }}>
        <span>n = {dist.n}</span>
        <span>win {(dist.winRate * 100).toFixed(0)}%</span>
        <span>worst MAE {(dist.worstMae * 100).toFixed(1)}%</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
        p25 / p75: <strong style={{ color: 'var(--foreground)' }}>{(dist.p25 * 100).toFixed(2)}% / {(dist.p75 * 100).toFixed(2)}%</strong>
      </div>
    </div>
  );
};

const MatchRow: React.FC<{ match: AnalogMatch; forward?: Record<number, ReturnType<typeof summariseForwardReturns>> }> = ({ match, forward }) => {
  const pct = Math.round(match.similarity * 100);
  const barColor = match.similarity > 0.8 ? '#4E6040' : match.similarity > 0.6 ? '#C7884A' : 'var(--muted-foreground)';
  return (
    <li style={{
      padding: '10px 12px',
      borderRadius: 10,
      border: '1px solid var(--border)',
      background: 'var(--muted)',
      display: 'grid', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Compass size={13} color="var(--primary)" />
        <strong style={{ fontSize: 13 }}>{match.label}</strong>
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
          window {new Date(match.windowStart).toISOString().slice(0, 10)} → {new Date(match.windowEnd).toISOString().slice(0, 10)}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 80, height: 4, background: 'var(--card)', borderRadius: 4, overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: barColor }} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: barColor }}>
            {pct}%
          </span>
          <ConfidenceBadge score={match.similarity} />
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 6, fontSize: 10 }}>
        <Cell label="real vol" value={`${(match.fingerprint.realisedVol * 100).toFixed(1)}%`} />
        <Cell label="mean ret" value={`${(match.fingerprint.meanReturn * 100).toFixed(3)}%`} />
        <Cell label="trend slope" value={match.fingerprint.trendSlope.toFixed(4)} />
        <Cell label="skew" value={match.fingerprint.skewness.toFixed(2)} />
        <Cell label="range comp" value={match.fingerprint.rangeCompression.toFixed(2)} />
        <Cell label="vol-of-vol" value={(match.fingerprint.volOfVol * Math.sqrt(252)).toFixed(2)} />
      </div>

      {forward && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
          {HORIZONS.map((h) => {
            const d = forward[h];
            if (!d || d.n === 0) return <Cell key={h} label={`+${h}b`} value="—" />;
            const positive = d.mean >= 0;
            return (
              <div key={h} style={{
                padding: '6px 8px',
                borderRadius: 6,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                display: 'grid', gap: 2,
              }}>
                <span className="ds-caption" style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>
                  After this match · +{h}b
                </span>
                <span style={{ fontWeight: 700, color: positive ? '#4E6040' : 'var(--primary)', fontSize: 12 }}>
                  {(d.mean * 100).toFixed(2)}%
                </span>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                  MAE {(d.worstMae * 100).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
};

const Cell: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'grid', gap: 1 }}>
    <span className="ds-caption" style={{ fontSize: 9, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
      {label}
    </span>
    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--foreground)' }}>
      {value}
    </span>
  </div>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ ...cardStyle, padding: 20 }}>
    <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>{label}</p>
  </div>
);

const SkeletonState: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ ...cardStyle, padding: 20 }}>
    <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>{label}</p>
  </div>
);
