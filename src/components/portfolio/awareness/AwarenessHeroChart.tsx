/**
 * AwarenessHeroChart — single calm visual anchor for the awareness hero.
 *
 * Pure SVG, no recharts, no axes, no grid. Two lines (portfolio thicker,
 * benchmark thinner dashed) with a soft area fill between them — green
 * where the portfolio leads, red where it trails. Two return badges sit
 * at the right edge.
 *
 * Design intent:
 *   - Calm. Reads like a horizon strip on an institutional report.
 *   - One image answers "did I outperform, and was the ride rough?".
 *   - Zero competition with the headline above. No interaction by default.
 *
 * Input is the `performanceSeries` already produced by
 * `usePortfolioPerformance` — both lines arrive rebased to 100.
 */

import React, { useMemo } from 'react';

export interface AwarenessHeroChartPoint {
  ts: number;
  portfolio: number;
  benchmark: number;
}

interface Props {
  series: AwarenessHeroChartPoint[];
  benchmarkId?: string;
  /** SVG viewport width in pixels. Component is responsive via viewBox. */
  width?: number;
  /** SVG viewport height in pixels. */
  height?: number;
}

const PORTFOLIO_COLOR = 'var(--primary)';
const BENCHMARK_COLOR = 'var(--muted-foreground)';
const AHEAD_FILL      = 'rgba(16, 185, 129, 0.10)';  // emerald
const BEHIND_FILL     = 'rgba(239, 68, 68, 0.10)';   // red
const ZERO_LINE       = 'var(--border)';

function fmtPctSigned(v: number): string {
  if (!isFinite(v)) return '—';
  const s = (v * 100).toFixed(2);
  return v >= 0 ? `+${s}%` : `${s}%`;
}

interface Scaled { x: number; portfolio: number; benchmark: number }

