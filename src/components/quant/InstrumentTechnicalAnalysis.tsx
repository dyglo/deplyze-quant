import React, { useMemo, useState } from 'react';
import { useOHLCV } from '../../hooks/useMarket';
import { closes } from '../../lib/quant';
import {
  rsi, macd, stochastic, bollingerBands, williamsR,
  smaSignals, emaSignals, summariseSignals,
  type TechSignal, type TechnicalSummary,
} from '../../lib/quant/technicals';
import { Lock } from 'lucide-react';

// ─── 5-level signal ───────────────────────────────────────────────────────────

type Signal5 = 'strong_sell' | 'sell' | 'neutral' | 'buy' | 'strong_buy';

function toSignal5(s: TechnicalSummary): Signal5 {
  const total = s.buy + s.neutral + s.sell || 1;
  const buyPct  = s.buy  / total;
  const sellPct = s.sell / total;
  if (buyPct  >= 0.6) return 'strong_buy';
  if (buyPct  >= 0.4) return 'buy';
  if (sellPct >= 0.6) return 'strong_sell';
  if (sellPct >= 0.4) return 'sell';
  return 'neutral';
}

const SIGNAL5_LABEL: Record<Signal5, string> = {
  strong_sell: 'Strong Sell',
  sell: 'Sell',
  neutral: 'Neutral',
  buy: 'Buy',
  strong_buy: 'Strong Buy',
};

const SIGNAL5_COLOR: Record<Signal5, string> = {
  strong_sell: '#ef4444',
  sell:        '#f97316',
  neutral:     'var(--muted-foreground)',
  buy:         '#84cc16',
  strong_buy:  '#22c55e',
};

const SIGNAL5_BG: Record<Signal5, string> = {
  strong_sell: 'rgba(239,68,68,0.12)',
  sell:        'rgba(249,115,22,0.12)',
  neutral:     'var(--muted)',
  buy:         'rgba(132,204,18,0.12)',
  strong_buy:  'rgba(34,197,94,0.12)',
};

// Maps signal to needle angle: -90° = strong sell … +90° = strong buy
const SIGNAL5_ANGLE: Record<Signal5, number> = {
  strong_sell: -80,
  sell:        -42,
  neutral:     0,
  buy:         42,
  strong_buy:  80,
};

// ─── SVG Speedometer Gauge ────────────────────────────────────────────────────

interface GaugeProps {
  signal: Signal5;
  label: string;
  size?: 'sm' | 'lg';
  summary?: TechnicalSummary;
}

