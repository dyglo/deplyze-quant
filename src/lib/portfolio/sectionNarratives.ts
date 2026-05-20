/**
 * sectionNarratives — pure functions that turn each awareness section's
 * data into 2–3 second-person institutional sentences for SectionNarrative.
 *
 * Voice rules:
 *   - Always second-person possessive ("your portfolio", "your exposure").
 *   - Reflective, never directive. No forbidden verbs — that guard is
 *     applied at render time by SectionNarrative anyway, but we honour it
 *     here as a discipline.
 *   - Lead with the most-load-bearing observation. Cite numbers.
 *   - Each line is ~80–180 chars. Max 3 lines.
 *
 * Inputs are intentionally small — pull only what the section already
 * has on hand to avoid duplicating fetches.
 */

import type { Holding } from './schemas';
import type { PositionMetrics } from './holdingAnalytics';
import type { VulnerabilityResult } from '../../services/reasoningService';
import type { ContributionRow } from './awarenessAttribution';

interface Line { emphasis?: boolean; text: string }

function pct(v: number, signed = true, dp = 2): string {
  if (!isFinite(v)) return '—';
  const s = (v * 100).toFixed(dp);
  return signed && v > 0 ? `+${s}%` : `${s}%`;
}

// ─── Hero ────────────────────────────────────────────────────────────────────

export function narrateHero(opts: {
  portfolioName?: string;
  totalReturn: number;
  benchmarkTotalReturn?: number;
  benchmarkId?: string;
  sharpe?: number;
  maxDrawdown?: number;
  observationCount: number;
  regimeLabel?: string | null;
  riskLevel?: string | null;
}): Line[] {
  const lines: Line[] = [];
  const active = opts.benchmarkTotalReturn != null
    ? opts.totalReturn - opts.benchmarkTotalReturn
    : null;
  const tone = opts.totalReturn >= 0 ? 'positive' : 'negative';

  // Line 1 — performance vs benchmark
  if (active != null) {
    const verb = active >= 0 ? 'ahead of' : 'behind';
    lines.push({
      emphasis: true,
      text: `Your portfolio is ${pct(opts.totalReturn)} on the period — ${verb} ${opts.benchmarkId ?? 'benchmark'} by ${pct(Math.abs(active), false)}.`,
    });
  } else {
    lines.push({
      emphasis: true,
      text: `Your portfolio is ${pct(opts.totalReturn)} on the period.`,
    });
  }

  // Line 2 — risk-adjusted read
  const sharpe = opts.sharpe ?? 0;
  const mdd = opts.maxDrawdown ?? 0;
  const sharpeRead = sharpe >= 1 ? 'strong risk-adjusted' : sharpe >= 0.5 ? 'moderate risk-adjusted' : 'weak risk-adjusted';
  lines.push({
    text: `Sharpe of ${sharpe.toFixed(2)} reflects ${sharpeRead} performance; the deepest drawdown experienced was ${pct(mdd, false)}.`,
  });

  // Line 3 — macro context if available
  const macroBits: string[] = [];
  if (opts.regimeLabel) macroBits.push(`regime reads as ${opts.regimeLabel.replace(/-/g, ' ')}`);
  if (opts.riskLevel) macroBits.push(`risk environment is ${opts.riskLevel}`);
  if (macroBits.length > 0) {
    lines.push({
      text: `Around your portfolio today, ${macroBits.join(' and ')}.`,
    });
  } else if (opts.observationCount > 0) {
    lines.push({
      text: `${opts.observationCount} active observation${opts.observationCount === 1 ? '' : 's'} surfaced for this portfolio over the last seven days.`,
    });
  }

  return lines;
}

// ─── Return Decomposition ────────────────────────────────────────────────────

