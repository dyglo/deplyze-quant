/**
 * ContextStrip — the persistent visual anchor at the top of the Historical
 * Intelligence Terminal.
 *
 * Renders a long-horizon log-scale price line for the active symbol with:
 *   • a regime-shaded background built by re-classifying composite regimes
 *     at a coarse rolling step (Visual Capitalist sector-stream pattern),
 *   • the top historical analog windows as marker bands on the same axis,
 *   • a thin RegimeRibbon below the chart for fast regime-state scanning.
 *
 * Every HIT tab is rendered below this strip so visual context is never
 * more than a glance away — quant finance is visual, not tabular.
 */

import React, { useMemo } from 'react';
import { useOHLCV } from '../../../hooks/useMarket';
import {
  classifyMarketRegime,
  regimeStateKey,
  findHistoricalAnalogs,
  type MarketRegime,
} from '../../../lib/quant';
import { PriceWithRegime, type PriceEventMarker } from '../charts/PriceWithRegime';
import { RegimeRibbon, type RegimeRibbonBlock } from '../charts/RegimeRibbon';
import { paletteForRegime as paletteFor } from '../charts/regimePalette';

const HISTORY_BARS = 2520;       // ~10 years daily
const REGIME_STEP = 63;          // ~quarterly re-classification — keeps blocks readable
const REGIME_MIN_BARS = 280;
const ANALOG_TOP_K = 4;

interface Props {
  symbol: string;
  benchmark: string;
}

export const ContextStrip: React.FC<Props> = ({ symbol, benchmark }) => {
  const primary = useOHLCV(symbol, '1day', HISTORY_BARS);
  const benchOhlcv = useOHLCV(benchmark, '1day', HISTORY_BARS);
  const primaryBars = primary.data?.bars ?? [];

  const { regimeBlocks, events, regimeLabels } = useMemo(() => {
    if (primaryBars.length < REGIME_MIN_BARS) {
      return {
        regimeBlocks: [] as RegimeRibbonBlock[],
        events: [] as PriceEventMarker[],
        regimeLabels: {} as Record<string, string>,
      };
    }

    // Build benchmark log-return series for risk-alignment context.
    const benchBars = benchOhlcv.data?.bars ?? [];
    const benchCloses = benchBars.map(b => b.close);
    const benchReturns: number[] = [];
    for (let i = 1; i < benchCloses.length; i++) {
      const a = benchCloses[i - 1], b = benchCloses[i];
      if (a > 0 && b > 0) benchReturns.push(Math.log(b / a));
    }

    // Walk the history at REGIME_STEP intervals; classify each slice; collapse
    // contiguous equal keys into ribbon blocks.
    const blocks: RegimeRibbonBlock[] = [];
    const labelByKey: Record<string, string> = {};
    let cur: { key: string; label: string; startTs: number } | null = null;
    for (let end = REGIME_MIN_BARS; end <= primaryBars.length; end += REGIME_STEP) {
      const slice = primaryBars.slice(0, end);
      const benchSlice = benchReturns.length
        ? benchReturns.slice(0, Math.min(benchReturns.length, end - 1))
        : undefined;
      const r: MarketRegime | null = classifyMarketRegime(slice, { symbol, benchmarkReturns: benchSlice });
      if (!r) continue;
      const key = regimeStateKey(r);
      labelByKey[key] = r.label;
      const ts = primaryBars[end - 1].ts;
      if (!cur || cur.key !== key) {
        if (cur) {
          blocks.push({ startTs: cur.startTs, endTs: ts, key: cur.key, label: cur.label });
        }
        cur = { key, label: r.label, startTs: ts };
      }
    }
    if (cur) {
      blocks.push({
        startTs: cur.startTs,
        endTs: primaryBars[primaryBars.length - 1].ts,
        key: cur.key,
        label: cur.label,
      });
    }

    // Project top historical analog windows as event markers.
    const analogs = findHistoricalAnalogs(primaryBars, { window: 60, step: 21, topK: ANALOG_TOP_K });
    const evs: PriceEventMarker[] = analogs.map((m, i) => ({
      ts: m.windowEnd,
      color: 'var(--primary)',
      label: i === 0 ? m.label : undefined,
      annotation: i === 0
        ? `closest fingerprint match · similarity ${Math.round(m.similarity * 100)}%`
        : undefined,
    }));

    return { regimeBlocks: blocks, events: evs, regimeLabels: labelByKey };
  }, [primaryBars, benchOhlcv.data, symbol]);

  if (primary.loading) {
    return <EmptyStrip label={`Loading ${symbol} long-horizon history…`} />;
  }
  if (primaryBars.length < 200) {
    return <EmptyStrip label={`${symbol}: only ${primaryBars.length} bars available — need ≥ 200 for visual context.`} />;
  }

  const closes = primaryBars.map(b => b.close);
  const tsArr = primaryBars.map(b => b.ts);

  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <PriceWithRegime
        ts={tsArr}
        close={closes}
        regimes={regimeBlocks}
        events={events}
        height={230}
        logScale
        title={`${symbol} · long-horizon context`}
        caption={`${primaryBars.length} daily bars · regime-shaded background · ${events.length} analog marker${events.length === 1 ? '' : 's'}`}
      />
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span className="ds-caption" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, color: 'var(--muted-foreground)' }}>
            Composite regime ribbon
          </span>
          <span className="ds-caption" style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
            {regimeBlocks.length} historical regime epoch{regimeBlocks.length === 1 ? '' : 's'} · re-classified every ~{REGIME_STEP} bars
          </span>
        </div>
        <RegimeRibbon blocks={regimeBlocks} height={18} showYearAxis={false} />
        {regimeBlocks.length > 0 && (
          <RegimeLegend blocks={regimeBlocks} labels={regimeLabels} />
        )}
      </div>
    </section>
  );
};

const RegimeLegend: React.FC<{ blocks: RegimeRibbonBlock[]; labels: Record<string, string> }> = ({ blocks, labels }) => {
  // Take the unique keys in order of first appearance — top 6 for compactness.
  const seen = new Set<string>();
  const order: string[] = [];
  for (const b of blocks) {
    if (!seen.has(b.key)) {
      seen.add(b.key);
      order.push(b.key);
    }
    if (order.length >= 6) break;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
      {order.map((k) => (
        <span key={k} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 10, color: 'var(--muted-foreground)',
          padding: '2px 8px', borderRadius: 999,
          background: 'var(--muted)', border: '1px solid var(--border)',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: paletteFor(k) }} />
          <code style={{ fontSize: 10 }}>{k.replace(/\|/g, ' · ')}</code>
          {labels[k] && labels[k] !== k && (
            <span style={{ color: 'var(--muted-foreground)' }}>· {truncate(labels[k], 48)}</span>
          )}
        </span>
      ))}
    </div>
  );
};

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

const EmptyStrip: React.FC<{ label: string }> = ({ label }) => (
  <div style={{
    height: 230, borderRadius: 12, background: 'var(--card)',
    border: '1px solid var(--border)', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  }}>
    <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>{label}</p>
  </div>
);
