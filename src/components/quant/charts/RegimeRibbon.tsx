/**
 * RegimeRibbon — horizontal strip of classified regime epochs over time.
 *
 * Inspired by the Visual Capitalist sector-stream chart: each contiguous
 * block of bars sharing a regime state is rendered as a coloured segment
 * whose width is proportional to its duration. Hovering a segment reveals
 * the regime label, span, and forward outcome.
 *
 * Pure-SVG render — no recharts dependency. Tree-shakes cleanly and
 * preserves the institutional look-and-feel.
 */

import React from 'react';
import { paletteForRegime } from './regimePalette';

export interface RegimeRibbonBlock {
  /** Inclusive start timestamp (unix ms) of the block. */
  startTs: number;
  /** Inclusive end timestamp (unix ms) of the block. */
  endTs: number;
  /** Stable composite regime key, e.g. "up|compressed|risk-on". */
  key: string;
  /** Human-readable short label rendered in the tooltip. */
  label: string;
  /** Token-aware color override; falls back to the deterministic palette. */
  color?: string;
}

interface Props {
  blocks: RegimeRibbonBlock[];
  /** Display height in pixels. Default 22. */
  height?: number;
  /** Render the axis years inline beneath the ribbon. */
  showYearAxis?: boolean;
  /** Optional click handler — useful for zooming into a regime epoch. */
  onSelect?: (block: RegimeRibbonBlock) => void;
}

// Color mapping for regime keys lives in regimePalette so the ribbon and
// PriceWithRegime background bands stay visually consistent.
const paletteFor = paletteForRegime;

export const RegimeRibbon: React.FC<Props> = ({ blocks, height = 22, showYearAxis = true, onSelect }) => {
  if (!blocks.length) {
    return (
      <div style={{ height, borderRadius: 4, background: 'var(--muted)', border: '1px solid var(--border)' }} />
    );
  }

  const minTs = Math.min(...blocks.map(b => b.startTs));
  const maxTs = Math.max(...blocks.map(b => b.endTs));
  const span = Math.max(1, maxTs - minTs);

  // Compute year tick positions if axis is requested.
  const years: number[] = [];
  if (showYearAxis) {
    const startYear = new Date(minTs).getUTCFullYear();
    const endYear = new Date(maxTs).getUTCFullYear();
    const totalYears = Math.max(1, endYear - startYear);
    const stride = totalYears <= 6 ? 1 : totalYears <= 12 ? 2 : totalYears <= 30 ? 5 : 10;
    for (let y = Math.ceil(startYear / stride) * stride; y <= endYear; y += stride) years.push(y);
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{
        position: 'relative',
        height,
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: 'var(--muted)',
      }}>
        {blocks.map((b, i) => {
          const left = ((b.startTs - minTs) / span) * 100;
          const width = Math.max(0.6, ((b.endTs - b.startTs) / span) * 100);
          const color = b.color ?? paletteFor(b.key);
          return (
            <button
              key={`${b.key}-${b.startTs}-${i}`}
              type="button"
              onClick={() => onSelect?.(b)}
              title={`${b.label}\n${formatDate(b.startTs)} → ${formatDate(b.endTs)}`}
              style={{
                position: 'absolute',
                top: 0, bottom: 0,
                left: `${left}%`,
                width: `${width}%`,
                background: color,
                border: 'none',
                padding: 0,
                cursor: onSelect ? 'pointer' : 'default',
                opacity: 0.78,
              }}
            />
          );
        })}
      </div>
      {showYearAxis && years.length > 0 && (
        <div style={{ position: 'relative', height: 14, marginTop: 2 }}>
          {years.map((y) => {
            const ts = Date.UTC(y, 0, 1);
            const left = ((ts - minTs) / span) * 100;
            if (left < 0 || left > 100) return null;
            return (
              <span
                key={y}
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  transform: 'translateX(-50%)',
                  fontSize: 9,
                  letterSpacing: '0.04em',
                  color: 'var(--muted-foreground)',
                  fontFamily: 'inherit',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {y}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Helper: collapse a per-bar regime key array into contiguous blocks ─────

/** Build a RegimeRibbonBlock[] from a parallel array of timestamps and keys.
 *  Adjacent equal keys collapse into single blocks; unknown / null entries
 *  are skipped. Useful when callers compute a per-bar regime classification. */
export function ribbonBlocksFromKeys(
  ts: number[],
  keys: Array<string | null | undefined>,
  labels?: Record<string, string>,
): RegimeRibbonBlock[] {
  const out: RegimeRibbonBlock[] = [];
  if (ts.length !== keys.length || ts.length === 0) return out;
  let runStart = 0;
  let runKey = keys[0];
  for (let i = 1; i <= keys.length; i++) {
    const k = keys[i];
    if (i === keys.length || k !== runKey) {
      if (runKey) {
        out.push({
          startTs: ts[runStart],
          endTs: ts[Math.min(i, ts.length) - 1],
          key: runKey,
          label: labels?.[runKey] ?? runKey,
        });
      }
      runStart = i;
      runKey = k;
    }
  }
  return out;
}
