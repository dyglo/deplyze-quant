import type { Holding, PortfolioIntelligenceKind, IntelligenceSeverity } from './schemas';

// ─── Input contract ───────────────────────────────────────────────────────────

export interface PortfolioIntelligenceInput {
  holdings: Holding[];
  effectiveWeights: Record<string, number>;
  /** Annualised portfolio volatility (decimal, e.g. 0.22 = 22%) */
  annVol?: number;
  /** Short-window vol (21D) vs long-window (90D) — for anomaly detection */
  shortVol?: number;
  longVol?: number;
  /** 30D portfolio return vs benchmark */
  portfolioReturn30D?: number;
  benchmarkReturn30D?: number;
  /** Average pairwise Pearson correlation */
  avgCorrelation?: number;
  /** Recent (30D) vs prior (30D) avg correlation — for instability detection */
  recentCorr?: number;
  priorCorr?: number;
  /** Herfindahl-Hirschman Index (0–1) */
  hhi?: number;
  /** Fraction of portfolio weight in top 3 symbols */
  top3Weight?: number;
  /** Current 63D rolling beta vs benchmark */
  rollingBeta?: number;
  /** Fraction of holdings with bearish trend label */
  fractionTrendingDown?: number;
  /** Max drawdown (decimal, negative) */
  maxDrawdownPct?: number;
  /** Cross-scenario worst-case impact (decimal) */
  worstScenarioImpact?: number;
}

// ─── Observation (local — no Firestore fields) ────────────────────────────────

