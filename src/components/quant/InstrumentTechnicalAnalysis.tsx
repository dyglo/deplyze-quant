import React, { useMemo } from 'react';
import { useOHLCV } from '../../hooks/useMarket';
import { closes } from '../../lib/quant';
import {
  rsi, macd, stochastic, bollingerBands, williamsR,
  smaSignals, emaSignals, summariseSignals,
  type TechSignal,
} from '../../lib/quant/technicals';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SIGNAL_COLORS: Record<TechSignal, string> = {
  buy:     'var(--ds-gain)',
  neutral: 'var(--muted-foreground)',
  sell:    'var(--ds-loss)',
};

const SIGNAL_BG: Record<TechSignal, string> = {
  buy:     'var(--ds-gain-muted)',
  neutral: 'var(--muted)',
  sell:    'var(--ds-loss-muted)',
};

const SignalBadge: React.FC<{ signal: TechSignal }> = ({ signal }) => (
  <span style={{
    padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
    letterSpacing: 0.3, textTransform: 'uppercase',
    background: SIGNAL_BG[signal], color: SIGNAL_COLORS[signal],
  }}>
    {signal}
  </span>
);

const IndicatorRow: React.FC<{
  label: string;
  value: string;
  signal: TechSignal;
  sub?: string;
}> = ({ label, value, signal, sub }) => (
  <div style={{
    display: 'grid', gridTemplateColumns: '1fr auto auto',
    gap: 8, alignItems: 'center',
    padding: '6px 0', borderBottom: '1px solid var(--border)',
  }}>
    <div>
      <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{sub}</div>}
    </div>
    <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>{value}</span>
    <SignalBadge signal={signal} />
  </div>
);

// ─── Summary gauge ────────────────────────────────────────────────────────────

