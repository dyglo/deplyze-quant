/**
 * ReversionTab — probabilistic decomposition of the current structure into
 * mean-reversion vs momentum-continuation, with the evidence that drove it.
 *
 * The page-level engine returns a `ReversionProfile`; the tab renders it as a
 * three-band probability stack, supporting signal panel, and a short
 * historical look at the +10/+20-bar realised returns from the most recent
 * comparable structural states.
 */

import React, { useMemo } from 'react';
import { RefreshCcw, ArrowDownRight, ArrowUpRight, Minus, Sparkles } from 'lucide-react';
import { useOHLCV } from '../../../hooks/useMarket';
import {
  reversionProfile,
  type ReversionProfile,
  buildForwardReturnSamples,
  summariseForwardReturns,
} from '../../../lib/quant';
import { ConfidenceBadge } from '../ConfidenceBadge';

export const ReversionTab: React.FC<{ symbol: string; historyBars?: number }> = ({ symbol, historyBars = 2520 }) => {
  const ohlcv = useOHLCV(symbol, '1day', historyBars);
  const bars = ohlcv.data?.bars ?? [];

  const profile = useMemo<ReversionProfile | null>(
    () => (bars.length >= 250 ? reversionProfile(bars, { symbol }) : null),
    [bars, symbol],
  );

  // "Comparable historical states" — bars where |trendDeviationZ| sat within
  // ±0.25 of the current value. We surface a short forward-return summary
  // at +10 and +20 bars over those comparable indices.
  const comparable = useMemo(() => {
    if (!profile || bars.length < 300) return null;
    const tol = 0.25;
    const target = profile.trendDeviationZ;
    // Recompute trendDeviationZ over history via the engine's logic: we
    // can replicate cheaply by using rolling sma + z.
    // For brevity, we use the engine's persistence/stability values
    // as a coarse comparator instead — find indices whose 60-bar
    // momentumPersistence proxy was near current.
    // Lighter approach: take every 21st bar after burn-in, classify, compare.
    const out: number[] = [];
    for (let i = 280; i < bars.length - 21; i += 21) {
      const slice = bars.slice(0, i);
      const p = reversionProfile(slice, { symbol });
      if (!p) continue;
      if (Math.abs(p.trendDeviationZ - target) <= tol) out.push(i - 1);
    }
    if (!out.length) return { indices: [], h10: null as null | ReturnType<typeof summariseForwardReturns>, h20: null as null | ReturnType<typeof summariseForwardReturns> };
    const h10 = summariseForwardReturns(buildForwardReturnSamples(bars, out, 10), 10);
    const h20 = summariseForwardReturns(buildForwardReturnSamples(bars, out, 20), 20);
    return { indices: out, h10, h20 };
  }, [bars, profile, symbol]);

  if (ohlcv.loading) return <Card label="Loading multi-year history…" />;
  if (!profile) return <Card label={`Need ≥ 250 bars for reversion/momentum decomposition. ${symbol} has ${bars.length}.`} />;

  const dominant =
    profile.reversionProb >= profile.continuationProb && profile.reversionProb >= profile.ambiguityProb
      ? 'mean-reversion'
      : profile.continuationProb >= profile.ambiguityProb
        ? 'momentum continuation'
        : 'indeterminate';

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={iconWrap}><RefreshCcw size={14} color="var(--primary)" /></span>
        <div>
          <h2 className="ds-heading" style={{ margin: 0 }}>Mean reversion & momentum · {symbol}</h2>
          <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            Probabilistic decomposition of the current structural state. Never a buy/sell call.
          </p>
        </div>
      </header>

      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
          <h3 className="ds-heading" style={{ margin: 0, fontSize: 13 }}>Structural balance</h3>
          <ConfidenceBadge score={profile.confidence} />
        </div>

        <ProbabilityStack
          reversion={profile.reversionProb}
          continuation={profile.continuationProb}
          ambiguity={profile.ambiguityProb}
        />

        <p className="ds-body" style={{ margin: '12px 0 0' }}>
          Historical structure favours <strong>{dominant}</strong>.
        </p>
        <p className="ds-caption" style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>
          {profile.narrative}
        </p>
      </section>

      <section style={cardStyle}>
        <h3 className="ds-heading" style={{ margin: 0, fontSize: 13, marginBottom: 10 }}>Supporting signals</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
          <SignalTile
            label="5-bar return z"
            value={profile.shortTermZ.toFixed(2)}
            hint={profile.shortTermZ > 1 ? 'Recently elevated' : profile.shortTermZ < -1 ? 'Recently depressed' : 'Near baseline'}
            direction={profile.shortTermZ > 1 ? 'up' : profile.shortTermZ < -1 ? 'down' : 'flat'}
          />
          <SignalTile
            label="Trend dev z"
            value={profile.trendDeviationZ.toFixed(2)}
            hint={Math.abs(profile.trendDeviationZ) >= 2 ? 'Statistically stretched' : Math.abs(profile.trendDeviationZ) >= 1 ? 'Mildly stretched' : 'Within band'}
            direction={profile.trendDeviationZ > 1 ? 'up' : profile.trendDeviationZ < -1 ? 'down' : 'flat'}
          />
          <SignalTile
            label="Vol-adj distance"
            value={profile.volAdjDistance.toFixed(2)}
            hint="vs 20-bar mean"
            direction={profile.volAdjDistance > 1 ? 'up' : profile.volAdjDistance < -1 ? 'down' : 'flat'}
          />
          <SignalTile
            label="Persistence"
            value={`${(profile.persistence * 100).toFixed(0)}%`}
            hint={profile.persistence > 0.7 ? 'High momentum persistence' : profile.persistence < 0.4 ? 'Weak persistence' : 'Moderate persistence'}
            direction="flat"
          />
          <SignalTile
            label="Stability"
            value={`${(profile.stability * 100).toFixed(0)}%`}
            hint={profile.stability > 0.7 ? 'Trend stable' : profile.stability < 0.4 ? 'Unstable' : 'Moderately stable'}
            direction="flat"
          />
          <SignalTile
            label="AC₁ returns"
            value={profile.ac1.toFixed(2)}
            hint={profile.ac1 > 0.1 ? 'Momentum bias' : profile.ac1 < -0.1 ? 'Reversion bias' : 'Near zero'}
            direction={profile.ac1 > 0.1 ? 'up' : profile.ac1 < -0.1 ? 'down' : 'flat'}
          />
        </div>
      </section>

      {comparable && (
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
            <h3 className="ds-heading" style={{ margin: 0, fontSize: 13 }}>What followed comparable structural states</h3>
            <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
              {comparable.indices.length} comparable bar
              {comparable.indices.length === 1 ? '' : 's'} · trend deviation z within ±0.25
            </span>
          </div>
          {!comparable.h10 || !comparable.h20 || comparable.h10.n === 0 ? (
            <p className="ds-caption" style={{ margin: '8px 0 0', color: 'var(--muted-foreground)' }}>
              No comparable historical structural states matched at the current tolerance.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <SmallDist label="+10-bar forward" mean={comparable.h10.mean} winRate={comparable.h10.winRate} worstMae={comparable.h10.worstMae} n={comparable.h10.n} />
              <SmallDist label="+20-bar forward" mean={comparable.h20.mean} winRate={comparable.h20.winRate} worstMae={comparable.h20.worstMae} n={comparable.h20.n} />
            </div>
          )}
          <p className="ds-caption" style={{ margin: '10px 0 0', color: 'var(--muted-foreground)' }}>
            <Sparkles size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
            Probabilistic context only. Past distributions do not guarantee future returns.
          </p>
        </section>
      )}
    </div>
  );
};

