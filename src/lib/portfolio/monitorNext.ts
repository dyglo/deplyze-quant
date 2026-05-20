/**
 * monitorNext — synthesise an institutional probe list from data already
 * on the awareness page.
 *
 * A "probe" is a single short sentence telling the user what condition is
 * worth watching given the current portfolio state. **Never a trade.**
 * The voice is "Monitor X" / "Watch X" / "Track X" — reflective imperative
 * about observation, not action.
 *
 * Inputs are all already-computed by the awareness sections, so this
 * module makes no new fetches.
 */

import type { PositionMetrics } from './holdingAnalytics';
import type { VulnerabilityResult, VulnerabilityDimension } from '../../services/reasoningService';
import type { SectorClassification } from '../../hooks/useSectorMetadata';

export type MonitorCategory =
  | 'concentration'
  | 'volatility'
  | 'drawdown'
  | 'diversification'
  | 'macro'
  | 'breadth';

export type MonitorSeverity = 'high' | 'medium' | 'low';

export interface MonitorProbe {
  id: string;
  category: MonitorCategory;
  severity: MonitorSeverity;
  /** Headline — what to monitor. Begins with an observation verb. */
  title: string;
  /** Second line — the reason this matters for this portfolio. */
  rationale: string;
  /** Compact evidence pills. */
  evidence: Array<{ label: string; value: string }>;
  /** Symbols this probe is grounded in, when applicable. */
  symbols?: string[];
}

const CATEGORY_LABEL: Record<MonitorCategory, string> = {
  concentration:   'Concentration',
  volatility:      'Volatility',
  drawdown:        'Drawdown',
  diversification: 'Diversification',
  macro:           'Macro',
  breadth:         'Breadth',
};

export function categoryLabel(c: MonitorCategory): string { return CATEGORY_LABEL[c]; }

const SEV_ORDER: Record<MonitorSeverity, number> = { high: 0, medium: 1, low: 2 };

function fmtPct(v: number, dp = 1): string {
  if (!isFinite(v)) return '—';
  return `${(v * 100).toFixed(dp)}%`;
}

interface BuildInput {
  positions: PositionMetrics[];
  sectorBySymbol: Record<string, SectorClassification>;
  /** Sector-level weight roll-up so concentration probes can name a sector. */
  sectorWeights: Array<{ sector: string; weight: number; memberCount: number }>;
  vulnerability: VulnerabilityResult | null;
  /** Mean off-diagonal intra-portfolio correlation. */
  meanIntraCorr: number;
  benchmarkId?: string;
}

