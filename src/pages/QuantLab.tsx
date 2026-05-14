import React, { useCallback, useMemo, useState } from 'react';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import { StatTile } from '../components/quant/StatTile';
import { Sparkline } from '../components/quant/Sparkline';
import { OHLCVChart } from '../components/quant/OHLCVChart';
import { FreshnessBadge } from '../components/quant/FreshnessBadge';
import { fetchOHLCV } from '../services/marketService';
import { closes, logReturns, annualisedVol, maxDrawdown, trendLabel, alignClosesByTs, pearson } from '../lib/quant';
import { Play, Loader2 } from 'lucide-react';
import type { OHLCVBar, Timeframe } from '../types';

const TIMEFRAMES: Timeframe[] = ['1day', '1week', '1month'];
const SIZE_MAP: Record<Timeframe, number> = {
  '1min': 500, '5min': 500, '15min': 500, '30min': 500, '1h': 500, '4h': 500,
  '1day': 250, '1week': 200, '1month': 120,
};
const PERIODS_PER_YEAR: Partial<Record<Timeframe, number>> = {
  '1day': 252, '1week': 52, '1month': 12,
};
const TREND_COPY: Record<string, string> = {
  'strong-up': 'Strong uptrend',
  'up': 'Mild uptrend',
  'flat': 'Range-bound',
  'down': 'Mild downtrend',
  'strong-down': 'Strong downtrend',
  'insufficient': 'Insufficient data',
};

interface AnalysisResult {
  symbol: string;
  timeframe: Timeframe;
  fetchedAt: number;
  bars: OHLCVBar[];
  cs: number[];
  vol: number;
  totalReturn: number;
  mdd: number;
  trend: ReturnType<typeof trendLabel>;
  // Pair correlation (optional)
  pair?: {
    symbol: string;
    bars: OHLCVBar[];
    correlation: number;
    alignedLen: number;
  };
  errors: string[];
}