// ─── Sub-components ─────────────────────────────────────────────────────────

const ProbabilityStack: React.FC<{ reversion: number; continuation: number; ambiguity: number }> = ({ reversion, continuation, ambiguity }) => (
  <div style={{ marginTop: 8 }}>
    <div style={{
      display: 'flex',
      height: 16,
      borderRadius: 8,
      overflow: 'hidden',
      border: '1px solid var(--border)',
      background: 'var(--muted)',
    }}>
      <span style={{ flex: reversion, background: 'color-mix(in srgb, var(--primary) 45%, transparent)' }} title={`Reversion ${(reversion * 100).toFixed(0)}%`} />
      <span style={{ flex: continuation, background: 'color-mix(in srgb, #4E6040 60%, transparent)' }} title={`Continuation ${(continuation * 100).toFixed(0)}%`} />
      <span style={{ flex: ambiguity, background: 'color-mix(in srgb, var(--muted-foreground) 30%, transparent)' }} title={`Ambiguity ${(ambiguity * 100).toFixed(0)}%`} />
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}>
      <span><strong style={{ color: 'var(--primary)' }}>Reversion</strong> {(reversion * 100).toFixed(0)}%</span>
      <span><strong style={{ color: '#4E6040' }}>Continuation</strong> {(continuation * 100).toFixed(0)}%</span>
      <span style={{ color: 'var(--muted-foreground)' }}><strong>Ambiguity</strong> {(ambiguity * 100).toFixed(0)}%</span>
    </div>
  </div>
);

const SignalTile: React.FC<{ label: string; value: string; hint: string; direction: 'up' | 'down' | 'flat' }> = ({ label, value, hint, direction }) => {
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  const color = direction === 'up' ? '#4E6040' : direction === 'down' ? 'var(--primary)' : 'var(--muted-foreground)';
  return (
    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--muted)', border: '1px solid var(--border)', display: 'grid', gap: 4 }}>
      <span className="ds-caption" style={{ fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-foreground)', fontWeight: 700 }}>
        {label}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Icon size={13} color={color} />
        <span style={{ fontSize: 16, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </span>
      <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{hint}</span>
    </div>
  );
};

const SmallDist: React.FC<{ label: string; mean: number; winRate: number; worstMae: number; n: number }> = ({ label, mean, winRate, worstMae, n }) => {
  const positive = mean >= 0;
  return (
    <div style={{ padding: 10, borderRadius: 10, background: 'var(--muted)', border: '1px solid var(--border)', display: 'grid', gap: 4 }}>
      <span className="ds-caption" style={{ fontSize: 10, color: 'var(--muted-foreground)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: positive ? '#4E6040' : 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>{(mean * 100).toFixed(2)}%</span>
      <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
        win {(winRate * 100).toFixed(0)}% · worst MAE {(worstMae * 100).toFixed(1)}% · n = {n}
      </span>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  padding: 14, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)',
};
const iconWrap: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
  border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const Card: React.FC<{ label: string }> = ({ label }) => (
  <div style={cardStyle}><p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>{label}</p></div>
);