export function narrateReturnDecomposition(opts: {
  totalReturn: number;
  benchmarkTotalReturn?: number;
  benchmarkId?: string;
  holdingRows: ContributionRow[];
  sectorRows: ContributionRow[];
}): Line[] {
  const lines: Line[] = [];
  const top = opts.holdingRows[0];
  const top3 = opts.holdingRows.slice(0, 3);
  const top3Contrib = top3.reduce((s, r) => s + r.contribution, 0);

  if (top) {
    lines.push({
      emphasis: true,
      text: `Your strongest contributor on the period was ${top.label} (${pct(top.contribution)} of portfolio return). The top three names — ${top3.map(r => r.label).join(', ')} — together accounted for ${pct(top3Contrib)}.`,
    });
  }

  const topSector = opts.sectorRows.find(r => r.label && r.label !== 'Unclassified');
  if (topSector) {
    const sharePct = opts.totalReturn !== 0 ? (topSector.contribution / opts.totalReturn) : 0;
    lines.push({
      text: `${topSector.label} drove the largest sector contribution at ${pct(topSector.contribution)}, roughly ${pct(Math.abs(sharePct), false, 0)} of the portfolio's total return.`,
    });
  }

  const negatives = opts.holdingRows.filter(r => r.contribution < 0);
  if (negatives.length > 0) {
    const worst = negatives.sort((a, b) => a.contribution - b.contribution)[0];
    lines.push({
      text: `${negatives.length} of your positions detracted from the period — the weakest was ${worst.label} at ${pct(worst.contribution)}.`,
    });
  } else {
    lines.push({ text: `Every position posted a positive contribution on the period — a rare breadth.` });
  }

  return lines;
}

// ─── Risk Decomposition ──────────────────────────────────────────────────────

export function narrateRiskDecomposition(opts: {
  annVol?: number;
  maxDrawdown?: number;
  hhi: number;
  holdingsCount: number;
  stressedCount: number;        // holdings with >= 2 dim flags
  topSectorRiskShare?: { sector: string; share: number };
  vulnerability: VulnerabilityResult | null;
}): Line[] {
  const lines: Line[] = [];

  // Volatility + drawdown framing
  const v = opts.annVol ?? 0;
  const vRead = v > 0.30 ? 'elevated' : v > 0.18 ? 'moderate' : v > 0 ? 'subdued' : 'unmeasured';
  const m = opts.maxDrawdown ?? 0;
  lines.push({
    emphasis: true,
    text: `Annualised volatility is ${pct(v, false)} — ${vRead} for a diversified equity book — and the deepest drawdown experienced is ${pct(m, false)}.`,
  });

  // Concentration
  const hhiRead = opts.hhi > 0.20 ? 'highly concentrated' : opts.hhi > 0.12 ? 'moderately concentrated' : 'broadly diversified';
  lines.push({
    text: `Your weights are ${hhiRead} (HHI ${opts.hhi.toFixed(3)}); ${opts.stressedCount} of ${opts.holdingsCount} positions face multi-dimensional stress signals.`,
  });

  // Sector concentration of risk + macro nudge if present
  const macro = opts.vulnerability;
  if (opts.topSectorRiskShare && opts.topSectorRiskShare.share > 0.25) {
    lines.push({
      text: `${opts.topSectorRiskShare.sector} carries ${pct(opts.topSectorRiskShare.share, false, 0)} of your weighted volatility — a single-sector dependence worth monitoring.`,
    });
  } else if (macro?.composite_label) {
    const label = macro.composite_label.replace('_', ' ');
    lines.push({
      text: `Macro-regime read on this portfolio is ${label} across the six tracked dimensions — confidence ${(macro.confidence ?? 0).toFixed(2)}.`,
    });
  }

  return lines;
}

// ─── Position Activity ───────────────────────────────────────────────────────

export function narratePositionActivity(opts: {
  positions: PositionMetrics[];
  benchmarkId?: string;
}): Line[] {
  if (opts.positions.length === 0) return [];
  const lines: Line[] = [];

  // 1M momentum read
  const recent = opts.positions.filter(p => p.ret21 !== 0);
  if (recent.length > 0) {
    const winners = recent.filter(p => p.ret21 > 0).length;
    const total = recent.length;
    const topRecent = [...recent].sort((a, b) => b.ret21 - a.ret21)[0];
    lines.push({
      emphasis: true,
      text: `In the last month, ${winners} of ${total} positions posted gains; ${topRecent.symbol} led at ${pct(topRecent.ret21)}.`,
    });
  }

  // Weighted beta and vol
  const totalWeight = opts.positions.reduce((s, p) => s + p.weight, 0);
  if (totalWeight > 0) {
    const wBeta = opts.positions.reduce((s, p) => s + p.weight * p.beta, 0) / totalWeight;
    const wVol  = opts.positions.reduce((s, p) => s + p.weight * p.vol, 0) / totalWeight;
    const betaRead = wBeta >= 1.2 ? 'amplifies' : wBeta >= 0.8 ? 'tracks' : 'dampens';
    lines.push({
      text: `Your book ${betaRead} ${opts.benchmarkId ?? 'benchmark'} moves (β ${wBeta.toFixed(2)}) at ${pct(wVol, false)} weighted volatility.`,
    });
  }

  // Worst current drawdown
  const worstDd = [...opts.positions].sort((a, b) => a.mdd - b.mdd)[0];
  if (worstDd && worstDd.mdd < -0.10) {
    lines.push({
      text: `${worstDd.symbol} is sitting on the deepest drawdown across your book at ${pct(worstDd.mdd, false)}.`,
    });
  }

  return lines;
}

