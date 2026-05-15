/**
 * stressScenarios.ts — fixed historical shock presets for stress-testing.
 *
 * Shocks are based on peak-to-trough moves during each crisis period for each
 * major asset class. They are illustrative proxies, not exact index returns.
 * Display them with a disclaimer so users understand they are not predictions.
 */

export interface StressScenario {
  id: string;
  label: string;
  period: string;
  description: string;
  /** Fractional shock per asset class (e.g. -0.34 = −34%). */
  shocks: {
    equity: number;
    bonds: number;   // long-duration government (e.g. TLT-like)
    gold: number;
    oil: number;
    crypto: number;
  };
}

export const STRESS_PRESETS: StressScenario[] = [
  {
    id: 'covid_crash',
    label: 'COVID Crash',
    period: 'Feb 19 – Mar 23, 2020',
    description: 'Global pandemic lockdowns triggered the fastest 30%+ drawdown in S&P 500 history. Oil collapsed on simultaneous demand destruction and OPEC price war.',
    shocks: { equity: -0.34, bonds: 0.14, gold: -0.12, oil: -0.55, crypto: -0.50 },
  },
  {
    id: 'gfc',
    label: 'Global Financial Crisis',
    period: 'Oct 2007 – Mar 2009',
    description: 'Systemic banking collapse following subprime mortgage unwind. S&P 500 lost 57% peak-to-trough over 17 months. Credit markets effectively froze.',
    shocks: { equity: -0.57, bonds: 0.25, gold: 0.25, oil: -0.73, crypto: 0 },
  },
  {
    id: 'dotcom',
    label: 'Dot-com Bust',
    period: 'Mar 2000 – Oct 2002',
    description: 'Technology valuation reset: Nasdaq fell 78%, S&P 500 down 49%. 2.5-year bear market driven by excessive multiples and earnings disappointments.',
    shocks: { equity: -0.49, bonds: 0.30, gold: 0.10, oil: -0.30, crypto: 0 },
  },
  {
    id: 'rate_shock_2022',
    label: '2022 Rate Shock',
    period: 'Jan – Oct 2022',
    description: 'Fastest Fed hiking cycle in 40 years caused simultaneous equity and bond selloff — the worst 60/40 portfolio year in modern history. Crypto lost ~75%.',
    shocks: { equity: -0.25, bonds: -0.35, gold: -0.10, oil: 0.15, crypto: -0.75 },
  },
  {
    id: 'taper_tantrum',
    label: 'Taper Tantrum',
    period: 'May – Jun 2013',
    description: 'Fed signals end of QE: 10-year yields surged ~100bps in weeks. Emerging market assets and gold sold off sharply. Short but severe bond correction.',
    shocks: { equity: -0.06, bonds: -0.10, gold: -0.22, oil: -0.05, crypto: -0.60 },
  },
  {
    id: 'ukraine_war',
    label: 'Ukraine War Shock',
    period: 'Feb 24 – Mar 7, 2022',
    description: "Russia's invasion of Ukraine: European equities fell ~15%, energy spiked 35%, gold +10%. Two-week acute commodity and geopolitical shock.",
    shocks: { equity: -0.10, bonds: -0.02, gold: 0.10, oil: 0.35, crypto: -0.10 },
  },
];

export interface ShockedPrice {
  shocked: number;
  change: number;
  pct: number;
}

export function applyShock(currentPrice: number, shockFraction: number): ShockedPrice {
  const shocked = currentPrice * (1 + shockFraction);
  return { shocked, change: shocked - currentPrice, pct: shockFraction * 100 };
}

/** Format a shock fraction for display (e.g. −34.0%). */
export function fmtShock(fraction: number): string {
  const sign = fraction >= 0 ? '+' : '';
  return `${sign}${(fraction * 100).toFixed(1)}%`;
}