const SemiGauge: React.FC<GaugeProps> = ({ signal, label, size = 'sm', summary }) => {
  const W  = size === 'lg' ? 220 : 170;
  const H  = size === 'lg' ? 135 : 100;
  const cx = W / 2;
  const cy = size === 'lg' ? 125 : 91;
  const R  = size === 'lg' ? 95  : 72;
  const sw = size === 'lg' ? 14  : 10;

  const toRad = (d: number) => (d * Math.PI) / 180;

  // Math-convention arc (0°=right, 90°=top, 180°=left).
  // y = cy - R*sin converts to SVG y-down; sweep=0 = CCW on screen = goes upward.
  function segArc(a1: number, a2: number, r: number): string {
    const x1 = (cx + r * Math.cos(toRad(a1))).toFixed(2);
    const y1 = (cy - r * Math.sin(toRad(a1))).toFixed(2);
    const x2 = (cx + r * Math.cos(toRad(a2))).toFixed(2);
    const y2 = (cy - r * Math.sin(toRad(a2))).toFixed(2);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 0 ${x2} ${y2}`;
  }

  // Five equal 36° segments across the upper semicircle
  const segs: Array<{ a1: number; a2: number; color: string }> = [
    { a1: 180, a2: 144, color: '#ef4444' }, // strong sell
    { a1: 144, a2: 108, color: '#f97316' }, // sell
    { a1: 108, a2:  72, color: '#94a3b8' }, // neutral
    { a1:  72, a2:  36, color: '#84cc16' }, // buy
    { a1:  36, a2:   0, color: '#22c55e' }, // strong buy
  ];

  // Needle: SIGNAL5_ANGLE (-80…+80) → math angle via 90 - angle
  // neutral(0)→90°=top, strong_buy(+80)→10°=right, strong_sell(-80)→170°=left
  const mathAngle = 90 - SIGNAL5_ANGLE[signal];
  const needleLen = R - sw / 2 - 4;
  const nx = cx + needleLen * Math.cos(toRad(mathAngle));
  const ny = cy - needleLen * Math.sin(toRad(mathAngle));

  const ticks = [180, 144, 108, 72, 36, 0];
  const color = SIGNAL5_COLOR[signal];
  const isStrong = signal === 'strong_buy' || signal === 'strong_sell';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span style={{
        fontSize: size === 'lg' ? 12 : 10.5, fontWeight: 600,
        color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: 0.6,
      }}>{label}</span>

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        {/* Background track — two 90° arcs avoids the degenerate 180° ambiguity */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 0 ${cx} ${cy - R} A ${R} ${R} 0 0 0 ${cx + R} ${cy}`}
          stroke="var(--border)" strokeWidth={sw + 3} fill="none" strokeLinecap="butt"
        />
        {/* Colored zone arcs */}
        {segs.map((seg, i) => (
          <path key={i} d={segArc(seg.a1, seg.a2, R)} stroke={seg.color} strokeWidth={sw} fill="none" opacity={0.9} />
        ))}
        {/* Tick separators at zone boundaries */}
        {ticks.map(angle => {
          const inner = R - sw / 2 - 1;
          const outer = R + sw / 2 + 1;
          return (
            <line key={angle}
              x1={(cx + inner * Math.cos(toRad(angle))).toFixed(2)}
              y1={(cy - inner * Math.sin(toRad(angle))).toFixed(2)}
              x2={(cx + outer * Math.cos(toRad(angle))).toFixed(2)}
              y2={(cy - outer * Math.sin(toRad(angle))).toFixed(2)}
              stroke="var(--background)" strokeWidth={size === 'lg' ? 2 : 1.5}
            />
          );
        })}
        {/* Needle shadow */}
        <line x1={cx} y1={cy} x2={nx.toFixed(2)} y2={ny.toFixed(2)}
          stroke="rgba(0,0,0,0.18)" strokeWidth={size === 'lg' ? 4 : 3} strokeLinecap="round" />
        {/* Needle */}
        <line x1={cx} y1={cy} x2={nx.toFixed(2)} y2={ny.toFixed(2)}
          stroke="var(--foreground)" strokeWidth={size === 'lg' ? 2.5 : 2} strokeLinecap="round" />
        {/* Pivot */}
        <circle cx={cx} cy={cy} r={size === 'lg' ? 5.5 : 4}
          fill="var(--background)" stroke="var(--foreground)" strokeWidth={2} />
        {/* Tip dot colored by signal */}
        <circle cx={nx.toFixed(2)} cy={ny.toFixed(2)} r={size === 'lg' ? 3 : 2} fill={color} />
      </svg>

      {/* Signal badge */}
      <span style={{
        marginTop: -2,
        fontSize: size === 'lg' ? 15 : 11.5, fontWeight: 700,
        color, background: SIGNAL5_BG[signal],
        padding: size === 'lg' ? '6px 24px' : '3px 14px',
        borderRadius: size === 'lg' ? 8 : 5,
        border: isStrong ? `1px solid ${color}30` : 'none',
        letterSpacing: 0.2,
      }}>
        {SIGNAL5_LABEL[signal]}
      </span>

      {/* Buy / Neutral / Sell count breakdown */}
      {summary && (
        <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>
          <span style={{ color: '#ef4444', fontWeight: 600 }}>{summary.sell} Sell</span>
          <span>{summary.neutral} Neutral</span>
          <span style={{ color: '#22c55e', fontWeight: 600 }}>{summary.buy} Buy</span>
        </div>
      )}
    </div>
  );
};

// ─── Timeframe config ─────────────────────────────────────────────────────────

