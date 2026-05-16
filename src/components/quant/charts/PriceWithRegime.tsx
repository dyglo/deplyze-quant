/**
 * PriceWithRegime — long-horizon price chart with regime-shaded background,
 * optional event markers, and inline editorial annotations.
 *
 * Inspired by the Visual Capitalist 200-year sector-stream chart: regime
 * states render as semi-transparent vertical bands behind the price line so
 * structural context is read instantly; analog windows, scenario matches,
 * or extreme triggers can be projected onto the same x-axis via the
 * `events` prop with inline labels for the most significant ones.
 *
 * Pure-SVG, no charting library. Y-axis is log-scaled when `logScale` is
 * true (recommended for ≥ 10-year horizons).
 */

import React, { useMemo } from 'react';
import type { RegimeRibbonBlock } from './RegimeRibbon';
import { paletteForRegime } from './regimePalette';
import './PriceWithRegime.css';

export interface PriceEventMarker {
  ts: number;
  /** Marker color; defaults to var(--primary). */
  color?: string;
  /** Optional label rendered above the price line. */
  label?: string;
  /** Optional 1-line annotation displayed when this marker is the "annotated" one. */
  annotation?: string;
}

interface BenchmarkSeries {
  ts: number[];
  close: number[];
  label: string;
}

interface Props {
  /** Parallel arrays — ts ascending. */
  ts: number[];
  close: number[];
  /** Optional second series (benchmark) drawn rebased-to-100 on the same axis. */
  benchmark?: BenchmarkSeries;
  /** Optional regime blocks rendered as background bands. */
  regimes?: RegimeRibbonBlock[];
  /** Optional event markers projected onto the x-axis. */
  events?: PriceEventMarker[];
  /** Height in pixels. Default 220. */
  height?: number;
  /** Log scale on the y-axis. Default true. */
  logScale?: boolean;
  /** Title rendered in the top-left corner of the chart. */
  title?: string;
  /** Caption in the top-right (e.g. "10Y · 2,520 bars"). */
  caption?: string;
}

