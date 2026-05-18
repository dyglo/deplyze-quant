/**
 * stressScenarios.ts — Institutional-grade stress scenario library.
 *
 * Shocks are peak-to-trough proxies for each crisis. Not predictions.
 * Regime signals capture second-order effects (correlation, liquidity,
 * volatility) that matter more than price shocks alone in severe events.
 */

// ─── Shock schema ─────────────────────────────────────────────────────────────

export interface StressShocks {
  // ── Core asset classes ──────────────────────────────────────────────────────
  equity:     number;   // Broad equities (S&P 500 / MSCI World proxy)
  bonds:      number;   // Long-duration govts (TLT proxy)
  gold:       number;   // Gold
  oil:        number;   // Oil / Broad commodities
  crypto:     number;   // Crypto (BTC proxy)

  // ── Extended asset classes ──────────────────────────────────────────────────
  realestate: number;   // REITs (VNQ proxy)
  highyield:  number;   // High Yield credit (HYG / JNK proxy)
  financials: number;   // Banks & Financials (XLF proxy)
  vix:        number;   // VIX spike as multiplier (1.0 = flat, 3.0 = +200%)
}

// ─── Institutional / Macro regime signals ────────────────────────────────────

export interface RegimeSignals {
  /** 0–1. How much pairwise correlations converge to 1 (diversification failure). */
  correlationStress: number;
  /** 0–1. Bid-ask widening, market depth collapse, forced selling pressure. */
  liquidityStress:   number;
  /** Realized vol multiplier vs normal (e.g. 3.0 = portfolio vol triples). */
  volMultiplier:     number;
  /** Estimated trading days to recover to pre-shock level. */
  recoveryDays:      number;
  /** True if forced deleveraging / margin calls likely amplify the move. */
  forcedDeleveraging: boolean;
}

// ─── Scenario type ────────────────────────────────────────────────────────────

export interface StressScenario {
  id:          string;
  label:       string;
  period:      string;
  description: string;
  shocks:      StressShocks;
  regime:      RegimeSignals;
  /** Broad thematic tags for grouping. */
  tags:        string[];
}

// ─── Default zero regime (safe baseline) ─────────────────────────────────────

export const NORMAL_REGIME: RegimeSignals = {
  correlationStress:  0,
  liquidityStress:    0,
  volMultiplier:      1,
  recoveryDays:       0,
  forcedDeleveraging: false,
};

// ─── Preset library ───────────────────────────────────────────────────────────

