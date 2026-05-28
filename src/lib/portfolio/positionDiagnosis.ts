/**
 * Position diagnosis — explains *why* a holding is under/over-performing, in
 * institutional review/monitor language. Pure and unit-tested; takes only
 * already-computed metrics (no data fetching).
 *
 * Strictly explanatory: classifies the dominant driver(s) and frames them as
 * things to review/monitor. It never issues buy/sell advice — human decision
 * ownership is preserved.
 */

export type DiagnosisKind =
  | 'benchmark_relative'
  | 'macro_regime'
  | 'stock_specific'
  | 'volatility'
  | 'concentration'
  | 'sector_theme';

export type DiagnosisSeverity = 'info' | 'low' | 'medium' | 'high';
export type PositionStance = 'stable' | 'monitor' | 'review';

export interface DiagnosisDriver {
  kind: DiagnosisKind;
  severity: DiagnosisSeverity;
  label: string;
  narrative: string;
  evidence: Array<{ label: string; value: string }>;
}

export interface PositionDiagnosis {
  headline: string;
  stance: PositionStance;
  drivers: DiagnosisDriver[];
}

export interface PositionDiagnosisInput {
  symbol: string;
  /** Window total return of the holding, decimal (0.1 = +10%). */
  holdingReturn: number;
  /** Window total return of the benchmark, decimal. */
  benchmarkReturn: number;
  /** Annualised volatility of the holding, decimal (0.3 = 30%). */
  annVol?: number;
  /** Optional vol baseline to compare against (decimal). */
  volBaseline?: number;
  /** Max drawdown over the window, negative decimal. */
  maxDrawdown?: number;
  /** Trend label as produced by trendLabel(). */
  trend?: string;
  /** Effective portfolio weight 0–1. */
  weight?: number;
  /** Portfolio Herfindahl index 0–1 (concentration context). */
  hhi?: number;
  /** Optional sector label (enables a sector_theme note when peers provided). */
  sector?: string;
  /** Optional average return of sector peers, decimal. */
  sectorPeerReturn?: number;
}