export interface LocalObservation {
  id: string;
  kind: PortfolioIntelligenceKind;
  severity: IntelligenceSeverity;
  title: string;
  narrative: string;
  evidence?: Array<{ label: string; value: string | number }>;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export function generatePortfolioObservations(
  input: PortfolioIntelligenceInput,
): LocalObservation[] {
  const obs: LocalObservation[] = [];

  // 1. Concentration warning
  if (input.hhi !== undefined && input.hhi > 0.2) {
    const severity: IntelligenceSeverity = input.hhi > 0.35 ? 'high' : 'medium';
    obs.push({
      id: 'concentration_hhi',
      kind: 'concentration_warning',
      severity,
      title: 'Elevated portfolio concentration',
      narrative:
        `Herfindahl index of ${(input.hhi * 100).toFixed(1)} suggests ${severity === 'high' ? 'significant' : 'moderate'} concentration. ` +
        `Idiosyncratic risk of top positions is amplified relative to a diversified baseline.`,
      evidence: [
        { label: 'HHI', value: input.hhi.toFixed(3) },
        ...(input.top3Weight !== undefined ? [{ label: 'Top-3 weight', value: `${(input.top3Weight * 100).toFixed(1)}%` }] : []),
      ],
    });
  } else if (input.top3Weight !== undefined && input.top3Weight > 0.55) {
    obs.push({
      id: 'concentration_top3',
      kind: 'concentration_warning',
      severity: 'medium',
      title: 'Top-3 positions dominate portfolio weight',
      narrative:
        `Top 3 holdings represent ${(input.top3Weight * 100).toFixed(1)}% of the portfolio. ` +
        `Factor or event exposure is highly concentrated in these names.`,
      evidence: [{ label: 'Top-3 weight', value: `${(input.top3Weight * 100).toFixed(1)}%` }],
    });
  }

  // 2. Volatility anomaly (short-window spike vs baseline)
  if (input.shortVol !== undefined && input.longVol !== undefined && input.longVol > 0.01) {
    const ratio = input.shortVol / input.longVol;
    if (ratio > 1.6) {
      obs.push({
        id: 'volatility_anomaly',
        kind: 'volatility_anomaly',
        severity: ratio > 2.0 ? 'high' : 'medium',
        title: 'Short-window volatility spike',
        narrative:
          `21-day realised vol (${(input.shortVol * 100).toFixed(1)}%) is ${ratio.toFixed(1)}× the 90-day baseline (${(input.longVol * 100).toFixed(1)}%). ` +
          `This divergence may signal a regime transition or idiosyncratic event unfolding in the portfolio.`,
        evidence: [
          { label: '21D vol', value: `${(input.shortVol * 100).toFixed(1)}%` },
          { label: '90D vol', value: `${(input.longVol * 100).toFixed(1)}%` },
          { label: 'Ratio', value: `${ratio.toFixed(2)}×` },
        ],
      });
    }
  } else if (input.annVol !== undefined && input.annVol > 0.35) {
    obs.push({
      id: 'volatility_elevated',
      kind: 'volatility_anomaly',
      severity: input.annVol > 0.5 ? 'high' : 'medium',
      title: 'Elevated annualised volatility',
      narrative:
        `Portfolio annualised vol is ${(input.annVol * 100).toFixed(1)}%. ` +
        `At this level, position sizing and drawdown risk warrant review against mandate limits.`,
      evidence: [{ label: 'Ann. vol', value: `${(input.annVol * 100).toFixed(1)}%` }],
    });
  }

  // 3. Benchmark divergence
  if (
    input.portfolioReturn30D !== undefined &&
    input.benchmarkReturn30D !== undefined
  ) {
    const excess = input.portfolioReturn30D - input.benchmarkReturn30D;
    if (Math.abs(excess) > 0.12) {
      const direction = excess > 0 ? 'outperforming' : 'underperforming';
      const severity: IntelligenceSeverity = Math.abs(excess) > 0.20 ? 'high' : 'medium';
      obs.push({
        id: 'benchmark_divergence',
        kind: 'benchmark_divergence',
        severity,
        title: `Significant benchmark divergence`,
        narrative:
          `Portfolio is ${direction} benchmark by ${(Math.abs(excess) * 100).toFixed(1)}pp over the past 30 days. ` +
          (excess < 0
            ? 'Persistent underperformance may reflect factor headwinds or idiosyncratic drag.'
            : 'Significant outperformance may reflect factor tailwinds or concentrated bets that warrant rebalancing review.'),
        evidence: [
          { label: 'Portfolio 30D', value: `${excess > 0 ? '+' : ''}${(input.portfolioReturn30D * 100).toFixed(1)}%` },
          { label: 'Benchmark 30D', value: `${input.benchmarkReturn30D >= 0 ? '+' : ''}${(input.benchmarkReturn30D * 100).toFixed(1)}%` },
          { label: 'Excess', value: `${excess >= 0 ? '+' : ''}${(excess * 100).toFixed(1)}pp` },
        ],
      });
    }
  }

  // 4. Correlation instability
  if (
    input.recentCorr !== undefined &&
    input.priorCorr !== undefined &&
    Math.abs(input.recentCorr - input.priorCorr) > 0.18
  ) {
    const rising = input.recentCorr > input.priorCorr;
    obs.push({
      id: 'correlation_shift',
      kind: 'correlation_shift',
      severity: 'medium',
      title: `Intra-portfolio correlation ${rising ? 'rising' : 'falling'}`,
      narrative:
        rising
          ? `Average pairwise correlation has risen from ${input.priorCorr.toFixed(2)} to ${input.recentCorr.toFixed(2)} over the past 30 days. ` +
            `Rising correlation reduces diversification benefit; portfolio may behave more like a single factor bet under stress.`
          : `Average pairwise correlation has fallen from ${input.priorCorr.toFixed(2)} to ${input.recentCorr.toFixed(2)}. ` +
            `Falling correlation improves diversification but may also signal dispersion of risk across different return drivers.`,
      evidence: [
        { label: 'Recent corr (30D)', value: input.recentCorr.toFixed(2) },
        { label: 'Prior corr (30D)', value: input.priorCorr.toFixed(2) },
        { label: 'Δ corr', value: `${(input.recentCorr - input.priorCorr) >= 0 ? '+' : ''}${(input.recentCorr - input.priorCorr).toFixed(2)}` },
      ],
    });
  }

  // 5. High beta amplification
  if (input.rollingBeta !== undefined && input.rollingBeta > 1.4) {
    obs.push({
      id: 'regime_high_beta',
      kind: 'regime_alignment',
      severity: input.rollingBeta > 1.8 ? 'high' : 'medium',
      title: 'Portfolio beta significantly above 1',
      narrative:
        `63-day rolling beta is ${input.rollingBeta.toFixed(2)}. ` +
        `Market moves are amplified — a 1% benchmark drawdown corresponds to an estimated ${(input.rollingBeta).toFixed(1)}% portfolio impact. ` +
        `Cyclical or growth factor exposures likely dominate current positioning.`,
      evidence: [{ label: 'Rolling beta (63D)', value: input.rollingBeta.toFixed(2) }],
    });
  }

  // 6. Breadth deterioration
  if (input.fractionTrendingDown !== undefined && input.fractionTrendingDown > 0.6) {
    obs.push({
      id: 'breadth_deterioration',
      kind: 'breadth_deterioration',
      severity: input.fractionTrendingDown > 0.8 ? 'high' : 'medium',
      title: 'Broad internal breadth deterioration',
      narrative:
        `${(input.fractionTrendingDown * 100).toFixed(0)}% of holdings are exhibiting a bearish trend. ` +
        `Broad participation in the drawdown suggests macro or sector-level pressure rather than idiosyncratic risk. ` +
        `Defensive positioning or hedge review may be warranted.`,
      evidence: [
        { label: 'Bearish holdings', value: `${(input.fractionTrendingDown * 100).toFixed(0)}%` },
        { label: 'Total holdings', value: String(input.holdings.length) },
      ],
    });
  }

  // 7. Severe drawdown
  if (input.maxDrawdownPct !== undefined && input.maxDrawdownPct < -0.20) {
    obs.push({
      id: 'drawdown_clustering',
      kind: 'drawdown_clustering',
      severity: input.maxDrawdownPct < -0.35 ? 'high' : 'medium',
      title: 'Significant drawdown from recent peak',
      narrative:
        `Portfolio is ${(Math.abs(input.maxDrawdownPct) * 100).toFixed(1)}% below its recent peak. ` +
        `Historical analogues suggest drawdowns of this magnitude can persist ${input.maxDrawdownPct < -0.35 ? '6–18 months' : '2–6 months'} before recovery. ` +
        `Mean reversion is not guaranteed; recovery path depends on underlying factor exposures.`,
      evidence: [{ label: 'Max drawdown', value: `${(input.maxDrawdownPct * 100).toFixed(1)}%` }],
    });
  }

  // 8. Tail risk from scenario analysis
  if (input.worstScenarioImpact !== undefined && input.worstScenarioImpact < -0.25) {
    obs.push({
      id: 'macro_sensitivity_tail',
      kind: 'macro_sensitivity',
      severity: input.worstScenarioImpact < -0.40 ? 'high' : 'medium',
      title: 'High tail sensitivity to historical shock scenarios',
      narrative:
        `Under the most adverse historical scenario proxy, estimated portfolio impact is ${(input.worstScenarioImpact * 100).toFixed(1)}%. ` +
        `This tail exposure reflects the asset class composition and concentration of current holdings. ` +
        `Scenario impacts are illustrative proxies; actual outcomes depend on conditions at the time.`,
      evidence: [{ label: 'Worst scenario est.', value: `${(input.worstScenarioImpact * 100).toFixed(1)}%` }],
    });
  }

  // 9. Very low vol — complacency signal
  if (input.annVol !== undefined && input.annVol < 0.06 && input.holdings.length >= 3) {
    obs.push({
      id: 'vol_compression',
      kind: 'volatility_anomaly',
      severity: 'low',
      title: 'Unusually low portfolio volatility',
      narrative:
        `Annualised vol of ${(input.annVol * 100).toFixed(1)}% is unusually compressed for a diversified equity portfolio. ` +
        `Low-vol environments can precede periods of sudden repricing. Correlation structure and liquidity conditions merit monitoring.`,
      evidence: [{ label: 'Ann. vol', value: `${(input.annVol * 100).toFixed(1)}%` }],
    });
  }

  // Sort: high → medium → low → info
  const severityOrder: Record<IntelligenceSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };
  return obs.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
