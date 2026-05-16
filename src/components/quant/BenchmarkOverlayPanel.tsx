/**
 * BenchmarkOverlayPanel — Quant Lab tool that overlays an asset's rebased
 * 100 price track against one or two benchmark tracks and surfaces the full
 * benchmark-intelligence snapshot (beta, alpha, tracking error, info ratio,
 * capture ratios, beta-drift flag).
 */

import React, { useMemo, useState, useRef, useCallback } from 'react';
import { X, Plus } from 'lucide-react';
import './BenchmarkOverlayPanel.css';
import { useOHLCV } from '../../hooks/useMarket';
import { useBenchmarkIntelligence } from '../../hooks/useBenchmarkIntelligence';
import { BenchmarkIntelligencePanel } from './BenchmarkIntelligencePanel';
import { InstrumentSelector } from './InstrumentSelector';
import { alignClosesByTs, rebase100 } from '../../lib/quant';

const MAX_BENCHMARKS = 10;
const VB_W = 1000;
const VB_H = 300;
const PAD_R = 52; // right padding for end labels

// 10-slot palette: primary first, then 9 distinct accent colours
const PALETTE = [
  'var(--foreground)',
  'var(--primary)',
  '#4E6040',
  '#4a90d9',
  '#d4a843',
  '#9b59b6',
  '#e67e22',
  '#1abc9c',
  '#e74c3c',
  '#2980b9',
  '#f39c12',
];

interface SeriesData {
  label: string;
  values: number[];
  color: string;
}

// Period window in number of data points (null = all)
type PeriodKey = '1M' | '3M' | '6M' | '1Y' | '2Y' | 'All';
const PERIOD_BARS: Record<PeriodKey, number | null> = {
  '1M': 21, '3M': 63, '6M': 126, '1Y': 252, '2Y': 504, 'All': null,
};
const PERIODS: PeriodKey[] = ['1M', '3M', '6M', '1Y', '2Y', 'All'];

interface OverlayLineProps {
  series: SeriesData[];
  hidden: Set<string>;
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  height?: number;
}

