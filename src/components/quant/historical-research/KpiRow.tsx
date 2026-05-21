/**
 * KpiRow — top-of-result KPI strip, mirrors the Bagus Fikri "Sales performance
 * / Total Sales / Average Revenue / Average Order" row.
 *
 * Built dynamically from the result: a per-asset total-return KPI plus a
 * window/correlation KPI when relevant. Always 2 to 4 cards; never more.
 */

import React from 'react';
import { InfoTip } from './InfoTip';
import type { ResearchResult } from '../../../hooks/useHistoricalResearch';

interface Kpi {
  label: string;
  value: string;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  info?: string;
}

export const KpiRow: React.FC<{ result: ResearchResult }> = ({ result }) => {
  const kpis: Kpi[] = buildKpis(result);
  if (kpis.length === 0) return null;

  return (
    <div style={grid(kpis.length)}>
      {kpis.map((k) => (
        <div key={k.label} style={card}>
          <div style={labelRow}>
            <span style={labelStyle}>{k.label}</span>
            {k.info && <InfoTip text={k.info} />}
          </div>
          <div style={valueRow}>
            <span style={valueStyle}>{k.value}</span>
            {k.delta && (
              <span style={{
                ...deltaStyle,
                color: k.delta.direction === 'up'
                  ? 'var(--success, #4E6040)'
                  : k.delta.direction === 'down'
                  ? 'var(--destructive, #c75450)'
                  : 'var(--muted-foreground)',
              }}>
                {k.delta.direction === 'up' ? '↑' : k.delta.direction === 'down' ? '↓' : '→'} {k.delta.value}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── kpi extraction ──────────────────────────────────────────────────────

function buildKpis(r: ResearchResult): Kpi[] {
  const kpis: Kpi[] = [];

  // Window coverage (always shown)
  kpis.push({
    label: 'Window analyzed',
    value: `${r.dataWindow.actualYears.toFixed(1)}y`,
    info: `Actual coverage: ${r.dataWindow.actualStart} → ${r.dataWindow.actualEnd}. Requested ~${r.dataWindow.requestedYears}y.`,
  });

  // First two assets' total return → headline KPIs
  for (const t of r.totals.slice(0, 2)) {
    kpis.push({
      label: `${t.symbol} total return`,
      value: pct(t.totalReturn),
      delta: {
        value: 'over window',
        direction: t.totalReturn > 0 ? 'up' : t.totalReturn < 0 ? 'down' : 'flat',
      },
      info: 'Geometric return over the analysis window, before fees and slippage.',
    });
  }

  // Latest rolling correlation when available
  if (r.rollingCorrelations.length > 0 && kpis.length < 4) {
    const rc = r.rollingCorrelations[0];
    const series = rc.series;
    if (series.length > 0) {
      const last = series[series.length - 1].r;
      const prevIdx = Math.max(0, series.length - 21); // ~1 month back
      const ref = series[prevIdx].r;
      const dir = last > ref ? 'up' : last < ref ? 'down' : 'flat';
      kpis.push({
        label: `${rc.a}/${rc.b} corr (latest)`,
        value: last.toFixed(2),
        delta: { value: `from ${ref.toFixed(2)}`, direction: dir },
        info: `Latest 60-bar rolling Pearson, compared to ~1 month earlier. Full-window r = ${rc.overall.toFixed(2)}.`,
      });
    }
  }

  return kpis.slice(0, 4);
}

function pct(x: number): string { return `${(x * 100).toFixed(1)}%`; }

// ─── styles ──────────────────────────────────────────────────────────────

const grid = (count: number): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
  gap: 12,
});

const card: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--card)',
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
};

const labelRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 11,
  color: 'var(--muted-foreground)',
};
const labelStyle: React.CSSProperties = {
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

const valueRow: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
};

const valueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  color: 'var(--foreground)',
  letterSpacing: -0.3,
};

const deltaStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 500,
};
