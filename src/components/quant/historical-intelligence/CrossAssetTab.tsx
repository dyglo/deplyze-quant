/**
 * CrossAssetTab — rolling correlation matrix + dependency-shift signals
 * across SPY, QQQ, DXY (UUP), gold, oil, treasuries, FX, and the active
 * symbol.
 *
 * Builds a basket from a curated universe and the user's selected symbol,
 * pulls aligned histories from the gateway, and renders the existing
 * CorrelationHeatmap alongside a sorted dependency-shift table.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Network, AlertTriangle } from 'lucide-react';
import { fetchOHLCV } from '../../../services/marketService';
import { CorrelationHeatmap } from '../CorrelationHeatmap';
import { crossAssetIntelligence } from '../../../lib/quant';
import type { OHLCVBar, CorrelationSnapshot, CorrelationCell } from '../../../types';

const UNIVERSES: Array<{ label: string; symbols: string[] }> = [
  { label: 'Macro core',     symbols: ['SPY', 'QQQ', 'UUP', 'GLD', 'USO', 'TLT'] },
  { label: 'Equity sectors', symbols: ['XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLY'] },
  { label: 'FX majors',      symbols: ['EUR/USD', 'USD/JPY', 'GBP/USD', 'AUD/USD', 'USD/CHF'] },
  { label: 'Yields & risk',  symbols: ['TLT', 'IEF', 'HYG', 'LQD', 'TIP', 'BIL'] },
];

const HISTORY = 320;
const MIN_OVERLAP = 60;

export const CrossAssetTab: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [universeLabel, setUniverseLabel] = useState(UNIVERSES[0].label);
  const universe = UNIVERSES.find(u => u.label === universeLabel)!;
  const symbols = useMemo(() => {
    const set = new Set<string>(universe.symbols);
    if (symbol) set.add(symbol);
    return Array.from(set);
  }, [universe, symbol]);

  const [bars, setBars] = useState<Record<string, OHLCVBar[]>>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrors({});
    Promise.all(symbols.map(async (s) => {
      try {
        const r = await fetchOHLCV(s, '1day', HISTORY);
        return [s, r.bars, undefined] as const;
      } catch (e: unknown) {
        return [s, [] as OHLCVBar[], (e as Error).message] as const;
      }
    })).then((rows) => {
      if (cancelled) return;
      const next: Record<string, OHLCVBar[]> = {};
      const errs: Record<string, string> = {};
      for (const [s, bs, err] of rows) {
        next[s] = bs;
        if (err) errs[s] = err;
      }
      setBars(next);
      setErrors(errs);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [symbols.join('|')]);

  const intel = useMemo(() => {
    if (!Object.keys(bars).length) return null;
    return crossAssetIntelligence({ bars }, { minBars: MIN_OVERLAP, recentWindow: 21, baselineWindow: 126 });
  }, [bars]);

  const snapshot: CorrelationSnapshot | null = useMemo(() => {
    if (!intel?.matrix) return null;
    const { symbols, matrix, asOf, sampleSize } = intel.matrix;
    const cells: CorrelationCell[] = [];
    for (let i = 0; i < symbols.length; i++) {
      for (let j = 0; j < symbols.length; j++) {
        cells.push({
          rowSymbol: symbols[i],
          colSymbol: symbols[j],
          value: matrix[i][j],
          windowDays: sampleSize,
        });
      }
    }
    return { ts: asOf, windowDays: sampleSize, symbols, cells };
  }, [intel]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={iconWrap}><Network size={14} color="var(--primary)" /></span>
        <div style={{ flex: 1 }}>
          <h2 className="ds-heading" style={{ margin: 0 }}>Cross-asset relationships</h2>
          <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            Pearson on log returns · 21-bar window vs 126-bar baseline · dependency-shift detection.
          </p>
        </div>
        <div style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 8, background: 'var(--muted)', border: '1px solid var(--border)' }}>
          {UNIVERSES.map((u) => (
            <button
              key={u.label}
              onClick={() => setUniverseLabel(u.label)}
              style={{
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: u.label === universeLabel ? 700 : 500,
                color: u.label === universeLabel ? 'var(--foreground)' : 'var(--muted-foreground)',
                background: u.label === universeLabel ? 'var(--card)' : 'transparent',
                border: u.label === universeLabel ? '1px solid var(--border)' : '1px solid transparent',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {u.label}
            </button>
          ))}
        </div>
      </header>

      <section style={cardStyle}>
        <h3 className="ds-heading" style={{ margin: 0, fontSize: 13, marginBottom: 8 }}>Correlation matrix</h3>
        {loading ? (
          <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>Loading aligned histories…</p>
        ) : snapshot ? (
          <CorrelationHeatmap snapshot={snapshot} />
        ) : (
          <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            Not enough overlapping bars across the basket to compute the matrix.
          </p>
        )}
      </section>

      <section style={cardStyle}>
        <h3 className="ds-heading" style={{ margin: 0, fontSize: 13, marginBottom: 8 }}>Dependency shifts (most extreme |z| first)</h3>
        {!intel || intel.shifts.length === 0 ? (
          <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            No actionable correlation breakdowns at the configured windows.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--muted-foreground)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left' }}>
                <th style={th}>Pair</th>
                <th style={thNum}>21-bar</th>
                <th style={thNum}>126-bar</th>
                <th style={thNum}>Δ</th>
                <th style={thNum}>|z|</th>
                <th style={th}>State</th>
              </tr>
            </thead>
            <tbody>
              {intel.shifts.slice(0, 16).map((s, i) => {
                const color =
                  s.state === 'breakdown' ? 'var(--primary)' :
                  s.state === 'tightening' ? '#4E6040' :
                  s.state === 'loosening' ? '#C7884A' :
                  'var(--muted-foreground)';
                return (
                  <tr key={s.pair.join('|')} style={{ background: i % 2 ? 'var(--muted)' : 'transparent' }}>
                    <td style={td}><code style={{ fontSize: 11 }}>{s.pair.join(' ↔ ')}</code></td>
                    <td style={tdNum}>{s.current.toFixed(2)}</td>
                    <td style={tdNum}>{s.historical.toFixed(2)}</td>
                    <td style={{ ...tdNum, color }}>{s.delta > 0 ? '+' : ''}{s.delta.toFixed(2)}</td>
                    <td style={tdNum}>{Math.abs(s.zScore).toFixed(2)}</td>
                    <td style={{ ...td, color, fontWeight: 600 }}>{s.state}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {Object.entries(errors).length > 0 && (
        <section style={{ ...cardStyle, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <AlertTriangle size={14} color="var(--primary)" style={{ marginTop: 2 }} />
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
            Some symbols returned errors — they were skipped from the matrix:
            <ul style={{ margin: '4px 0 0 16px' }}>
              {Object.entries(errors).map(([s, msg]) => <li key={s}><strong>{s}</strong>: {msg}</li>)}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  padding: 14, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)',
};
const iconWrap: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
  border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const th: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border)' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '7px 8px', borderBottom: '1px solid var(--border)' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
