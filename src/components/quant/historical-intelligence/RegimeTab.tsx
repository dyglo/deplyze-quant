/**
 * RegimeTab — current market regime classification + a panel of historical
 * regime states with their forward-return behaviour.
 *
 * Per requirement, regime exploration must span risk-on / risk-off / vol
 * compression / expansion / trending / ranging. We slide a rolling window
 * over history, classify each window's regime composite, and collect
 * forward-return outcomes by composite-state key.
 */

import React, { useMemo } from 'react';
import { Layers, Activity, Compass } from 'lucide-react';
import { useOHLCV } from '../../../hooks/useMarket';
import {
  classifyMarketRegime,
  regimeStateKey,
  type MarketRegime,
  logReturns,
  closes,
  buildForwardReturnSamples,
  summariseForwardReturns,
} from '../../../lib/quant';
import { ConfidenceBadge } from '../ConfidenceBadge';

const HISTORY_BARS = 2520;
const ROLLING_STEP = 21;          // a regime "snapshot" each month
const ROLLING_WINDOW_MIN = 280;   // matches classifyMarketRegime() minimum
const FORWARD_HORIZON = 20;

export const RegimeTab: React.FC<{ symbol: string; benchmark: string }> = ({ symbol, benchmark }) => {
  const primary = useOHLCV(symbol, '1day', HISTORY_BARS);
  const bench = useOHLCV(benchmark, '1day', HISTORY_BARS);

  const primaryBars = primary.data?.bars ?? [];
  const benchBars = bench.data?.bars ?? [];

  const benchReturns = useMemo(
    () => (benchBars.length ? logReturns(closes(benchBars)) : undefined),
    [benchBars],
  );

  const currentRegime = useMemo(() => {
    if (primaryBars.length < ROLLING_WINDOW_MIN) return null;
    return classifyMarketRegime(primaryBars, { symbol, benchmarkReturns: benchReturns });
  }, [primaryBars, symbol, benchReturns]);

  const regimeMap = useMemo(() => {
    if (primaryBars.length < ROLLING_WINDOW_MIN + FORWARD_HORIZON) return [];
    const acc = new Map<string, { count: number; rets: number[]; example?: MarketRegime }>();
    for (let end = ROLLING_WINDOW_MIN; end + FORWARD_HORIZON < primaryBars.length; end += ROLLING_STEP) {
      const slice = primaryBars.slice(0, end);
      const benchSlice = benchReturns ? benchReturns.slice(0, Math.min(benchReturns.length, end - 1)) : undefined;
      const r = classifyMarketRegime(slice, { symbol, benchmarkReturns: benchSlice });
      if (!r) continue;
      const key = regimeStateKey(r);
      const samples = buildForwardReturnSamples(primaryBars, [end - 1], FORWARD_HORIZON);
      const ret = samples[0]?.ret;
      if (ret == null) continue;
      const bucket = acc.get(key) ?? { count: 0, rets: [], example: r };
      bucket.count += 1;
      bucket.rets.push(ret);
      if (!bucket.example) bucket.example = r;
      acc.set(key, bucket);
    }
    return Array.from(acc.entries())
      .map(([key, b]) => {
        const dist = summariseForwardReturns(
          b.rets.map((ret, i) => ({ index: i, ts: 0, horizon: FORWARD_HORIZON, ret, mae: 0, mfe: 0 })),
          FORWARD_HORIZON,
        );
        return { key, count: b.count, dist, example: b.example! };
      })
      .sort((a, b) => b.count - a.count);
  }, [primaryBars, benchReturns, symbol]);

  if (primary.loading || bench.loading) return <Skeleton label="Loading multi-year history for regime classification…" />;
  if (!currentRegime) return <Empty label={`Need ≥ ${ROLLING_WINDOW_MIN} bars to classify regimes. ${symbol} has ${primaryBars.length}.`} />;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={iconWrap}><Layers size={14} color="var(--primary)" /></span>
        <div>
          <h2 className="ds-heading" style={{ margin: 0 }}>Regime explorer · {symbol}</h2>
          <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            Composite regime across trend, volatility, persistence{currentRegime.riskRegime ? `, and risk alignment vs ${benchmark}` : ''}.
          </p>
        </div>
      </header>

      {/* Current regime */}
      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 className="ds-heading" style={{ margin: 0, fontSize: 13 }}>Current state</h3>
            <p className="ds-body" style={{ margin: '4px 0 0', maxWidth: 720 }}>{currentRegime.label}.</p>
          </div>
          <ConfidenceBadge score={currentRegime.confidence} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
          <Stat label="Trend" value={currentRegime.trend} />
          <Stat label="Vol state" value={currentRegime.volatility.state} />
          <Stat label="Vol trend" value={currentRegime.volatility.trend} />
          <Stat label="Stability" value={`${(currentRegime.trendStability * 100).toFixed(0)}%`} />
          <Stat label="Persistence" value={`${(currentRegime.momentumPersistence * 100).toFixed(0)}%`} />
          {currentRegime.beta != null
            ? <Stat label={`β vs ${benchmark}`} value={currentRegime.beta.toFixed(2)} />
            : <Stat label="Beta" value="—" />}
        </div>

        {currentRegime.riskRegime && (
          <div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: 'var(--muted)', border: '1px solid var(--border)', fontSize: 12 }}>
            Risk alignment: <strong>{currentRegime.riskRegime}</strong>
            {currentRegime.riskAlignment != null ? ` (score ${currentRegime.riskAlignment.toFixed(2)})` : ''}
          </div>
        )}

        <p className="ds-caption" style={{ marginTop: 12, marginBottom: 0, color: 'var(--muted-foreground)' }}>
          {currentRegime.description}
        </p>
      </section>

      {/* Historical map */}
      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
          <h3 className="ds-heading" style={{ margin: 0, fontSize: 13 }}>Historical regimes seen on {symbol}</h3>
          <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
            rolling classification every {ROLLING_STEP} bars · +{FORWARD_HORIZON}-bar forward windows
          </span>
        </div>

        {regimeMap.length === 0 ? (
          <p className="ds-caption" style={{ marginTop: 8, color: 'var(--muted-foreground)' }}>
            Not enough rolling history to populate the regime map.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={th}>Regime key</th>
                <th style={thNum}>n</th>
                <th style={thNum}>Mean +{FORWARD_HORIZON}b</th>
                <th style={thNum}>Win rate</th>
                <th style={thNum}>p25 / p75</th>
                <th style={thNum}>Worst MAE</th>
              </tr>
            </thead>
            <tbody>
              {regimeMap.map((row, i) => {
                const isCurrent = row.key === regimeStateKey(currentRegime);
                const positive = row.dist.mean >= 0;
                return (
                  <tr key={row.key} style={{
                    background: isCurrent ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : i % 2 ? 'var(--muted)' : 'transparent',
                    fontSize: 12,
                  }}>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Compass size={11} color={isCurrent ? 'var(--primary)' : 'var(--muted-foreground)'} />
                        <code style={{ fontSize: 11 }}>{row.key.replace(/\|/g, ' · ')}</code>
                        {isCurrent && <span style={{ fontSize: 9, color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>current</span>}
                      </span>
                    </td>
                    <td style={tdNum}>{row.count}</td>
                    <td style={{ ...tdNum, color: positive ? '#4E6040' : 'var(--primary)', fontWeight: 700 }}>
                      {(row.dist.mean * 100).toFixed(2)}%
                    </td>
                    <td style={tdNum}>{(row.dist.winRate * 100).toFixed(0)}%</td>
                    <td style={tdNum}>{(row.dist.p25 * 100).toFixed(2)}% / {(row.dist.p75 * 100).toFixed(2)}%</td>
                    <td style={tdNum}>{(row.dist.worstMae * 100).toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ ...cardStyle, fontSize: 11, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Activity size={12} />
        Outcomes are descriptions of past behaviour. Forward windows are computed strictly after each historical regime snapshot — no lookahead.
      </section>
    </div>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  padding: 14, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)',
};
const iconWrap: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
  border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const th: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border)' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px', borderBottom: '1px solid var(--border)' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--muted)', border: '1px solid var(--border)', display: 'grid', gap: 2 }}>
    <span className="ds-caption" style={{ fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-foreground)', fontWeight: 700 }}>
      {label}
    </span>
    <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
  </div>
);

const Empty: React.FC<{ label: string }> = ({ label }) => (
  <div style={cardStyle}><p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>{label}</p></div>
);
const Skeleton: React.FC<{ label: string }> = ({ label }) => (
  <div style={cardStyle}><p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>{label}</p></div>
);
