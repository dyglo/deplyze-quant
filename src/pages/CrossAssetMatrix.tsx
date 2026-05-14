import React, { useMemo, useState } from 'react';
import { useSWR } from '../hooks/useSWR';
import { fetchOHLCV } from '../services/marketService';
import { PageHeader } from '../components/quant/PageHeader';
import { CorrelationHeatmap } from '../components/quant/CorrelationHeatmap';
import { Disclaimer } from '../components/quant/Disclaimer';
import { FreshnessBadge } from '../components/quant/FreshnessBadge';
import { useDrawer } from '../components/quant/DataDrawer';
import { CorrelationDrawerBody } from '../components/quant/CorrelationDrawerBody';
import { logReturns, pearson } from '../lib/quant';
import type { CorrelationCell, CorrelationSnapshot, OHLCVBar } from '../types';

const UNIVERSES: Array<{ label: string; symbols: string[] }> = [
  { label: 'Macro core',  symbols: ['SPY', 'QQQ', 'GLD', 'TLT', 'UUP', 'BTC/USD'] },
  { label: 'US sectors',  symbols: ['XLF', 'XLK', 'XLE', 'XLY', 'XLV', 'XLI'] },
  { label: 'FX majors',   symbols: ['EUR/USD', 'USD/JPY', 'GBP/USD', 'AUD/USD', 'USD/CHF', 'USD/CAD'] },
];

const WINDOWS = [30, 60, 120] as const;
const HISTORY = 200;
const MIN_BARS = 20;

export const CrossAssetMatrix: React.FC = () => {
  const drawer = useDrawer();
  const [universe, setUniverse] = useState(UNIVERSES[0]);
  const [windowDays, setWindowDays] = useState<typeof WINDOWS[number]>(60);

  const bundle = useSWR(
    async () => {
      const results = await Promise.all(
        universe.symbols.map(async (sym) => {
          try {
            const r = await fetchOHLCV(sym, '1day', HISTORY);
            return { sym, bars: r.bars, error: undefined as string | undefined };
          } catch (e: unknown) {
            return { sym, bars: [] as OHLCVBar[], error: (e as Error).message };
          }
        }),
      );
      return results;
    },
    [universe.label],
    { cacheKey: `xasset:${universe.label}` },
  );

  const { snapshot, insufficient } = useMemo(() => {
    const insuf = new Set<string>();
    if (!bundle.data) return { snapshot: null as CorrelationSnapshot | null, insufficient: insuf };
    const returns = new Map<string, number[]>();
    for (const r of bundle.data) {
      const lr = logReturns(r.bars.map((b) => b.close));
      if (lr.length < MIN_BARS) insuf.add(r.sym);
      returns.set(r.sym, lr.slice(-windowDays));
    }
    const cells: CorrelationCell[] = [];
    for (let i = 0; i < universe.symbols.length; i++) {
      for (let j = i + 1; j < universe.symbols.length; j++) {
        const a = universe.symbols[i], b = universe.symbols[j];
        if (insuf.has(a) || insuf.has(b)) continue;
        const va = returns.get(a) ?? [];
        const vb = returns.get(b) ?? [];
        const n = Math.min(va.length, vb.length);
        if (n < MIN_BARS) continue;
        cells.push({ rowSymbol: a, colSymbol: b, value: pearson(va.slice(-n), vb.slice(-n)), windowDays });
      }
    }
    return {
      snapshot: { ts: Date.now(), windowDays, symbols: universe.symbols, cells } as CorrelationSnapshot,
      insufficient: insuf,
    };
  }, [bundle.data, universe.symbols, windowDays]);

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Cross-Asset Matrix"
        subtitle={`Rolling Pearson correlations of daily log-returns. Click any cell to open the relationship drawer with rolling history and recent moves.`}
        actions={
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <FreshnessBadge status={bundle.status} fetchedAt={bundle.fetchedAt} compact />
          </div>
        }
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {UNIVERSES.map((u) => {
            const on = universe.label === u.label;
            return (
              <button
                key={u.label}
                onClick={() => setUniverse(u)}
                style={{
                  padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                  background: on ? 'rgba(193, 95, 60, 0.06)' : 'transparent',
                  color: 'var(--foreground)', cursor: 'pointer',
                }}
              >
                {u.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindowDays(w)}
              style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                background: windowDays === w ? 'var(--primary)' : 'transparent',
                color: windowDays === w ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                border: 'none', cursor: 'pointer',
              }}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      {bundle.loading && !snapshot && (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Fetching OHLCV across the universe…</p>
      )}
      {bundle.error && !snapshot && (
        <p className="ds-caption" style={{ color: 'var(--primary)' }}>
          {bundle.error.message}{' '}
          <button onClick={() => bundle.refresh()} style={{
            background: 'transparent', border: 'none', color: 'var(--primary)',
            textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit',
          }}>Retry</button>
        </p>
      )}
      {snapshot && (
        <section className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
          {snapshot.cells.length === 0 ? (
            <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
              Insufficient overlapping bars to compute correlations for this universe at a {windowDays}-day window.
              {insufficient.size > 0 && (
                <> Missing: <span style={{ fontFamily: 'ui-monospace, monospace' }}>{Array.from(insufficient).join(', ')}</span>.</>
              )}
            </p>
          ) : (
            <CorrelationHeatmap
              snapshot={snapshot}
              insufficient={insufficient}
              onCellClick={(p) => drawer.open({
                title: `${p.a} ↔ ${p.b}`,
                subtitle: `Pearson ${p.value.toFixed(2)} · ${windowDays}-day window`,
                width: 560,
                body: <CorrelationDrawerBody a={p.a} b={p.b} reportedValue={p.value} window={windowDays} />,
              })}
            />
          )}
          <p className="ds-caption" style={{ marginTop: 10, color: 'var(--muted-foreground)' }}>
            Cells colour along the sage (positive) → terracotta (negative) axis. Symbols with fewer than
            {' '}{MIN_BARS} aligned bars are dimmed; cells touching them are omitted rather than zero-padded.
          </p>
        </section>
      )}

      <Disclaimer />
    </div>
  );
};