type TF = '30Min' | 'Hourly' | '5Hours' | 'Daily' | 'Weekly' | 'Monthly';
const TF_BARS: Record<TF, number> = {
  '30Min': 30, 'Hourly': 63, '5Hours': 126,
  'Daily': 252, 'Weekly': 504, 'Monthly': 756,
};
const TF_LABELS: TF[] = ['30Min', 'Hourly', '5Hours', 'Daily', 'Weekly', 'Monthly'];
const TF_DISPLAY: Record<TF, string> = {
  '30Min': '30 Min', 'Hourly': 'Hourly', '5Hours': '5 Hours',
  'Daily': 'Daily', 'Weekly': 'Weekly', 'Monthly': 'Monthly',
};
// Locked timeframes (would need intraday data)
const TF_LOCKED: Partial<Record<TF, boolean>> = {
  '30Min': false, 'Hourly': false,
};

// ─── Main component ───────────────────────────────────────────────────────────

const IndicatorRow: React.FC<{ label: string; value: string; signal: TechSignal; sub?: string }> = ({ label, value, signal, sub }) => {
  const color = signal === 'buy' ? 'var(--ds-gain)' : signal === 'sell' ? 'var(--ds-loss)' : 'var(--muted-foreground)';
  const sigLabel = signal === 'buy' ? 'Buy' : signal === 'sell' ? 'Sell' : 'Neutral';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--foreground)' }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{sub}</div>}
      </div>
      <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color, minWidth: 40, textAlign: 'right' }}>{sigLabel}</span>
    </div>
  );
};

