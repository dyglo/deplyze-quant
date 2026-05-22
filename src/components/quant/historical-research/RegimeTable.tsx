/**
 * RegimeTable — per-regime comparison table.
 *
 * Renders when the planner extracted named windows from the user's question
 * (e.g. "2015–2018, 2022–2023"). Each row shows the regime spec; columns show
 * each asset's return / max drawdown / vol plus the pairwise correlation set
 * for the regime. This is the widget that directly answers "how did X behave
 * during regime Y" — without it, the page would dump full-window stats and
 * miss the question.
 */

import React from 'react';
import type { RegimeMetrics } from '../../../lib/historicalResearchAnalytics';
import { Explainer } from './Explainer';

interface Props {
  regimes: RegimeMetrics[];
  symbols: string[];
}

export const RegimeTable: React.FC<Props> = ({ regimes, symbols }) => {
  if (!regimes.length) return null;

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thLeft}>Regime</th>
              <th style={thLeft}>Window</th>
              {symbols.map((s) => (
                <th key={s} style={th}>{s}<div style={subHead}>ret · DD · vol</div></th>
              ))}
              {symbols.length >= 2 && <th style={th}>Pair corr</th>}
            </tr>
          </thead>
          <tbody>
            {regimes.map((rm) => (
              <tr key={`${rm.spec.label}-${rm.spec.start}`}>
                <td style={tdLeft}>
                  <div style={{ fontWeight: 500, color: 'var(--foreground)' }}>{rm.spec.label}</div>
                  {rm.spec.hypothesis && (
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>{rm.spec.hypothesis}</div>
                  )}
                </td>
                <td style={tdLeft}>
                  <Mono>{rm.spec.start.slice(0, 7)} → {rm.spec.end.slice(0, 7)}</Mono>
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>
                    {rm.bars.toLocaleString()} bars
                  </div>
                </td>
                {symbols.map((s) => {
                  const m = rm.perAsset.find((a) => a.symbol === s);
                  if (!m || m.bars < 5) {
                    return <td key={s} style={tdNA}>—</td>;
                  }
                  return (
                    <td key={s} style={td}>
                      <div style={{ fontWeight: 500, color: signColor(m.totalReturn) }}>{pct(m.totalReturn)}</div>
                      <div style={subValue}>{pct(m.maxDrawdown)} · {pct(m.annVol)}</div>
                    </td>
                  );
                })}
                {symbols.length >= 2 && (
                  <td style={td}>
                    {rm.pairwiseCorrelations.length === 0
                      ? <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                      : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {rm.pairwiseCorrelations.map((p) => (
                            <Mono key={`${p.a}-${p.b}`}>
                              {p.a}/{p.b} {p.r.toFixed(2)}
                            </Mono>
                          ))}
                        </div>
                      )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Explainer text={explain(regimes, symbols)} />
    </div>
  );
};

function explain(regimes: RegimeMetrics[], symbols: string[]): string {
  if (!regimes.length || !symbols.length) return '';
  const valid = regimes.filter((r) => !r.insufficient);
  if (valid.length === 0) return 'No regime in your question overlapped the available history — try widening the lookback or naming a different period.';

  const focus = symbols[0];
  const parts: string[] = [];
  for (const rm of valid) {
    const a = rm.perAsset.find((x) => x.symbol === focus);
    if (!a || a.bars < 5) continue;
    let line = `${rm.spec.label}: ${focus} ${pct(a.totalReturn)} (max DD ${pct(a.maxDrawdown)})`;
    if (symbols.length > 1) {
      const b = rm.perAsset.find((x) => x.symbol === symbols[1]);
      if (b && b.bars >= 5) {
        line += `, ${symbols[1]} ${pct(b.totalReturn)}`;
        const corr = rm.pairwiseCorrelations.find((p) =>
          (p.a === focus && p.b === symbols[1]) || (p.b === focus && p.a === symbols[1]),
        );
        if (corr) line += `, corr ${corr.r.toFixed(2)}`;
      }
    }
    parts.push(line + '.');
  }
  return parts.join(' ');
}

function pct(x: number): string { return `${(x * 100).toFixed(1)}%`; }

function signColor(x: number): string {
  if (x > 0.001) return 'var(--success, #4E6040)';
  if (x < -0.001) return 'var(--danger, #A04848)';
  return 'var(--foreground)';
}

const Mono: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: 11,
    color: 'var(--muted-foreground)',
  }}>{children}</span>
);

// ─── styles ───────────────────────────────────────────────────────────────

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
};
const th: React.CSSProperties = {
  textAlign: 'right',
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--muted-foreground)',
  fontWeight: 500,
  fontSize: 11,
  letterSpacing: 0.3,
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};
const thLeft: React.CSSProperties = { ...th, textAlign: 'left' };
const subHead: React.CSSProperties = { fontSize: 9, color: 'var(--muted-foreground)', textTransform: 'none', letterSpacing: 0, marginTop: 1, fontWeight: 400 };
const td: React.CSSProperties = {
  padding: '10px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--foreground)',
  textAlign: 'right',
  verticalAlign: 'top',
};
const tdLeft: React.CSSProperties = { ...td, textAlign: 'left' };
const tdNA: React.CSSProperties = { ...td, color: 'var(--muted-foreground)' };
const subValue: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--muted-foreground)',
  marginTop: 2,
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
};