export const QuantLab: React.FC = () => {
  const [symbol, setSymbol] = useState('SPY');
  const [pair, setPair] = useState('');
  const [timeframe, setTimeframe] = useState<Timeframe>('1day');
  const [source] = useState<'twelve_data'>('twelve_data'); // single source for V1
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const runAnalysis = useCallback(async () => {
    if (!symbol.trim()) return;
    setRunning(true);
    setError(null);
    const errors: string[] = [];
    try {
      const size = SIZE_MAP[timeframe];
      const [primary, secondary] = await Promise.allSettled([
        fetchOHLCV(symbol.toUpperCase(), timeframe, size),
        pair ? fetchOHLCV(pair.toUpperCase(), timeframe, size) : Promise.resolve(null),
      ]);
      if (primary.status === 'rejected') {
        throw primary.reason instanceof Error ? primary.reason : new Error(String(primary.reason));
      }
      const bars = primary.value.bars;
      if (bars.length < 5) throw new Error(`Insufficient bars (${bars.length}) for ${symbol}`);
      const cs = closes(bars);
      const lr = logReturns(cs);
      const ppy = PERIODS_PER_YEAR[timeframe] ?? 252;
      const vol = annualisedVol(lr, ppy) * 100;
      const totalReturn = ((cs[cs.length - 1] / cs[0]) - 1) * 100;
      // Equity curve for max drawdown
      let eq = 1;
      const curve = [eq];
      for (const r of lr) { eq *= Math.exp(r); curve.push(eq); }
      const { mdd } = maxDrawdown(curve);
      const trend = trendLabel(cs);

      let pairBlock: AnalysisResult['pair'] | undefined;
      if (pair && secondary.status === 'fulfilled' && secondary.value) {
        const sec = secondary.value.bars;
        const aligned = alignClosesByTs(bars, sec);
        if (aligned.a.length < 20) {
          errors.push(`Pair ${pair}: only ${aligned.a.length} aligned bars (<20) — correlation skipped.`);
        } else {
          const ra = logReturns(aligned.a);
          const rb = logReturns(aligned.b);
          pairBlock = {
            symbol: pair.toUpperCase(),
            bars: sec,
            correlation: pearson(ra, rb),
            alignedLen: aligned.a.length,
          };
        }
      } else if (pair && secondary.status === 'rejected') {
        const err = secondary.reason instanceof Error ? secondary.reason.message : String(secondary.reason);
        errors.push(`Pair ${pair} fetch failed: ${err}`);
      }

      setResult({
        symbol: symbol.toUpperCase(),
        timeframe,
        fetchedAt: Date.now(),
        bars, cs, vol, totalReturn, mdd: mdd * 100, trend,
        pair: pairBlock,
        errors,
      });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [symbol, pair, timeframe]);

  const pairCorrColor = useMemo(() => {
    const r = result?.pair?.correlation;
    if (r == null) return 'var(--muted-foreground)';
    if (r > 0.3) return '#4E6040';
    if (r < -0.3) return 'var(--primary)';
    return 'var(--muted-foreground)';
  }, [result?.pair]);

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Quant Lab"
        subtitle="Run on-the-fly returns / volatility / drawdown / trend analysis from cached OHLCV. Pair correlation supported when two symbols share aligned bars."
      />

      {/* Controls */}
      <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Symbol</span>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. SPY, AAPL, EUR/USD"
              style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)', color: 'var(--foreground)', fontSize: 13 }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Pair (optional)</span>
            <input
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              placeholder="e.g. TLT"
              style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)', color: 'var(--foreground)', fontSize: 13 }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Timeframe</span>
            <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {TIMEFRAMES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTimeframe(t)}
                  style={{
                    padding: '6px 10px', fontSize: 11, fontWeight: 600,
                    background: timeframe === t ? 'var(--primary)' : 'transparent',
                    color: timeframe === t ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                    border: 'none', cursor: 'pointer', flex: 1,
                  }}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Source</span>
            <span style={{
              padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6,
              background: 'var(--muted)', color: 'var(--muted-foreground)', fontSize: 12,
            }}>
              {source.replace('_', ' ')}
            </span>
          </label>
          <button
            disabled={running || !symbol.trim()}
            onClick={runAnalysis}
            style={{
              padding: '8px 14px', borderRadius: 6, border: 'none',
              background: running ? 'var(--muted)' : 'var(--primary)',
              color: running ? 'var(--muted-foreground)' : 'var(--primary-foreground)',
              cursor: running ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {running ? <><Loader2 size={12} className="ds-spin" /> Running…</> : <><Play size={12} /> Run analysis</>}
          </button>
        </div>
      </section>

      {/* Output */}
      {error && (
        <div className="ds-surface" style={{ padding: 12, borderRadius: 10, marginBottom: 16 }}>
          <p className="ds-heading" style={{ margin: 0, color: 'var(--primary)' }}>Analysis failed</p>
          <p className="ds-caption" style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>
            {error.message}{' '}
            <button onClick={runAnalysis} style={{
              background: 'transparent', border: 'none', color: 'var(--primary)',
              textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit',
            }}>Retry</button>
          </p>
        </div>
      )}

      {!result && !error && !running && (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
          Pick a symbol and timeframe, then run analysis. Results are computed client-side from cached OHLCV bars.
        </p>
      )}

      {result && (
        <>
          <section style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span className="ds-heading" style={{ margin: 0 }}>{result.symbol}</span>
            <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
              {result.timeframe} · {result.bars.length} bars
            </span>
            <FreshnessBadge status="live" fetchedAt={result.fetchedAt} compact />
          </section>

          {result.errors.length > 0 && (
            <div className="ds-surface" style={{ padding: 10, borderRadius: 8, marginBottom: 12 }}>
              {result.errors.map((e, i) => (
                <p key={i} className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>⚠ {e}</p>
              ))}
            </div>
          )}

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
            <StatTile
              label={`Ann. vol (${result.timeframe})`}
              value={`${result.vol.toFixed(2)}%`}
              hint="σ × √periodsPerYear"
            />
            <StatTile
              label="Window return"
              value={`${result.totalReturn >= 0 ? '+' : ''}${result.totalReturn.toFixed(2)}%`}
              delta={result.totalReturn}
            />
            <StatTile
              label="Max drawdown"
              value={`${result.mdd.toFixed(2)}%`}
              hint="peak→trough"
            />
            <StatTile
              label="Trend"
              value={TREND_COPY[result.trend.label]}
              hint={result.trend.label !== 'insufficient'
                ? `${result.trend.pctPerDay >= 0 ? '+' : ''}${result.trend.pctPerDay.toFixed(3)}%/period`
                : undefined}
            />
          </section>

          <section className="ds-surface" style={{ padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <h2 className="ds-heading" style={{ margin: '0 0 8px' }}>Price history</h2>
            <OHLCVChart bars={result.bars} height={260} />
          </section>

          {result.pair && (
            <section className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <h2 className="ds-heading" style={{ margin: 0 }}>
                  {result.symbol} ↔ {result.pair.symbol}
                </h2>
                <span style={{ fontSize: 18, fontWeight: 700, color: pairCorrColor, fontVariantNumeric: 'tabular-nums' }}>
                  ρ = {result.pair.correlation.toFixed(2)}
                </span>
              </header>
              <p className="ds-caption" style={{ margin: '0 0 8px', color: 'var(--muted-foreground)' }}>
                Pearson correlation of log-returns over {result.pair.alignedLen} aligned bars.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{result.symbol}</span>
                  <Sparkline values={result.cs.slice(-80)} width={400} height={50} />
                </div>
                <div>
                  <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{result.pair.symbol}</span>
                  <Sparkline values={result.pair.bars.map((b) => b.close).slice(-80)} width={400} height={50} />
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <Disclaimer />
      <style>{`.ds-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
};