export const InstrumentTechnicalAnalysis: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [tf, setTf] = useState<TF>('Daily');
  const ohlcv = useOHLCV(symbol, '1day', TF_BARS[tf]);
  const bars   = ohlcv.data?.bars ?? [];
  const cs     = useMemo(() => closes(bars), [bars]);

  const analysis = useMemo(() => {
    if (cs.length < 30) return null;
    const smaRows    = smaSignals(cs, [20, 50, 100, 200]);
    const emaRows    = emaSignals(cs, [10, 20, 50]);
    const rsiResult  = rsi(cs, 14);
    const macdResult = macd(cs);
    const stochResult = stochastic(bars, 14, 3);
    const bbResult   = bollingerBands(cs, 20, 2);
    const wrResult   = williamsR(bars, 14);

    const oscSignals: TechSignal[] = [
      ...(rsiResult    ? [rsiResult.signal]      : []),
      ...(macdResult   ? [macdResult.crossSignal] : []),
      ...(stochResult  ? [stochResult.signal]     : []),
      ...(bbResult     ? [bbResult.signal]        : []),
      ...(wrResult     ? [wrResult.signal]        : []),
    ];
    const maSignals: TechSignal[] = [
      ...smaRows.map(r => r.signal),
      ...emaRows.map(r => r.signal),
    ];

    const oscSummary = summariseSignals(oscSignals);
    const maSummary  = summariseSignals(maSignals);
    const allSummary = summariseSignals([...oscSignals, ...maSignals]);

    return { smaRows, emaRows, rsiResult, macdResult, stochResult, bbResult, wrResult, oscSummary, maSummary, allSummary };
  }, [cs, bars]);

  // Per-timeframe summary pill (for the top selector row)
  const tfSignals: Partial<Record<TF, Signal5>> = useMemo(() => {
    if (!analysis) return {};
    return { [tf]: toSignal5(analysis.allSummary) };
  }, [analysis, tf]);

  return (
    <section style={{ marginBottom: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>Technical Analysis</h2>
        <span style={{ fontSize: 13, color: 'var(--muted-foreground)', cursor: 'pointer' }}>›</span>
        <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 4 }}>
          Computed from {cs.length} daily bars
        </span>
      </div>

      {/* Timeframe selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        {/* Locked 1Min, 5Min, 15Min */}
        {(['1 Min', '5 Min', '15 min'] as const).map(t => (
          <div key={t} style={{
            padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6,
            textAlign: 'center', minWidth: 70, background: 'var(--card)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 3 }}>{t}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center', fontSize: 10, color: 'var(--primary)', cursor: 'pointer' }}>
              <Lock size={8} /> Unlock
            </div>
          </div>
        ))}
        {/* Available timeframes */}
        {TF_LABELS.map(t => {
          const active = tf === t;
          const sig = tfSignals[t];
          const sigColor = sig ? SIGNAL5_COLOR[sig] : 'var(--muted-foreground)';
          return (
            <button key={t} onClick={() => setTf(t)}
              style={{
                padding: '6px 14px', border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                borderRadius: 6, minWidth: 70, textAlign: 'center', cursor: 'pointer',
                background: active ? 'rgba(var(--primary-rgb, 193,95,60),0.06)' : 'var(--card)',
              }}>
              <div style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: 'var(--foreground)', marginBottom: sig ? 2 : 0 }}>
                {TF_DISPLAY[t]}
              </div>
              {sig && (
                <div style={{ fontSize: 10, fontWeight: 600, color: sigColor }}>{SIGNAL5_LABEL[sig]}</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading / insufficient */}
      {ohlcv.loading && !bars.length ? (
        <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: 0 }}>Computing indicators…</p>
      ) : !analysis ? (
        <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: 0 }}>
          Insufficient price history (need ≥30 bars, have {cs.length}).
        </p>
      ) : (
        <>
          {/* Three gauges */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, alignItems: 'end' }}>
              <SemiGauge signal={toSignal5(analysis.oscSummary)} label="Oscillators" size="sm" summary={analysis.oscSummary} />
              <SemiGauge signal={toSignal5(analysis.allSummary)} label="Summary" size="lg" summary={analysis.allSummary} />
              <SemiGauge signal={toSignal5(analysis.maSummary)} label="Moving Averages" size="sm" summary={analysis.maSummary} />
            </div>
          </div>

          {/* Indicator tables */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
            {/* Moving Averages */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted-foreground)', padding: '8px 0 6px' }}>
                Moving Averages
              </div>
              {analysis.smaRows.map(r => (
                <IndicatorRow key={`sma${r.period}`} label={`SMA ${r.period}`} value={r.value.toFixed(2)} signal={r.signal}
                  sub={`Price ${r.signal === 'buy' ? '>' : r.signal === 'sell' ? '<' : '≈'} SMA${r.period}`} />
              ))}
              {analysis.emaRows.map(r => (
                <IndicatorRow key={`ema${r.period}`} label={`EMA ${r.period}`} value={r.value.toFixed(2)} signal={r.signal} />
              ))}
            </div>

            {/* Oscillators */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--muted-foreground)', padding: '8px 0 6px' }}>
                Oscillators
              </div>
              {analysis.rsiResult && (
                <IndicatorRow label="RSI (14)" value={analysis.rsiResult.value.toFixed(1)} signal={analysis.rsiResult.signal}
                  sub={analysis.rsiResult.value > 70 ? 'Overbought' : analysis.rsiResult.value < 30 ? 'Oversold' : '30–70 range'} />
              )}
              {analysis.macdResult && (
                <IndicatorRow label="MACD (12,26,9)" value={`${analysis.macdResult.histogram >= 0 ? '+' : ''}${analysis.macdResult.histogram.toFixed(3)}`}
                  signal={analysis.macdResult.crossSignal}
                  sub={`MACD ${analysis.macdResult.macd.toFixed(2)} · Sig ${analysis.macdResult.signal.toFixed(2)}`} />
              )}
              {analysis.stochResult && (
                <IndicatorRow label="Stochastic (14,3)" value={`%K ${analysis.stochResult.k.toFixed(1)}`}
                  signal={analysis.stochResult.signal} sub={`%D ${analysis.stochResult.d.toFixed(1)}`} />
              )}
              {analysis.bbResult && (
                <IndicatorRow label="Bollinger Bands (20,2)" value={`${(analysis.bbResult.percentB * 100).toFixed(0)}%B`}
                  signal={analysis.bbResult.signal}
                  sub={`BW ${(analysis.bbResult.bandwidth * 100).toFixed(1)}% · Mid $${analysis.bbResult.middle.toFixed(2)}`} />
              )}
              {analysis.wrResult && (
                <IndicatorRow label="Williams %R (14)" value={analysis.wrResult.value.toFixed(1)}
                  signal={analysis.wrResult.signal}
                  sub={analysis.wrResult.value > -20 ? 'Overbought zone' : analysis.wrResult.value < -80 ? 'Oversold zone' : 'Neutral zone'} />
              )}
            </div>
          </div>

          <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: '12px 0 0' }}>
            Technical signals are computed from historical price data. Not financial advice.
          </p>
        </>
      )}
    </section>
  );
};