export function buildMonitorProbes(input: BuildInput): MonitorProbe[] {
  const probes: MonitorProbe[] = [];

  // ─── 1. Concentration — single holding > 20% ────────────────────────────
  const totalW = input.positions.reduce((s, p) => s + p.weight, 0) || 1;
  const concentrated = input.positions
    .filter(p => p.weight / totalW > 0.18)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  for (const p of concentrated) {
    const rel = p.weight / totalW;
    probes.push({
      id: `conc-${p.symbol}`,
      category: 'concentration',
      severity: rel > 0.30 ? 'high' : 'medium',
      title: `Monitor concentration in ${p.symbol}`,
      rationale: `${p.symbol} represents ${fmtPct(rel)} of your portfolio — single-name risk is amplified at this weight.`,
      evidence: [
        { label: 'Weight', value: fmtPct(rel) },
        { label: '1Y return', value: fmtPct(p.retFull) },
        { label: 'Vol', value: fmtPct(p.vol) },
      ],
      symbols: [p.symbol],
    });
  }

  // ─── 2. Sector concentration — top sector > 30% ──────────────────────────
  const sortedSectors = [...input.sectorWeights]
    .filter(s => s.sector && s.sector !== 'Unclassified')
    .sort((a, b) => b.weight - a.weight);
  const topSector = sortedSectors[0];
  if (topSector && topSector.weight > 0.30) {
    probes.push({
      id: `sect-${topSector.sector}`,
      category: 'concentration',
      severity: topSector.weight > 0.50 ? 'high' : 'medium',
      title: `Track breadth within ${topSector.sector}`,
      rationale: `${fmtPct(topSector.weight)} of your portfolio sits in ${topSector.sector} — leadership narrowing inside that sector compresses portfolio breadth.`,
      evidence: [
        { label: 'Sector weight', value: fmtPct(topSector.weight) },
        { label: 'Members', value: String(topSector.memberCount) },
      ],
    });
  }

  // ─── 3. Volatility — holdings with realised vol > 40% ────────────────────
  const highVol = input.positions
    .filter(p => p.vol > 0.40)
    .sort((a, b) => b.vol - a.vol)
    .slice(0, 3);
  for (const p of highVol) {
    probes.push({
      id: `vol-${p.symbol}`,
      category: 'volatility',
      severity: p.vol > 0.55 ? 'high' : 'medium',
      title: `Watch realised vol on ${p.symbol}`,
      rationale: `${p.symbol} is running at ${fmtPct(p.vol)} annualised volatility — elevated for an equity position and a primary driver of portfolio path dispersion.`,
      evidence: [
        { label: 'Ann. vol', value: fmtPct(p.vol) },
        { label: 'Weight', value: fmtPct(p.weight / totalW) },
        { label: 'β', value: p.beta.toFixed(2) },
      ],
      symbols: [p.symbol],
    });
  }

  // ─── 4. Drawdown — deepest drawdown < -25% ───────────────────────────────
  const deepestDd = [...input.positions]
    .filter(p => p.mdd < -0.25)
    .sort((a, b) => a.mdd - b.mdd)
    .slice(0, 2);
  for (const p of deepestDd) {
    probes.push({
      id: `dd-${p.symbol}`,
      category: 'drawdown',
      severity: p.mdd < -0.40 ? 'high' : 'medium',
      title: `Monitor recovery path on ${p.symbol}`,
      rationale: `${p.symbol} has carried a drawdown of ${fmtPct(p.mdd)} over the period — historical recovery for drawdowns of this depth is non-linear.`,
      evidence: [
        { label: 'Max DD', value: fmtPct(p.mdd) },
        { label: '1Y return', value: fmtPct(p.retFull) },
      ],
      symbols: [p.symbol],
    });
  }

  // ─── 5. Diversification — high intra-portfolio correlation ────────────────
  if (input.meanIntraCorr >= 0.6) {
    probes.push({
      id: 'div-intra',
      category: 'diversification',
      severity: input.meanIntraCorr >= 0.75 ? 'high' : 'medium',
      title: 'Track diversification benefit erosion',
      rationale: `Average pairwise correlation across your top holdings is ${input.meanIntraCorr.toFixed(2)} — positions are bunching, reducing the protective effect of holding multiple names.`,
      evidence: [
        { label: 'Mean intra-corr', value: input.meanIntraCorr.toFixed(2) },
      ],
    });
  }

  // ─── 6. Diversification — book correlation to benchmark ──────────────────
  const corrs = input.positions.map(p => p.corrToBenchmark).filter(c => isFinite(c));
  if (corrs.length > 0) {
    const meanBenchCorr = corrs.reduce((s, c) => s + c, 0) / corrs.length;
    if (meanBenchCorr >= 0.75) {
      probes.push({
        id: 'div-bench',
        category: 'diversification',
        severity: 'medium',
        title: `Watch decoupling from ${input.benchmarkId ?? 'benchmark'}`,
        rationale: `Average correlation of your book to ${input.benchmarkId ?? 'benchmark'} is ${meanBenchCorr.toFixed(2)} — under a benchmark drawdown most positions will move together.`,
        evidence: [
          { label: `Mean ρ ${input.benchmarkId ?? 'Bmk'}`, value: meanBenchCorr.toFixed(2) },
        ],
      });
    }
  }

  // ─── 7. Macro — vulnerability dimensions with high_risk label ───────────
  if (input.vulnerability) {
    const dims = Object.entries(input.vulnerability.dimensions ?? {})
      .filter(([, d]) => d.label === 'high_risk' || d.label === 'moderate_risk')
      .sort((a, b) => Math.abs((b[1] as VulnerabilityDimension).score) - Math.abs((a[1] as VulnerabilityDimension).score))
      .slice(0, 3);
    for (const [key, d] of dims) {
      const dim = d as VulnerabilityDimension;
      const niceLabel = key.replace('_sensitivity', '').replace('_risk', '').replace(/_/g, ' ');
      probes.push({
        id: `macro-${key}`,
        category: 'macro',
        severity: dim.label === 'high_risk' ? 'high' : 'medium',
        title: `Monitor ${niceLabel} regime indicators`,
        rationale: `Your portfolio is reading as ${dim.label.replace('_', ' ')} along the ${niceLabel} dimension — score ${(Math.abs(dim.score) * 100).toFixed(0)}/100.`,
        evidence: [
          { label: 'Dim score', value: (Math.abs(dim.score) * 100).toFixed(0) },
          ...(dim.top_contributors?.length ? [{ label: 'Drivers', value: dim.top_contributors.slice(0, 3).join(', ') }] : []),
        ],
        symbols: dim.top_contributors,
      });
    }
  }

  // ─── 8. Breadth — too many holdings down ────────────────────────────────
  const recent = input.positions.filter(p => p.ret21 !== 0);
  if (recent.length >= 4) {
    const losers = recent.filter(p => p.ret21 < -0.02).length;
    const ratio = losers / recent.length;
    if (ratio > 0.55) {
      probes.push({
        id: 'breadth-recent',
        category: 'breadth',
        severity: ratio > 0.75 ? 'high' : 'medium',
        title: 'Track breadth deterioration',
        rationale: `${losers} of ${recent.length} positions posted negative returns over the last month — broad participation in the weakness suggests a regime or sector pressure, not idiosyncratic risk.`,
        evidence: [
          { label: 'Negative 1M', value: `${losers}/${recent.length}` },
        ],
      });
    }
  }

  // Cap and sort by severity then category for a calm read.
  probes.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  return probes.slice(0, 10);
}