const OverlayLines: React.FC<OverlayLineProps> = ({ series, hidden, period, onPeriodChange, height = VB_H }) => {
  const [mouseX, setMouseX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const rawPct = (e.clientX - rect.left) / rect.width;
    setMouseX(Math.max(0, Math.min(1, rawPct)) * (VB_W - PAD_R));
  }, []);

  const handleMouseLeave = useCallback(() => setMouseX(null), []);

  // Slice each series to the period window and re-rebase to 100 at the new start
  const slicedSeries = useMemo(() => {
    const bars = PERIOD_BARS[period];
    return series.map(s => {
      if (!bars || s.values.length <= bars) return s;
      const sliced = s.values.slice(-bars);
      const base = sliced[0] || 100;
      return { ...s, values: sliced.map(v => (v / base) * 100) };
    });
  }, [series, period]);

  const visible = slicedSeries.filter(s => !hidden.has(s.label));

  if (!slicedSeries.length || slicedSeries.every(s => s.values.length < 2)) {
    return (
      <div className="bop-chart-empty" style={{ '--chart-h': `${height}px` } as React.CSSProperties}>
        Insufficient data to plot.
      </div>
    );
  }

  const allVals = visible.length
    ? visible.flatMap(s => s.values)
    : slicedSeries.flatMap(s => s.values);
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;

  const n = Math.max(...slicedSeries.map(s => s.values.length));
  const xOf = (i: number) => (i / (n - 1)) * (VB_W - PAD_R);
  const yOf = (v: number) => VB_H - ((v - minV) / range) * (VB_H - 8) - 4;

  // Crosshair index
  const hoverIdx = mouseX !== null
    ? Math.round((mouseX / (VB_W - PAD_R)) * (n - 1))
    : null;
  const hoverX = hoverIdx !== null ? xOf(hoverIdx) : null;

  // Tooltip entries — visible series only, sorted high→low
  const tooltipEntries = hoverIdx !== null
    ? slicedSeries
        .filter(s => !hidden.has(s.label))
        .map(s => {
          const offset = n - s.values.length;
          const dataIdx = hoverIdx - offset;
          const val = dataIdx >= 0 && dataIdx < s.values.length ? s.values[dataIdx] : null;
          return { label: s.label, color: s.color, val, delta: val !== null ? val - 100 : null };
        })
        .filter(e => e.val !== null)
        .sort((a, b) => (b.val ?? 0) - (a.val ?? 0))
    : [];

  // Flip tooltip to left when cursor is in the right 35% of the chart
  const tooltipOnRight = hoverX !== null && hoverX < (VB_W - PAD_R) * 0.65;

  return (
    <div className="bop-chart-wrap">
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        className="bop-chart-svg"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Horizontal gridlines */}
        {[0, 25, 50, 75, 100].map(pct => {
          const v = minV + (pct / 100) * range;
          const gy = yOf(v);
          return (
            <line key={pct}
              x1={0} x2={VB_W - PAD_R} y1={gy} y2={gy}
              stroke="var(--border)" strokeWidth={0.5} strokeOpacity={0.6}
            />
          );
        })}

        {/* Series lines */}
        {slicedSeries.map(s => {
          const isHidden = hidden.has(s.label);
          const offset = n - s.values.length;
          const d = s.values
            .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i + offset).toFixed(1)} ${yOf(v).toFixed(1)}`)
            .join(' ');
          return (
            <path
              key={s.label} d={d} stroke={s.color}
              strokeWidth={1.6} fill="none"
              opacity={isHidden ? 0.12 : 1}
              className="bop-series-path"
            />
          );
        })}

        {/* End-of-line labels */}
        {slicedSeries.filter(s => !hidden.has(s.label)).map(s => {
          const lastVal = s.values[s.values.length - 1];
          return (
            <text
              key={`label-${s.label}`}
              x={xOf(n - 1) + 6}
              y={yOf(lastVal) + 3}
              fontSize={10} fontWeight={700}
              fill={s.color}
              fontFamily="var(--font-mono, monospace)"
            >
              {s.label}
            </text>
          );
        })}

        {/* Crosshair line */}
        {hoverX !== null && (
          <line
            x1={hoverX} x2={hoverX} y1={0} y2={VB_H}
            stroke="var(--foreground)" strokeWidth={0.75} strokeOpacity={0.3}
            strokeDasharray="4 3"
          />
        )}

        {/* Crosshair dots — coloured ring using a darker shade of each line */}
        {hoverIdx !== null && tooltipEntries.map(e => (
          e.val !== null ? (
            <circle
              key={`dot-${e.label}`}
              cx={hoverX!} cy={yOf(e.val!)}
              r={4}
              fill={e.color}
              stroke="var(--popover)"
              strokeWidth={2}
            />
          ) : null
        ))}

        {/* Floating tooltip */}
        {hoverX !== null && tooltipEntries.length > 0 && (() => {
          const TW = 155;
          const rowH = 17;
          const TH = 16 + tooltipEntries.length * rowH + 4;
          const tx = tooltipOnRight ? hoverX! + 12 : hoverX! - TW - 12;
          const ty = 6;
          return (
            <g>
              <rect x={tx} y={ty} width={TW} height={TH} rx={6}
                fill="var(--popover)" stroke="var(--border)" strokeWidth={0.75}
                filter="drop-shadow(0 2px 6px rgba(0,0,0,0.12))"
              />
              {tooltipEntries.map((e, i) => (
                <g key={e.label}>
                  <rect x={tx + 8} y={ty + 11 + i * rowH} width={7} height={7} rx={1.5} fill={e.color} />
                  <text x={tx + 20} y={ty + 18 + i * rowH}
                    fontSize={9.5} fontWeight={700}
                    fill="var(--foreground)" fontFamily="var(--font-mono, monospace)">
                    {e.label}
                  </text>
                  <text x={tx + TW - 8} y={ty + 18 + i * rowH}
                    fontSize={9.5} textAnchor="end" fontWeight={600}
                    fill={e.delta! >= 0 ? '#4E6040' : 'var(--primary)'}
                    fontFamily="var(--font-mono, monospace)">
                    {e.val!.toFixed(1)}
                    <tspan fontSize={8} fill="var(--muted-foreground)" fontWeight={400}>
                      {' '}{e.delta! >= 0 ? '+' : ''}{e.delta!.toFixed(1)}%
                    </tspan>
                  </text>
                </g>
              ))}
            </g>
          );
        })()}
      </svg>

      {/* Period selector pills */}
      <div className="bop-period-row">
        {PERIODS.map(p => (
          <button
            key={p}
            type="button"
            className="bop-period-pill"
            data-active={p === period ? '' : undefined}
            onClick={() => onPeriodChange(p)}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
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

export const BenchmarkOverlayPanel: React.FC<BenchmarkOverlayPanelProps> = ({ defaultSymbol = 'AAPL', onSaveSession }) => {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [draft, setDraft] = useState(defaultSymbol);
  // Start with SPY as the first benchmark
  const [benchmarks, setBenchmarks] = useState<string[]>(['SPY']);
  const [addingBenchmark, setAddingBenchmark] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<PeriodKey>('All');

  const toggleHidden = (label: string) =>
    setHidden(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  // Always call exactly MAX_BENCHMARKS hooks — pass null for empty slots
  const b0 = useOHLCV(benchmarks[0] ?? null, '1day', 504);
  const b1 = useOHLCV(benchmarks[1] ?? null, '1day', 504);
  const b2 = useOHLCV(benchmarks[2] ?? null, '1day', 504);
  const b3 = useOHLCV(benchmarks[3] ?? null, '1day', 504);
  const b4 = useOHLCV(benchmarks[4] ?? null, '1day', 504);
  const b5 = useOHLCV(benchmarks[5] ?? null, '1day', 504);
  const b6 = useOHLCV(benchmarks[6] ?? null, '1day', 504);
  const b7 = useOHLCV(benchmarks[7] ?? null, '1day', 504);
  const b8 = useOHLCV(benchmarks[8] ?? null, '1day', 504);
  const b9 = useOHLCV(benchmarks[9] ?? null, '1day', 504);
  const benchData = [b0, b1, b2, b3, b4, b5, b6, b7, b8, b9];

  const asset = useOHLCV(symbol, '1day', 504);
  // BenchmarkIntelligencePanel is driven by the first benchmark only
  const intel = useBenchmarkIntelligence(symbol, benchmarks[0] ?? 'SPY');

  const overlay = useMemo(() => {
    const aBars = asset.data?.bars ?? [];
    if (aBars.length < 30) return null;

    const series: Array<{ label: string; values: number[]; n: number }> = [];
    for (let i = 0; i < benchmarks.length; i++) {
      const bBars = benchData[i].data?.bars ?? [];
      if (bBars.length < 30) continue;
      const aligned = alignClosesByTs(aBars, bBars);
      if (aligned.a.length < 30) continue;
      series.push({ label: benchmarks[i], values: rebase100(aligned.b), n: aligned.a.length });
    }
    if (!series.length) return null;

    return {
      asset: rebase100((() => {
        // rebase asset against the first valid aligned series
        const bBars = benchData[0].data?.bars ?? [];
        if (bBars.length < 30) return aBars.map(b => b.close);
        return alignClosesByTs(aBars, bBars).a;
      })()),
      benchSeries: series,
      n: series[0]?.n ?? 0,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.data, b0.data, b1.data, b2.data, b3.data, b4.data, b5.data, b6.data, b7.data, b8.data, b9.data, benchmarks]);

  const loading = asset.loading || benchData.slice(0, benchmarks.length).some(b => b.loading);

  const addBenchmark = (sym: string) => {
    const upper = sym.toUpperCase();
    if (!upper || benchmarks.includes(upper) || benchmarks.length >= MAX_BENCHMARKS) return;
    setBenchmarks(prev => [...prev, upper]);
    setAddingBenchmark(false);
  };

  const removeBenchmark = (sym: string) => {
    setBenchmarks(prev => prev.filter(b => b !== sym));
  };

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <section className="ds-surface" style={{ padding: 16, borderRadius: 10, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h2 className="ds-heading" style={{ margin: 0 }}>Benchmark overlay</h2>

          {/* Benchmark chips + add button */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            {benchmarks.map((b, i) => (
              <span key={b} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 8px 3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                background: 'var(--muted)', border: '1px solid var(--border)',
                color: 'var(--foreground)',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[i + 1], flexShrink: 0 }} />
                {b}
                <button
                  type="button"
                  onClick={() => removeBenchmark(b)}
                  className="bop-bench-chip-remove"
                  aria-label={`Remove ${b}`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}

            {benchmarks.length < MAX_BENCHMARKS && !addingBenchmark && (
              <button
                type="button"
                onClick={() => setAddingBenchmark(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: 'transparent', border: '1px dashed var(--border)',
                  cursor: 'pointer', color: 'var(--muted-foreground)',
                }}
              >
                <Plus size={11} /> Add benchmark
              </button>
            )}

            {addingBenchmark && (
              <div className="bop-add-search">
                <InstrumentSelector
                  onSelect={addBenchmark}
                  placeholder="Search symbol…"
                />
              </div>
            )}
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
            Loading {symbol} and benchmark histories…
          </p>
        )}

        {!loading && !overlay && (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
            Need ≥30 overlapping daily bars between {symbol} and the selected benchmarks.
          </p>
        )}

        {overlay && (() => {
          const allSeries = [
            { label: symbol, values: overlay.asset, color: PALETTE[0] },
            ...overlay.benchSeries.map((s, i) => ({
              label: s.label, values: s.values, color: PALETTE[i + 1],
            })),
          ];
          return (
            <>
              {/* Interactive legend — click to toggle visibility */}
              <div className="bop-legend-row">
                {allSeries.map(s => {
                  const isHidden = hidden.has(s.label);
                  return (
                    <button
                      key={s.label}
                      type="button"
                      className="bop-legend-chip"
                      data-hidden={isHidden ? '' : undefined}
                      onClick={() => toggleHidden(s.label)}
                      title={isHidden ? `Show ${s.label}` : `Hide ${s.label}`}
                    >
                      <span className="bop-legend-swatch" style={{ '--swatch': s.color } as React.CSSProperties} />
                      {s.label}
                    </button>
                  );
                })}
                <span className="bop-legend-meta">
                  Rebased 100 · {overlay.n} aligned bars
                  {hidden.size > 0 && (
                    <button
                      type="button"
                      className="bop-legend-reset"
                      onClick={() => setHidden(new Set())}
                    >
                      show all
                    </button>
                  )}
                </span>
              </div>
              <OverlayLines series={allSeries} hidden={hidden} period={period} onPeriodChange={setPeriod} />
            </>
          );
        })()}
      </section>

      <BenchmarkIntelligencePanel symbol={symbol} />

      {intel.snapshot && onSaveSession && (
        <div>
          <button
            onClick={() => onSaveSession({
              name: `${symbol} vs ${benchmarks.join(', ')} benchmark`,
              panel: 'alpha',
              symbols: [symbol, ...benchmarks],
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