export const STRESS_PRESETS: StressScenario[] = [

  // ── 1. COVID Crash ──────────────────────────────────────────────────────────
  {
    id: 'covid_crash',
    label: 'COVID Crash',
    period: 'Feb 19 – Mar 23, 2020',
    description: 'Global pandemic lockdowns triggered the fastest 34% S&P drawdown in history. Oil collapsed on simultaneous demand destruction and OPEC price war. VIX hit 82. Fastest recovery on record (Fed/fiscal response).',
    shocks: { equity: -0.34, bonds: 0.14, gold: -0.12, oil: -0.55, crypto: -0.50, realestate: -0.40, highyield: -0.22, financials: -0.38, vix: 5.0 },
    regime: { correlationStress: 0.85, liquidityStress: 0.80, volMultiplier: 5.5, recoveryDays: 120, forcedDeleveraging: true },
    tags: ['pandemic', 'liquidity', 'oil', 'central-bank-response'],
  },

  // ── 2. Global Financial Crisis ──────────────────────────────────────────────
  {
    id: 'gfc',
    label: 'Global Financial Crisis',
    period: 'Oct 2007 – Mar 2009',
    description: 'Systemic banking collapse after subprime unwind. S&P fell 57% peak-to-trough over 17 months. Credit markets froze. Correlations converged to ~1. Financials lost 80%+. Diversification completely failed.',
    shocks: { equity: -0.57, bonds: 0.25, gold: 0.25, oil: -0.73, crypto: 0, realestate: -0.68, highyield: -0.38, financials: -0.80, vix: 6.0 },
    regime: { correlationStress: 0.95, liquidityStress: 0.95, volMultiplier: 6.0, recoveryDays: 900, forcedDeleveraging: true },
    tags: ['banking', 'credit', 'systemic', 'housing', 'correlation-breakdown'],
  },

  // ── 3. Lehman Bankruptcy ────────────────────────────────────────────────────
  {
    id: 'lehman',
    label: 'Lehman Bankruptcy',
    period: 'Sep 15 – Oct 10, 2008',
    description: 'Acute 4-week phase of the GFC. Lehman collapse triggered global credit freeze, money markets broke. Interbank lending stopped. All risk assets sold simultaneously. Financials -50% in weeks.',
    shocks: { equity: -0.40, bonds: 0.08, gold: -0.08, oil: -0.35, crypto: 0, realestate: -0.35, highyield: -0.28, financials: -0.50, vix: 8.0 },
    regime: { correlationStress: 1.0, liquidityStress: 1.0, volMultiplier: 8.0, recoveryDays: 180, forcedDeleveraging: true },
    tags: ['banking', 'systemic', 'credit-freeze', 'correlation-breakdown'],
  },

  // ── 4. Dot-com Bust ─────────────────────────────────────────────────────────
  {
    id: 'dotcom',
    label: 'Dot-com Bust',
    period: 'Mar 2000 – Oct 2002',
    description: 'Tech valuation reset: Nasdaq fell 78%, S&P 500 down 49%. 2.5-year bear market driven by excessive multiples. Bonds rallied hard. Financials relatively resilient (until Enron/WorldCom fraud surfaced).',
    shocks: { equity: -0.49, bonds: 0.30, gold: 0.10, oil: -0.30, crypto: 0, realestate: 0.12, highyield: -0.15, financials: -0.25, vix: 3.5 },
    regime: { correlationStress: 0.40, liquidityStress: 0.30, volMultiplier: 2.5, recoveryDays: 1200, forcedDeleveraging: false },
    tags: ['tech', 'valuation', 'slow-bear'],
  },

  // ── 5. 2022 Rate Shock ──────────────────────────────────────────────────────
  {
    id: 'rate_shock_2022',
    label: '2022 Rate Shock',
    period: 'Jan – Oct 2022',
    description: 'Fastest Fed hiking cycle in 40 years caused simultaneous equity and bond selloff — worst 60/40 year in modern history. Duration risk destroyed fixed income. Crypto lost ~75%. REITs hammered by rate sensitivity.',
    shocks: { equity: -0.25, bonds: -0.35, gold: -0.10, oil: 0.15, crypto: -0.75, realestate: -0.28, highyield: -0.15, financials: 0.05, vix: 2.0 },
    regime: { correlationStress: 0.60, liquidityStress: 0.40, volMultiplier: 2.0, recoveryDays: 400, forcedDeleveraging: false },
    tags: ['rates', 'inflation', 'duration', 'crypto'],
  },

  // ── 6. Taper Tantrum ────────────────────────────────────────────────────────
  {
    id: 'taper_tantrum',
    label: 'Taper Tantrum',
    period: 'May – Jun 2013',
    description: 'Fed signals QE tapering: 10Y yields surged ~100bps in weeks. EM assets and gold sold off. Short but severe bond/gold correction. Equities resilient after initial shock. Classic duration/liquidity signal.',
    shocks: { equity: -0.06, bonds: -0.10, gold: -0.22, oil: -0.05, crypto: -0.60, realestate: -0.10, highyield: -0.05, financials: 0.02, vix: 1.8 },
    regime: { correlationStress: 0.20, liquidityStress: 0.25, volMultiplier: 1.5, recoveryDays: 60, forcedDeleveraging: false },
    tags: ['rates', 'duration', 'em', 'gold'],
  },

  // ── 7. Ukraine War Shock ────────────────────────────────────────────────────
  {
    id: 'ukraine_war',
    label: 'Ukraine War Shock',
    period: 'Feb 24 – Mar 7, 2022',
    description: "Russia's invasion of Ukraine: European equities fell ~15%, energy spiked 35%, gold +10%. Commodity and geopolitical shock. Financials hit by Russia sanctions exposure. Short acute shock, partial reversal.",
    shocks: { equity: -0.10, bonds: -0.02, gold: 0.10, oil: 0.35, crypto: -0.10, realestate: -0.05, highyield: -0.05, financials: -0.12, vix: 1.8 },
    regime: { correlationStress: 0.35, liquidityStress: 0.30, volMultiplier: 1.8, recoveryDays: 45, forcedDeleveraging: false },
    tags: ['geopolitical', 'energy', 'commodities'],
  },

  // ── 8. Black Monday 1987 ────────────────────────────────────────────────────
  {
    id: 'black_monday_1987',
    label: 'Black Monday 1987',
    period: 'Oct 19, 1987',
    description: 'Single-day S&P drop of 23% — largest one-day percentage decline in history. Portfolio insurance / futures-driven cascade. Liquidity evaporated instantly. Fed intervened aggressively within hours.',
    shocks: { equity: -0.34, bonds: 0.05, gold: -0.02, oil: -0.08, crypto: 0, realestate: -0.15, highyield: -0.10, financials: -0.30, vix: 10.0 },
    regime: { correlationStress: 0.90, liquidityStress: 1.0, volMultiplier: 10.0, recoveryDays: 400, forcedDeleveraging: true },
    tags: ['crash', 'liquidity', 'systemic', 'one-day'],
  },

  // ── 9. Asian Financial Crisis ───────────────────────────────────────────────
  {
    id: 'asian_crisis_1997',
    label: 'Asian Financial Crisis',
    period: 'Jul 1997 – Jan 1998',
    description: 'EM currency collapses (Thai baht → contagion). EM equities -50%+. US equities largely resilient initially. Oil demand destruction. Global HY credit stressed by EM spillover.',
    shocks: { equity: -0.20, bonds: 0.08, gold: -0.05, oil: -0.30, crypto: 0, realestate: -0.15, highyield: -0.18, financials: -0.22, vix: 2.5 },
    regime: { correlationStress: 0.50, liquidityStress: 0.55, volMultiplier: 2.5, recoveryDays: 240, forcedDeleveraging: true },
    tags: ['em', 'currency', 'contagion', 'credit'],
  },

  // ── 10. European Debt Crisis ────────────────────────────────────────────────
  {
    id: 'eu_debt_crisis',
    label: 'European Debt Crisis',
    period: 'Apr 2010 – Jul 2012',
    description: 'Sovereign debt stress in Greece, Italy, Spain, Portugal. Euro area breakup risk priced. European banks under severe pressure. ECB "whatever it takes" resolved it (Draghi, Jul 2012).',
    shocks: { equity: -0.25, bonds: -0.12, gold: 0.12, oil: -0.15, crypto: 0, realestate: -0.20, highyield: -0.18, financials: -0.38, vix: 2.8 },
    regime: { correlationStress: 0.65, liquidityStress: 0.60, volMultiplier: 2.8, recoveryDays: 360, forcedDeleveraging: false },
    tags: ['sovereign', 'europe', 'banking', 'credit'],
  },

  // ── 11. Inflation Shock 1979–1980 ───────────────────────────────────────────
  {
    id: 'volcker_shock',
    label: 'Volcker Rate Shock',
    period: '1979 – 1981',
    description: 'Fed raised fed funds rate to 20% to break 1970s inflation. Bonds collapsed. Equities in a prolonged bear. Recession followed. Gold initially surged (safe haven from inflation) then sold off sharply.',
    shocks: { equity: -0.27, bonds: -0.40, gold: 0.80, oil: 0.30, crypto: 0, realestate: -0.22, highyield: -0.30, financials: -0.35, vix: 3.0 },
    regime: { correlationStress: 0.45, liquidityStress: 0.50, volMultiplier: 3.0, recoveryDays: 600, forcedDeleveraging: false },
    tags: ['inflation', 'rates', 'recession', 'historical'],
  },

  // ── 12. Flash Crash ─────────────────────────────────────────────────────────
  {
    id: 'flash_crash_2010',
    label: 'Flash Crash',
    period: 'May 6, 2010',
    description: 'S&P fell ~10% in minutes then recovered almost fully same day. Algorithmic cascade + liquidity vacuum. VIX spiked 3x. Exposed fragility of modern market microstructure.',
    shocks: { equity: -0.10, bonds: 0.02, gold: 0.01, oil: -0.05, crypto: 0, realestate: -0.08, highyield: -0.04, financials: -0.12, vix: 3.0 },
    regime: { correlationStress: 0.70, liquidityStress: 1.0, volMultiplier: 3.0, recoveryDays: 1, forcedDeleveraging: false },
    tags: ['liquidity', 'algo', 'microstructure', 'intraday'],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export type ShockKey = keyof StressShocks;

export const SHOCK_META: Record<ShockKey, { label: string; description: string }> = {
  equity:     { label: 'Equities',            description: 'Broad equities (S&P 500 / MSCI World proxy)' },
  bonds:      { label: 'Bonds (Long Dur.)',    description: 'Long-duration government bonds (TLT proxy)' },
  gold:       { label: 'Gold',                 description: 'Gold spot price' },
  oil:        { label: 'Oil / Commodities',    description: 'Crude oil / broad commodity index' },
  crypto:     { label: 'Crypto',               description: 'Bitcoin / broad crypto (BTC proxy)' },
  realestate: { label: 'Real Estate / REITs',  description: 'Listed REITs (VNQ proxy)' },
  highyield:  { label: 'High Yield Credit',    description: 'HY corporate bonds (HYG / JNK proxy)' },
  financials: { label: 'Banks / Financials',   description: 'Financial sector including banks (XLF proxy)' },
  vix:        { label: 'VIX Spike (×)',        description: 'Volatility spike as multiplier (1.0 = flat, 3.0 = +200% VIX)' },
};

export const REGIME_META = {
  correlationStress:  { label: 'Correlation Stress',    description: '0 = no change, 1 = all assets fully correlated (diversification fails)' },
  liquidityStress:    { label: 'Liquidity Stress',      description: '0 = normal, 1 = market freeze / bid-ask collapse' },
  volMultiplier:      { label: 'Volatility Multiplier', description: 'How much realized vol multiplies vs baseline (1× = normal)' },
  recoveryDays:       { label: 'Recovery (trading days)', description: 'Estimated trading days to recover to pre-shock level' },
  forcedDeleveraging: { label: 'Forced Deleveraging',   description: 'Margin calls / forced selling amplify the initial shock' },
};

/** Resolve which shock key applies based on holding asset class + sector. */
export function resolveShockKey(assetClass: string, sector?: string): ShockKey {
  if (assetClass === 'bond')      return 'bonds';
  if (assetClass === 'commodity') return 'oil';
  if (assetClass === 'crypto')    return 'crypto';
  // Equity with sector-based refinement
  if (sector) {
    const s = sector.toLowerCase();
    if (s.includes('real estate') || s.includes('reit'))      return 'realestate';
    if (s.includes('financial') || s.includes('bank') || s.includes('insur')) return 'financials';
  }
  return 'equity';
}

/** Format a shock fraction for display. */
export function fmtShock(fraction: number): string {
  const sign = fraction >= 0 ? '+' : '';
  return `${sign}${(fraction * 100).toFixed(1)}%`;
}

/** Estimate adjusted portfolio impact accounting for correlation stress. */
export function adjustedPortfolioImpact(
  baseImpact: number,
  holdingImpacts: Array<{ portContrib: number }>,
  regime: RegimeSignals,
): number {
  if (regime.correlationStress === 0) return baseImpact;
  // When corr→1, worst holding's contribution dominates
  const worstContrib = Math.min(...holdingImpacts.map(h => h.portContrib));
  const stressedImpact = baseImpact + regime.correlationStress * (worstContrib - baseImpact) * 0.5;
  // Liquidity haircut: illiquid conditions mean you sell at worse prices
  const liquidityHaircut = regime.liquidityStress * Math.abs(baseImpact) * 0.15;
  return stressedImpact - liquidityHaircut;
}

export interface ShockedPrice {
  shocked: number;
  change:  number;
  pct:     number;
}

export function applyShock(currentPrice: number, shockFraction: number): ShockedPrice {
  const shocked = currentPrice * (1 + shockFraction);
  return { shocked, change: shocked - currentPrice, pct: shockFraction * 100 };
}