const SummaryGauge: React.FC<{ buy: number; neutral: number; sell: number; overall: TechSignal }> = ({
  buy, neutral, sell, overall,
}) => {
  const total = buy + neutral + sell || 1;
  const buyPct = (buy / total) * 100;
  const neuPct = (neutral / total) * 100;
  const sellPct = (sell / total) * 100;

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '12px 0', marginBottom: 4 }}>
      {/* Overall badge */}
      <div style={{ textAlign: 'center', minWidth: 72 }}>
        <div style={{
          fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
          color: SIGNAL_COLORS[overall],
          padding: '6px 12px', borderRadius: 8,
          background: SIGNAL_BG[overall],
          border: `1px solid ${SIGNAL_COLORS[overall]}30`,
        }}>
          {overall}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 4 }}>Overall</div>
      </div>

      {/* Bar chart */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
          {buyPct > 0 && <div style={{ flex: buyPct, background: 'var(--ds-gain)', borderRadius: '4px 0 0 4px' }} />}
          {neuPct > 0 && <div style={{ flex: neuPct, background: 'var(--muted-foreground)', opacity: 0.4 }} />}
          {sellPct > 0 && <div style={{ flex: sellPct, background: 'var(--ds-loss)', borderRadius: '0 4px 4px 0' }} />}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--ds-gain)', fontWeight: 600 }}>{buy} Buy</span>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{neutral} Neutral</span>
          <span style={{ fontSize: 10, color: 'var(--ds-loss)', fontWeight: 600 }}>{sell} Sell</span>
        </div>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const InstrumentTechnicalAnalysis: React.FC<{ symbol: string }> = ({ symbol }) => {
  const ohlcv = useOHLCV(symbol, '1day', 252);
  const bars = ohlcv.data?.bars ?? [];
  const cs = useMemo(() => closes(bars), [bars]);

  const analysis = useMemo(() => {
    if (cs.length < 30) return null;

    // Moving averages
    const smaRows = smaSignals(cs, [20, 50, 100, 200]);
    const emaRows = emaSignals(cs, [10, 20, 50]);

    // Oscillators
    const rsiResult   = rsi(cs, 14);
    const macdResult  = macd(cs);
    const stochResult = stochastic(bars, 14, 3);
    const bbResult    = bollingerBands(cs, 20, 2);
    const wrResult    = williamsR(bars, 14);

    // Collect all signals for summary
    const allSignals: TechSignal[] = [
      ...smaRows.map(r => r.signal),
      ...emaRows.map(r => r.signal),
      ...(rsiResult   ? [rsiResult.signal]    : []),
      ...(macdResult  ? [macdResult.crossSignal] : []),
      ...(stochResult ? [stochResult.signal]  : []),
      ...(bbResult    ? [bbResult.signal]     : []),
      ...(wrResult    ? [wrResult.signal]     : []),
    ];

    return { smaRows, emaRows, rsiResult, macdResult, stochResult, bbResult, wrResult, summary: summariseSignals(allSignals) };
  }, [cs, bars]);

  if (ohlcv.loading && !bars.length) {
    return (
      <section style={{ marginBottom: 32 }}>
        <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Technical Analysis</h2>
        </div>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: 0 }}>Computing indicators from 1-year history…</p>
      </section>
    );
  }

  if (!analysis || cs.length < 30) {
    return (
      <section style={{ marginBottom: 32 }}>
        <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Technical Analysis</h2>
        </div>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: 0 }}>Insufficient price history for technical analysis (need ≥30 bars, have {cs.length}).</p>
      </section>
    );
  }

  const { smaRows, emaRows, rsiResult, macdResult, stochResult, bbResult, wrResult, summary } = analysis;
  const current = cs[cs.length - 1];

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Technical Analysis</h2>
        <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>Computed from {cs.length} daily bars</p>
      </div>

      <SummaryGauge {...summary} />

      {/* Two-column indicator table */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>

        {/* Moving Averages */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', padding: '10px 0 4px' }}>
            Moving Averages
          </div>
          {smaRows.map(r => (
            <IndicatorRow
              key={`sma${r.period}`}
              label={`SMA ${r.period}`}
              value={r.value.toFixed(2)}
              signal={r.signal}
              sub={`Price ${r.signal === 'buy' ? '>' : r.signal === 'sell' ? '<' : '≈'} SMA`}
            />
          ))}
          {emaRows.map(r => (
            <IndicatorRow
              key={`ema${r.period}`}
              label={`EMA ${r.period}`}
              value={r.value.toFixed(2)}
              signal={r.signal}
            />
          ))}
        </div>

        {/* Oscillators */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted-foreground)', padding: '10px 0 4px' }}>
            Oscillators
          </div>
          {rsiResult && (
            <IndicatorRow
              label="RSI (14)"
              value={rsiResult.value.toFixed(1)}
              signal={rsiResult.signal}
              sub={rsiResult.value > 70 ? 'Overbought' : rsiResult.value < 30 ? 'Oversold' : '30–70 range'}
            />
          )}
          {macdResult && (
            <IndicatorRow
              label="MACD (12,26,9)"
              value={`${macdResult.histogram >= 0 ? '+' : ''}${macdResult.histogram.toFixed(3)}`}
              signal={macdResult.crossSignal}
              sub={`MACD ${macdResult.macd.toFixed(2)} · Sig ${macdResult.signal.toFixed(2)}`}
            />
          )}
          {stochResult && (
            <IndicatorRow
              label="Stochastic (14,3)"
              value={`%K ${stochResult.k.toFixed(1)}`}
              signal={stochResult.signal}
              sub={`%D ${stochResult.d.toFixed(1)}`}
            />
          )}
          {bbResult && (
            <IndicatorRow
              label="Bollinger Bands (20,2)"
              value={`${(bbResult.percentB * 100).toFixed(0)}%B`}
              signal={bbResult.signal}
              sub={`BW ${(bbResult.bandwidth * 100).toFixed(1)}% · Mid $${bbResult.middle.toFixed(2)}`}
            />
          )}
          {wrResult && (
            <IndicatorRow
              label="Williams %R (14)"
              value={wrResult.value.toFixed(1)}
              signal={wrResult.signal}
              sub={wrResult.value > -20 ? 'Overbought zone' : wrResult.value < -80 ? 'Oversold zone' : 'Neutral zone'}
            />
          )}
          <IndicatorRow
            label="Price vs SMA50"
            value={`${current >= (smaRows.find(r => r.period === 50)?.value ?? current) ? '▲' : '▼'} $${current.toFixed(2)}`}
            signal={(smaRows.find(r => r.period === 50)?.signal) ?? 'neutral'}
            sub="Current vs 50-day avg"
          />
        </div>
      </div>

      <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '10px 0 0' }}>
        Technical signals are computed from historical price data. Not financial advice. Buy = price above indicator threshold, Sell = below.
      </p>
    </section>
  );
};