function buildPath(points: Scaled[], key: 'portfolio' | 'benchmark'): string {
  if (points.length === 0) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p[key].toFixed(2)}`).join(' ');
}

/**
 * Build a filled area between portfolio and benchmark for the contiguous
 * sub-range where portfolio is on the requested side of benchmark.
 * Returns an array of path strings (one per crossing-bounded segment).
 */
function buildAreaSegments(
  points: Scaled[],
  side: 'above' | 'below',
): string[] {
  const segments: string[] = [];
  let run: Scaled[] = [];

  const isOnSide = (p: Scaled): boolean =>
    side === 'above' ? p.portfolio <= p.benchmark : p.portfolio >= p.benchmark;
  // Note: y axis is inverted in screen space — "above" benchmark in return
  // terms means a *smaller* y value in our scaled output. We invert below
  // when calling the area builder so the visual is correct.

  const flush = () => {
    if (run.length < 2) { run = []; return; }
    // Top edge — portfolio
    const top = run.map(p => `${p.x.toFixed(2)},${p.portfolio.toFixed(2)}`).join(' L ');
    // Bottom edge — benchmark, reversed
    const bottom = [...run].reverse().map(p => `${p.x.toFixed(2)},${p.benchmark.toFixed(2)}`).join(' L ');
    segments.push(`M ${top} L ${bottom} Z`);
    run = [];
  };

  for (const p of points) {
    if (isOnSide(p)) {
      run.push(p);
    } else {
      flush();
    }
  }
  flush();
  return segments;
}

export const AwarenessHeroChart: React.FC<Props> = ({
  series,
  benchmarkId,
  width = 1180,
  height = 120,
}) => {
  const view = useMemo(() => {
    if (!series || series.length < 2) return null;
    const xs = series.map(p => p.ts);
    const ys = series.flatMap(p => [p.portfolio, p.benchmark]);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);

    // Generous vertical padding so the line never touches edges.
    const PAD_Y = 12;
    const PAD_X = 0;
    const innerW = width - PAD_X * 2;
    const innerH = height - PAD_Y * 2;
    const spanX = xMax - xMin || 1;
    const spanY = yMax - yMin || 1;

    const scaled: Scaled[] = series.map(p => ({
      x: PAD_X + ((p.ts - xMin) / spanX) * innerW,
      // Note: SVG y is inverted; higher rebased value → smaller y.
      portfolio: PAD_Y + (1 - (p.portfolio - yMin) / spanY) * innerH,
      benchmark: PAD_Y + (1 - (p.benchmark - yMin) / spanY) * innerH,
    }));

    const portfolioPath = buildPath(scaled, 'portfolio');
    const benchmarkPath = buildPath(scaled, 'benchmark');

    // For the ahead-fill we want the region where portfolio.value >= benchmark.value.
    // In screen space that's where portfolio.y <= benchmark.y. Reuse the helper:
    const aheadSegments = buildAreaSegments(scaled, 'above');  // portfolio.y <= benchmark.y
    const behindSegments = buildAreaSegments(scaled, 'below'); // portfolio.y >= benchmark.y

    // Final return values — last point in series.
    const last = series[series.length - 1];
    const first = series[0];
    const portfolioReturn = first.portfolio > 0 ? (last.portfolio / first.portfolio) - 1 : 0;
    const benchmarkReturn = first.benchmark > 0 ? (last.benchmark / first.benchmark) - 1 : 0;

    return {
      scaled, portfolioPath, benchmarkPath,
      aheadSegments, behindSegments,
      portfolioReturn, benchmarkReturn,
      lastX: scaled[scaled.length - 1].x,
      lastPortY: scaled[scaled.length - 1].portfolio,
      lastBenchY: scaled[scaled.length - 1].benchmark,
    };
  }, [series, width, height]);

  if (!view) {
    return (
      <div style={{
        height, marginTop: 22,
        border: '1px dashed var(--border)', borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--muted-foreground)', fontSize: 11,
      }}>
        Performance series will appear once at least two sessions of returns have loaded.
      </div>
    );
  }

  const portfolioAhead = view.portfolioReturn >= view.benchmarkReturn;

  return (
    <figure
      aria-label="Portfolio versus benchmark — one year, rebased to 100"
      style={{
        margin: '22px 0 0',
        padding: '14px 16px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--card)',
      }}
    >
      {/* Header strip */}
      <figcaption style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12, marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            <span style={{
              width: 10, height: 2, background: PORTFOLIO_COLOR, borderRadius: 1,
            }} />
            Portfolio
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            <span style={{
              width: 10, height: 0, borderTop: `1.5px dashed ${BENCHMARK_COLOR}`,
            }} />
            {benchmarkId ?? 'Benchmark'}
          </span>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--muted-foreground)', opacity: 0.65,
        }}>
          1Y · rebased to 100
        </span>
      </figcaption>

      {/* SVG */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        role="img"
        style={{ display: 'block' }}
      >
        {/* Ahead fill (green) */}
        {view.aheadSegments.map((d, i) => (
          <path key={`ahead-${i}`} d={d} fill={AHEAD_FILL} stroke="none" />
        ))}
        {/* Behind fill (red) */}
        {view.behindSegments.map((d, i) => (
          <path key={`behind-${i}`} d={d} fill={BEHIND_FILL} stroke="none" />
        ))}
        {/* Benchmark line (dashed, muted) */}
        <path
          d={view.benchmarkPath}
          fill="none"
          stroke={BENCHMARK_COLOR}
          strokeWidth={1.25}
          strokeDasharray="4 3"
          strokeLinecap="round"
        />
        {/* Portfolio line (solid, primary) */}
        <path
          d={view.portfolioPath}
          fill="none"
          stroke={PORTFOLIO_COLOR}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* End-of-series dots */}
        <circle cx={view.lastX} cy={view.lastBenchY} r={2.5} fill={BENCHMARK_COLOR} />
        <circle cx={view.lastX} cy={view.lastPortY}  r={3}   fill={PORTFOLIO_COLOR} />
      </svg>

      {/* Footer strip — return labels, calm */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12, marginTop: 8,
      }}>
        <span style={{
          fontSize: 11, color: 'var(--muted-foreground)', letterSpacing: '0.02em',
        }}>
          {portfolioAhead
            ? `Portfolio is ahead of ${benchmarkId ?? 'benchmark'} on the period`
            : `Portfolio is behind ${benchmarkId ?? 'benchmark'} on the period`}
        </span>
        <span style={{
          display: 'inline-flex', gap: 14, alignItems: 'baseline',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: PORTFOLIO_COLOR }}>
            {fmtPctSigned(view.portfolioReturn)}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: BENCHMARK_COLOR }}>
            {fmtPctSigned(view.benchmarkReturn)}
          </span>
        </span>
      </div>
    </figure>
  );
};
