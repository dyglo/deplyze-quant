/**
 * BenchmarkOverlayPanel — Quant Lab tool that overlays an asset's rebased
 * 100 price track against one or two benchmark tracks and surfaces the full
 * benchmark-intelligence snapshot (beta, alpha, tracking error, info ratio,
 * capture ratios, beta-drift flag).
 */

import React, { useMemo, useState } from 'react';
import { useOHLCV } from '../../hooks/useMarket';
import { useBenchmarkIntelligence } from '../../hooks/useBenchmarkIntelligence';
import { BenchmarkIntelligencePanel } from './BenchmarkIntelligencePanel';
import { alignClosesByTs, rebase100 } from '../../lib/quant';

const PALETTE = ['var(--foreground)', 'var(--primary)', '#4E6040'];

interface OverlayLineProps {
  series: Array<{ label: string; values: number[]; color: string }>;
  width?: number;
  height?: number;
}

const OverlayLines: React.FC<OverlayLineProps> = ({ series, width = 560, height = 200 }) => {
  if (!series.length || series.some((s) => s.values.length < 2)) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 11 }}>Insufficient data to plot.</div>;
  }
  const all = series.flatMap((s) => s.values);
  const min = Math.min(...all), max = Math.max(...all);
  const range = max - min || 1;
  const n = Math.max(...series.map((s) => s.values.length));
  const x = (i: number) => (i / (n - 1)) * width;
  const y = (v: number) => height - ((v - min) / range) * height;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {series.map((s) => {
        const offset = n - s.values.length;
        const d = s.values
          .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i + offset).toFixed(2)} ${y(v).toFixed(2)}`)
          .join(' ');
        return <path key={s.label} d={d} stroke={s.color} strokeWidth={1.4} fill="none" />;
      })}
    </svg>
  );
};

export interface BenchmarkOverlayPanelProps {
  defaultSymbol?: string;
  onSaveSession?: (payload: {
    name: string;
    panel: 'alpha';
    symbols: string[];
    timeframe: string;
    summary: Record<string, string | number>;
  }) => void;
}

const BENCHMARKS = ['SPY', 'QQQ', 'IWM', 'DIA'] as const;
type BenchmarkChoice = typeof BENCHMARKS[number];

export const BenchmarkOverlayPanel: React.FC<BenchmarkOverlayPanelProps> = ({ defaultSymbol = 'AAPL', onSaveSession }) => {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [draft, setDraft] = useState(defaultSymbol);
  const [benchmark, setBenchmark] = useState<BenchmarkChoice>('SPY');

  const asset = useOHLCV(symbol, '1day', 504);
  const bench = useOHLCV(benchmark, '1day', 504);
  const intel = useBenchmarkIntelligence(symbol, benchmark);

  const overlay = useMemo(() => {
    const aBars = asset.data?.bars ?? [];
    const bBars = bench.data?.bars ?? [];
    if (aBars.length < 30 || bBars.length < 30) return null;
    const aligned = alignClosesByTs(aBars, bBars);
    if (aligned.a.length < 30) return null;
    return {
      asset: rebase100(aligned.a),
      bench: rebase100(aligned.b),
      n: aligned.a.length,
    };
  }, [asset.data, bench.data]);

  const loading = asset.loading || bench.loading;

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <section className="ds-surface" style={{ padding: 16, borderRadius: 10, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h2 className="ds-heading" style={{ margin: 0 }}>Benchmark overlay</h2>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {BENCHMARKS.map((b) => (
              <button
                key={b}
                onClick={() => setBenchmark(b)}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 600,
                  background: benchmark === b ? 'var(--primary)' : 'transparent',
                  color: benchmark === b ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  border: 'none', cursor: 'pointer',
                }}
              >{b}</button>
            ))}
          </div>
        </div>

        <label style={{ display: 'grid', gap: 4, maxWidth: 240 }}>
          <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Symbol</span>
          <input
            className="ds-input"
            style={{ padding: '6px 8px', fontSize: 12 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setSymbol(draft.toUpperCase()); }}
            onBlur={() => setSymbol(draft.toUpperCase())}
          />
        </label>

        {loading && (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
            Loading {symbol} and {benchmark} histories…
          </p>
        )}

        {!loading && !overlay && (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
            Need ≥30 overlapping daily bars between {symbol} and {benchmark}.
          </p>
        )}

        {overlay && (
          <>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted-foreground)' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 2, background: PALETTE[0], marginRight: 4, verticalAlign: 'middle' }} /> {symbol}</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 2, background: PALETTE[1], marginRight: 4, verticalAlign: 'middle' }} /> {benchmark}</span>
              <span style={{ marginLeft: 'auto' }}>Rebased 100 · {overlay.n} aligned bars</span>
            </div>
            <OverlayLines
              series={[
                { label: symbol,    values: overlay.asset, color: PALETTE[0] },
                { label: benchmark, values: overlay.bench, color: PALETTE[1] },
              ]}
            />
          </>
        )}
      </section>

      <BenchmarkIntelligencePanel symbol={symbol} />

      {intel.snapshot && onSaveSession && (
        <div>
          <button
            onClick={() => onSaveSession({
              name: `${symbol} vs ${benchmark} benchmark`,
              panel: 'alpha',
              symbols: [symbol, benchmark],
              timeframe: '1day',
              summary: {
                beta: intel.snapshot!.beta.toFixed(2),
                alphaAnnualised: `${(intel.snapshot!.alphaAnnualised * 100).toFixed(2)}%`,
                trackingError: `${(intel.snapshot!.trackingError * 100).toFixed(2)}%`,
                informationRatio: intel.snapshot!.informationRatio.toFixed(2),
                hitRatio: `${(intel.snapshot!.hitRatio * 100).toFixed(0)}%`,
                upCapture: intel.snapshot!.upCapture.toFixed(2),
                downCapture: intel.snapshot!.downCapture.toFixed(2),
                betaDriftFlagged: intel.snapshot!.betaShiftFlagged ? 'yes' : 'no',
              },
            })}
            className="ds-btn-secondary"
            style={{ fontSize: 12 }}
          >
            Save snapshot
          </button>
        </div>
      )}
    </section>
  );
};