// ─── Performance Distribution ───────────────────────────────────────────────

export function narratePerformanceDistribution(opts: {
  sectorRows: Array<{ sector: string; weight: number; sectorReturn: number; contribution: number; alphaVsPortfolio: number }>;
  portfolioReturn: number;
}): Line[] {
  if (opts.sectorRows.length === 0) return [];
  const lines: Line[] = [];
  const sorted = [...opts.sectorRows].sort((a, b) => b.sectorReturn - a.sectorReturn);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (best && worst && best.sector !== worst.sector) {
    const dispersion = best.sectorReturn - worst.sectorReturn;
    lines.push({
      emphasis: true,
      text: `Sector dispersion is ${pct(dispersion, false)} — ${best.sector} returned ${pct(best.sectorReturn)} while ${worst.sector} returned ${pct(worst.sectorReturn)}.`,
    });
  }

  // Biggest active deviation from portfolio
  const widestAlpha = [...opts.sectorRows].sort((a, b) => Math.abs(b.alphaVsPortfolio) - Math.abs(a.alphaVsPortfolio))[0];
  if (widestAlpha && Math.abs(widestAlpha.alphaVsPortfolio) > 0.05) {
    const verb = widestAlpha.alphaVsPortfolio >= 0 ? 'led' : 'lagged';
    lines.push({
      text: `${widestAlpha.sector} ${verb} the portfolio average by ${pct(Math.abs(widestAlpha.alphaVsPortfolio), false)} at ${pct(widestAlpha.weight, false)} weight.`,
    });
  }

  // Concentration of contribution
  const top2 = [...opts.sectorRows].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 2);
  if (top2.length === 2) {
    const share = (Math.abs(top2[0].contribution) + Math.abs(top2[1].contribution)) / Math.max(1e-9, Math.abs(opts.portfolioReturn));
    if (share > 0.5) {
      lines.push({
        text: `${pct(share, false, 0)} of total period return came from two sectors (${top2[0].sector}, ${top2[1].sector}) — your returns lean heavily on this pair.`,
      });
    }
  }

  return lines;
}

// ─── Correlation Profile ─────────────────────────────────────────────────────

export function narrateCorrelationProfile(opts: {
  positions: PositionMetrics[];
  benchmarkId?: string;
  meanIntraCorr: number;
}): Line[] {
  if (opts.positions.length === 0) return [];
  const lines: Line[] = [];

  // Mean correlation to benchmark
  const corrs = opts.positions.map(p => p.corrToBenchmark).filter(c => isFinite(c));
  if (corrs.length > 0) {
    const meanCorr = corrs.reduce((s, c) => s + c, 0) / corrs.length;
    const read = meanCorr >= 0.7 ? 'tightly co-moving' : meanCorr >= 0.4 ? 'moderately co-moving' : 'loosely co-moving';
    const diversifier = opts.positions.find(p => Math.abs(p.corrToBenchmark) < 0.3);
    const tail = diversifier
      ? ` ${diversifier.symbol} shows the meaningful diversification benefit at correlation ${diversifier.corrToBenchmark.toFixed(2)}.`
      : '';
    lines.push({
      emphasis: true,
      text: `Your holdings are ${read} with ${opts.benchmarkId ?? 'benchmark'} — average correlation ${meanCorr.toFixed(2)}.${tail}`,
    });
  }

  // Intra-portfolio
  const intraRead = opts.meanIntraCorr >= 0.6 ? 'tightly bunched' : opts.meanIntraCorr >= 0.35 ? 'moderately related' : 'broadly independent';
  lines.push({
    text: `Intra-portfolio relationships are ${intraRead} (average pairwise ${opts.meanIntraCorr.toFixed(2)}). Tighter intra-correlations compress diversification benefit.`,
  });

  return lines;
}
