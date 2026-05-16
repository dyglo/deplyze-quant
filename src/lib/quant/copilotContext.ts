/**
 * Copilot context builder.
 *
 * Produces a compact, narrative-grade text block summarising a symbol's
 * current quantitative state. The block is intended to be injected as a
 * `system` message preamble in Copilot dialogues so the model grounds its
 * answers in real numbers instead of generic chat.
 *
 * Returns `null` when the bar series can't support meaningful intelligence —
 * Copilot should then simply not receive a misleading snapshot.
 */

import type { OHLCVBar } from '../../types';
import { classifyMarketRegime } from './regimes';
import { findHistoricalAnalogs } from './analog';
import { detectReturnAnomalies, detectVolumeAnomalies } from './anomalies';
import { describeVolPercentile } from './volatility';

export interface QuantSnapshotOptions {
  /** How many recent anomalies to surface (default 3). */
  maxAnomalies?: number;
  /** How many historical analog matches to surface (default 3). */
  maxAnalogs?: number;
}

/** Build a Copilot-ready intelligence block for a symbol.
 *
 *  Output format is intentionally markdown-light so it composes cleanly
 *  with the rest of the system snapshot. */
export function quantSnapshotForSymbol(
  symbol: string,
  bars: OHLCVBar[],
  options: QuantSnapshotOptions = {},
): string | null {
  if (!bars.length) return null;
  const lines: string[] = [];
  const regime = classifyMarketRegime(bars, { symbol });
  if (regime) {
    lines.push(`Quant regime for ${symbol}:`);
    lines.push(`  - State: ${regime.label}.`);
    lines.push(`  - Realised vol ${(regime.volatility.realisedVol * 100).toFixed(1)}% — ${describeVolPercentile(regime.volatility.percentileRank)}; vol trend ${regime.volatility.trend}.`);
    lines.push(`  - Trend stability ${(regime.trendStability * 100).toFixed(0)}%; momentum persistence ${(regime.momentumPersistence * 100).toFixed(0)}%.`);
    lines.push(`  - Confidence ${(regime.confidence * 100).toFixed(0)}%.`);
  } else {
    lines.push(`Quant regime for ${symbol}: insufficient history (${bars.length} bars) — regime classifier abstained.`);
  }

  const maxAnomalies = options.maxAnomalies ?? 3;
  const returns = detectReturnAnomalies(bars, symbol, { maxArtifacts: maxAnomalies });
  const volumes = detectVolumeAnomalies(bars, symbol, { maxArtifacts: 2 });
  const anomalies = [...returns, ...volumes].sort((a, b) => b.ts - a.ts).slice(0, maxAnomalies);
  if (anomalies.length) {
    lines.push(`Recent anomalies for ${symbol}:`);
    for (const a of anomalies) {
      const date = new Date(a.ts).toISOString().slice(0, 10);
      lines.push(`  - ${date}: ${a.narrative}`);
    }
  }

  const analogs = findHistoricalAnalogs(bars, { topK: options.maxAnalogs ?? 3 });
  if (analogs.length) {
    lines.push(`Closest historical analogs for ${symbol} (fingerprint similarity):`);
    for (const m of analogs) {
      lines.push(`  - ${m.label} — ${(m.similarity * 100).toFixed(0)}% (vol ${(m.fingerprint.realisedVol * 100).toFixed(1)}%, drift ${(m.fingerprint.meanReturn * 252 * 100).toFixed(1)}%/yr).`);
    }
  }

  if (lines.length === 0) return null;
  lines.push(`Ground answers in these values. Use probabilistic language only — never imply certainty about future returns.`);
  return lines.join('\n');
}