export const PriceWithRegime: React.FC<Props> = ({
  ts, close, benchmark, regimes = [], events = [],
  height = 220, logScale = true, title, caption,
}) => {
  const W = 1000;
  const H = height;
  const PAD = { top: 24, right: 64, bottom: 24, left: 8 };

  const { points, benchPoints, xFor, axisYears, yTicks, xMin, xMax, minClose, maxClose } = useMemo(() => {
    if (!ts.length || ts.length !== close.length) {
      return {
        points: '', benchPoints: '',
        xFor: (_t: number) => 0,
        axisYears: [] as number[],
        yTicks: [] as Array<{ value: number; y: number }>,
        xMin: 0, xMax: 0, minClose: 0, maxClose: 0,
      };
    }

    // Find overlap start for rebasing both series to 100
    const xMin = ts[0], xMax = ts[ts.length - 1];
    const xSpan = Math.max(1, xMax - xMin);

    // Rebase primary to 100 at first bar
    const base0 = close.find(c => c > 0) ?? 1;
    const rebased = close.map(c => c > 0 ? (c / base0) * 100 : NaN);

    // Rebase benchmark to 100 at its first bar that falls within primary range
    let benchRebased: Array<{ t: number; v: number }> = [];
    if (benchmark && benchmark.ts.length && benchmark.close.length) {
      const bBase = benchmark.close.find((c, i) => c > 0 && benchmark.ts[i] >= xMin) ?? 1;
      for (let i = 0; i < benchmark.ts.length; i++) {
        const t = benchmark.ts[i], c = benchmark.close[i];
        if (t < xMin || t > xMax || !(c > 0)) continue;
        benchRebased.push({ t, v: (c / bBase) * 100 });
      }
    }

    // Y scale across both series
    const allVals = rebased.filter(v => !isNaN(v)).concat(benchRebased.map(b => b.v));
    const minClose = Math.min(...allVals);
    const maxClose = Math.max(...allVals);
    const valid = close.filter(c => c > 0);  // keep raw for axis labels

    const transform = logScale
      ? (v: number) => Math.log(Math.max(v, 1e-9))
      : (v: number) => v;
    const yMin = transform(minClose);
    const yMax = transform(maxClose);
    const ySpan = Math.max(1e-9, yMax - yMin);

    const innerLeft = PAD.left;
    const innerRight = W - PAD.right;
    const innerTop = PAD.top;
    const innerBottom = H - PAD.bottom;

    const xFor = (t: number) => innerLeft + ((t - xMin) / xSpan) * (innerRight - innerLeft);
    const yFor = (v: number) => innerBottom - ((transform(v) - yMin) / ySpan) * (innerBottom - innerTop);

    // Primary path
    const parts: string[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (isNaN(rebased[i])) continue;
      parts.push(`${parts.length === 0 ? 'M' : 'L'} ${xFor(ts[i]).toFixed(1)} ${yFor(rebased[i]).toFixed(1)}`);
    }

    // Benchmark path
    const bParts: string[] = [];
    for (const { t, v } of benchRebased) {
      bParts.push(`${bParts.length === 0 ? 'M' : 'L'} ${xFor(t).toFixed(1)} ${yFor(v).toFixed(1)}`);
    }

    // X-axis years
    const startYear = new Date(xMin).getUTCFullYear();
    const endYear = new Date(xMax).getUTCFullYear();
    const totalYears = Math.max(1, endYear - startYear);
    const stride = totalYears <= 4 ? 1 : totalYears <= 12 ? 2 : totalYears <= 30 ? 5 : 10;
    const axisYears: number[] = [];
    for (let y = Math.ceil(startYear / stride) * stride; y <= endYear; y += stride) axisYears.push(y);

    // Y-axis ticks: show rebased scale (100 = start)
    const yTicks: Array<{ value: number; y: number }> = [];
    const N = 4;
    for (let k = 0; k <= N; k++) {
      const tVal = logScale
        ? Math.exp(yMin + (k / N) * ySpan)
        : yMin + (k / N) * ySpan;
      yTicks.push({ value: tVal, y: yFor(tVal) });
    }

    return {
      points: parts.join(' '),
      benchPoints: bParts.join(' '),
      xFor, axisYears, yTicks, xMin, xMax,
      minClose: Math.min(...valid),
      maxClose: Math.max(...valid),
    };
  }, [ts, close, benchmark, logScale, H]);

  if (!ts.length || !close.length) {
    return (
      <div style={emptyStyle(H)}>
        <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
          No price history available.
        </p>
      </div>
    );
  }

  const xSpan = Math.max(1, xMax - xMin);

  return (
    <div style={{
      position: 'relative',
      borderRadius: 12,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      padding: 12,
      overflow: 'hidden',
    }}>
      {(title || caption) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          {title && <strong style={{ fontSize: 12, letterSpacing: '0.01em' }}>{title}</strong>}
          {caption && <span className="ds-caption" style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{caption}</span>}
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
        {/* Regime shading */}
        {regimes.map((r, i) => {
          const left = xFor(Math.max(r.startTs, xMin));
          const right = xFor(Math.min(r.endTs, xMax));
          const color = r.color ?? paletteForRegime(r.key);
          return (
            <rect
              key={`${r.key}-${r.startTs}-${i}`}
              x={left}
              y={PAD.top}
              width={Math.max(0, right - left)}
              height={H - PAD.top - PAD.bottom}
              fill={color}
              opacity={0.10}
            >
              <title>{`${r.label} · ${formatRange(r.startTs, r.endTs)}`}</title>
            </rect>
          );
        })}

        {/* Y-axis gridlines + labels (right-aligned) */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={t.y}
              y2={t.y}
              stroke="var(--border)"
              strokeOpacity={i === 0 || i === yTicks.length - 1 ? 0.6 : 0.3}
              strokeDasharray={i === 0 || i === yTicks.length - 1 ? '0' : '2 3'}
            />
            <text
              x={W - PAD.right + 4}
              y={t.y + 3}
              fontSize={9}
              fontFamily="inherit"
              fill="var(--muted-foreground)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatPrice(t.value)}
            </text>
          </g>
        ))}

        {/* Event markers (vertical dotted lines) */}
        {events.map((e, i) => {
          const xPos = xFor(e.ts);
          const color = e.color ?? 'var(--primary)';
          return (
            <g key={`${e.ts}-${i}`}>
              <line
                x1={xPos} x2={xPos}
                y1={PAD.top} y2={H - PAD.bottom}
                stroke={color}
                strokeDasharray="2 3"
                strokeWidth={1}
                opacity={0.8}
              />
              {e.label && (
                <g transform={`translate(${xPos}, ${PAD.top - 6})`}>
                  <text
                    fontSize={9}
                    textAnchor="middle"
                    fill={color}
                    fontWeight={700}
                    style={{ letterSpacing: '0.02em' }}
                  >
                    {e.label}
                  </text>
                </g>
              )}
              <circle cx={xPos} cy={PAD.top} r={3} fill={color} />
            </g>
          );
        })}

        {/* Benchmark line — drawn before primary so primary is always on top */}
        {benchPoints && (
          <path
            d={benchPoints}
            fill="none"
            stroke="var(--chart-2, #4a90d9)"
            strokeWidth={1.4}
            strokeDasharray="5 3"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.85}
          />
        )}

        {/* Primary price line */}
        <path d={points} fill="none" stroke="var(--foreground)" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />

        {/* X-axis year ticks */}
        {axisYears.map((y) => {
          const ts2 = Date.UTC(y, 0, 1);
          if (ts2 < xMin || ts2 > xMax) return null;
          const xPos = xFor(ts2);
          return (
            <g key={y}>
              <line x1={xPos} x2={xPos} y1={H - PAD.bottom} y2={H - PAD.bottom + 3} stroke="var(--muted-foreground)" />
              <text
                x={xPos} y={H - PAD.bottom + 14}
                fontSize={9} fontFamily="inherit"
                fill="var(--muted-foreground)"
                textAnchor="middle"
                style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}
              >
                {y}
              </text>
            </g>
          );
        })}
      </svg>

      {/* First / last close annotations (inline labels, like Visual Capitalist) */}
      <div style={{
        position: 'absolute',
        top: 6, right: 12,
        display: 'flex', gap: 10,
        fontSize: 10,
        color: 'var(--muted-foreground)',
        fontVariantNumeric: 'tabular-nums',
        pointerEvents: 'none',
      }}>
        <span>min {formatPrice(minClose)}</span>
        <span>max {formatPrice(maxClose)}</span>
        <span>n {ts.length}</span>
        <span>{formatYear(xMin)}–{formatYear(xMax)}</span>
      </div>

      {/* Benchmark legend */}
      {benchmark && (
        <div className="pwr-bench-legend">
          <span className="pwr-bench-leg-item">
            <span className="pwr-bench-leg-swatch" />
            {title ? title.split('·')[0].trim() : 'Primary'}
            <span className="pwr-bench-leg-sub">rebased 100</span>
          </span>
          <span className="pwr-bench-leg-item">
            <span className="pwr-bench-leg-swatch-bench" />
            {benchmark.label}
            <span className="pwr-bench-leg-sub">rebased 100</span>
          </span>
        </div>
      )}

      {/* Annotated event below the chart (most significant marker) */}
      {events.find(e => e.annotation) && (
        <p className="ds-caption pwr-annotation">
          {events.filter(e => e.annotation).slice(0, 1).map(e => (
            <span key={e.ts}>
              <strong className="pwr-annotation-label">{e.label}:</strong> {e.annotation}
            </span>
          ))}
        </p>
      )}
    </div>
  );
};

function formatPrice(v: number): string {
  if (v >= 1000) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function formatYear(ts: number): string {
  return String(new Date(ts).getUTCFullYear());
}

function formatRange(a: number, b: number): string {
  return `${new Date(a).toISOString().slice(0, 10)} → ${new Date(b).toISOString().slice(0, 10)}`;
}

function emptyStyle(H: number): React.CSSProperties {
  return {
    height: H,
    borderRadius: 12,
    background: 'var(--card)',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}