const PCT = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
const PP = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}pp`;

const SEVERITY_RANK: Record<DiagnosisSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };

function isBearishTrend(trend?: string): boolean {
  return trend === 'down' || trend === 'strong-down';
}

/**
 * Classify the drivers of a position's performance. Returns ranked drivers
 * (most severe first), a one-line headline, and an overall stance.
 */
export function diagnosePosition(input: PositionDiagnosisInput): PositionDiagnosis {
  const drivers: DiagnosisDriver[] = [];
  const excess = input.holdingReturn - input.benchmarkReturn;
  const bm = input.benchmarkReturn;
  const underperforming = excess < 0;

  // 1. Benchmark-relative — the headline read for most positions.
  if (Math.abs(excess) >= 0.05) {
    const severity: DiagnosisSeverity = Math.abs(excess) >= 0.15 ? 'high' : Math.abs(excess) >= 0.10 ? 'medium' : 'low';
    drivers.push({
      kind: 'benchmark_relative',
      severity: underperforming ? severity : 'info',
      label: underperforming ? 'Underperforming benchmark' : 'Outperforming benchmark',
      narrative: underperforming
        ? `Trailing the benchmark by ${PP(excess)} over the window. Benchmark-relative contribution is negative — worth reviewing whether the original thesis still holds.`
        : `Ahead of the benchmark by ${PP(excess)} over the window. Positive benchmark-relative contribution.`,
      evidence: [
        { label: 'Position', value: PCT(input.holdingReturn) },
        { label: 'Benchmark', value: PCT(bm) },
        { label: 'Excess', value: PP(excess) },
      ],
    });
  }

  // 2. Macro / regime — benchmark itself moved materially and the position moved with it.
  const sameDirectionAsMarket = Math.sign(input.holdingReturn) === Math.sign(bm) && Math.abs(bm) >= 0.05;
  if (sameDirectionAsMarket && Math.abs(excess) < 0.08) {
    drivers.push({
      kind: 'macro_regime',
      severity: bm < 0 ? 'medium' : 'info',
      label: bm < 0 ? 'Moving with a weak market' : 'Moving with a strong market',
      narrative: bm < 0
        ? `The benchmark is down ${PCT(bm)} over the window and the position is tracking it closely. The move looks regime/macro-driven rather than name-specific — monitor the broad regime as the primary driver.`
        : `The benchmark is up ${PCT(bm)} and the position is broadly tracking it — performance looks regime-supported rather than idiosyncratic.`,
      evidence: [
        { label: 'Benchmark', value: PCT(bm) },
        { label: 'Position', value: PCT(input.holdingReturn) },
      ],
    });
  }

  // 3. Stock-specific — the position diverges from the market with its own weakness.
  const divergesFromMarket = Math.abs(excess) >= 0.08;
  if (divergesFromMarket && underperforming && (isBearishTrend(input.trend) || (input.maxDrawdown ?? 0) <= -0.15)) {
    drivers.push({
      kind: 'stock_specific',
      severity: (input.maxDrawdown ?? 0) <= -0.30 ? 'high' : 'medium',
      label: 'Idiosyncratic weakness',
      narrative: `The position is diverging from the benchmark to the downside (${PP(excess)}) with its own ${isBearishTrend(input.trend) ? 'bearish trend' : 'drawdown'}. This looks name-specific — a thesis review is warranted.`,
      evidence: [
        { label: 'Excess', value: PP(excess) },
        ...(input.maxDrawdown != null ? [{ label: 'Max drawdown', value: PCT(input.maxDrawdown) }] : []),
        ...(input.trend ? [{ label: 'Trend', value: String(input.trend).replace('-', ' ') }] : []),
      ],
    });
  }

  // 4. Volatility — risk level elevated (absolute or vs baseline).
  if (input.annVol != null) {
    const ratio = input.volBaseline && input.volBaseline > 0.01 ? input.annVol / input.volBaseline : null;
    if (ratio != null && ratio >= 1.5) {
      drivers.push({
        kind: 'volatility',
        severity: ratio >= 2 ? 'high' : 'medium',
        label: 'Volatility risk increased',
        narrative: `Realised volatility (${PCT(input.annVol)}) is ${ratio.toFixed(1)}× its baseline. Risk has increased — position sizing relative to conviction may merit review.`,
        evidence: [
          { label: 'Volatility', value: PCT(input.annVol) },
          { label: 'Baseline', value: PCT(input.volBaseline!) },
          { label: 'Ratio', value: `${ratio.toFixed(1)}×` },
        ],
      });
    } else if (input.annVol >= 0.45) {
      drivers.push({
        kind: 'volatility',
        severity: input.annVol >= 0.7 ? 'high' : 'medium',
        label: 'Elevated volatility',
        narrative: `Annualised volatility is ${PCT(input.annVol)} — elevated. Contribution to portfolio risk is outsized relative to a typical equity position.`,
        evidence: [{ label: 'Volatility', value: PCT(input.annVol) }],
      });
    }
  }

  // 5. Concentration — large weight amplifies this position's portfolio impact.
  if (input.weight != null && input.weight >= 0.15) {
    drivers.push({
      kind: 'concentration',
      severity: input.weight >= 0.30 ? 'high' : 'medium',
      label: 'Large portfolio weight',
      narrative: `At ${(input.weight * 100).toFixed(1)}% of the portfolio, this position's outcome materially drives total return${input.hhi != null && input.hhi > 0.2 ? ' and adds to overall concentration' : ''}. Its contribution — positive or negative — is amplified.`,
      evidence: [
        { label: 'Weight', value: `${(input.weight * 100).toFixed(1)}%` },
        ...(input.hhi != null ? [{ label: 'Portfolio HHI', value: input.hhi.toFixed(2) }] : []),
      ],
    });
  }

  // 6. Sector/theme — only when peer context is supplied.
  if (input.sector && input.sectorPeerReturn != null) {
    const vsPeers = input.holdingReturn - input.sectorPeerReturn;
    if (Math.abs(vsPeers) >= 0.06) {
      drivers.push({
        kind: 'sector_theme',
        severity: vsPeers < 0 ? 'medium' : 'info',
        label: vsPeers < 0 ? `Lagging ${input.sector} peers` : `Leading ${input.sector} peers`,
        narrative: `Versus ${input.sector} peers the position is ${vsPeers < 0 ? 'lagging' : 'leading'} by ${PP(vsPeers)}, suggesting a ${vsPeers < 0 ? 'name-specific' : 'relative-strength'} factor on top of the sector move.`,
        evidence: [
          { label: 'Position', value: PCT(input.holdingReturn) },
          { label: `${input.sector} peers`, value: PCT(input.sectorPeerReturn) },
        ],
      });
    }
  }

  drivers.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  // Stance + headline.
  const hasHigh = drivers.some(d => d.severity === 'high');
  const hasActionable = drivers.some(d => d.severity === 'high' || d.severity === 'medium');
  const stance: PositionStance = hasHigh ? 'review' : hasActionable ? 'monitor' : 'stable';

  let headline: string;
  if (drivers.length === 0) {
    headline = `${input.symbol} is tracking expectations — no notable drivers this window.`;
  } else if (stance === 'review') {
    headline = `${input.symbol}: ${drivers[0].label.toLowerCase()} — review warranted.`;
  } else if (stance === 'monitor') {
    headline = `${input.symbol}: ${drivers[0].label.toLowerCase()} — monitor.`;
  } else {
    headline = `${input.symbol}: ${drivers[0].label.toLowerCase()}.`;
  }

  return { headline, stance, drivers };
}
