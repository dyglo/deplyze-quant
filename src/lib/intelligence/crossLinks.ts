/**
 * Cross-dashboard linking rules (Wave G).
 *
 * Maps an instrument or regime → a list of related dashboards the user
 * should consider. The mapping is intentionally curated, not exhaustive:
 * we surface the 2-3 dashboards that actually inform the question, not
 * every available page.
 *
 * Example flows from the wave brief:
 *   US Sector → Global Yields → FX & Liquidity → Narrative
 *   Commodities → Inflation Regime → Global Yields → FX
 *   FX → Macro Regime → Global Yields → Opportunity Radar (future)
 *
 * Each link includes an optional `filter` hint so the destination
 * dashboard can pre-narrow to the relevant slice when Wave G+ wires
 * router state consumption on each page.
 */
import type { LinkedDashboard } from '../../components/intelligence-drawer';

type AssetClass = 'equity' | 'etf' | 'index' | 'fx' | 'commodity' | 'crypto' | 'fixed_income';

/** All known intelligence dashboards. */
const ROUTES = {
  worldEquity: '/market/world-equity',
  sectors: '/market/us-sectors',
  yields: '/market/global-yields',
  countries: '/market/countries',
  commodities: '/market/commodities',
  fx: '/market/fx-liquidity',
};

const SECTOR_SYMBOLS = new Set(['XLK', 'XLF', 'XLV', 'XLI', 'XLE', 'XLU', 'XLRE', 'XLB', 'XLC', 'XLP', 'XLY', 'SPY']);
const COMMODITY_SYMBOLS = new Set(['WTI/USD', 'BCO/USD', 'NG/USD', 'XAU/USD', 'XAG/USD', 'HG/USD']);
const FX_SYMBOLS_SET = new Set(['UUP', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD']);
const COUNTRY_ETFS = new Set(['EWJ', 'EWG', 'EWU', 'EWC', 'EWA', 'EWL', 'EWD', 'EWT', 'EWY', 'FXI', 'EWZ', 'INDA', 'EWW', 'EWS', 'EEM', 'EFA', 'VEA', 'VWO', 'ACWI', 'VT']);

const RATE_SENSITIVE_SECTORS: Record<string, string> = {
  XLU: 'Utilities are rate-sensitive — confirm against the curve.',
  XLRE: 'REITs are rate-sensitive — confirm against the curve.',
  XLF: 'Financials respond to curve steepness — check the 10Y–2Y spread.',
};

const COMMODITY_LINKS: Record<string, { yields?: string; fx?: string }> = {
  'XAU/USD': {
    yields: 'Gold tracks real rates — check 10Y minus 5Y breakeven.',
    fx: 'Gold inversely tracks the dollar regime.',
  },
  'XAG/USD': {
    yields: 'Silver is hybrid: real-rate and industrial demand.',
    fx: 'Silver tracks dollar weakness.',
  },
  'WTI/USD': {
    fx: 'Oil moves inversely with the dollar over longer horizons.',
  },
  'BCO/USD': {
    fx: 'Brent oil moves inversely with the dollar.',
  },
  'HG/USD': {
    fx: 'Copper is dollar-sensitive and China-linked.',
  },
};

const COUNTRY_COMMODITY_LINKS: Record<string, { commodity: string; note: string }> = {
  EWZ: { commodity: 'XAU/USD', note: 'Brazil — commodity-export exposed.' },
  EWA: { commodity: 'HG/USD', note: 'Australia — copper / China cycle.' },
  EWC: { commodity: 'WTI/USD', note: 'Canada — oil-export exposed.' },
  FXI: { commodity: 'HG/USD', note: 'China — copper / global growth proxy.' },
};

export interface CrossLinkInput {
  symbol: string;
  assetClass?: AssetClass | string;
}

export function buildLinksForSymbol({ symbol, assetClass }: CrossLinkInput): LinkedDashboard[] {
  const sym = symbol.toUpperCase();
  const links: LinkedDashboard[] = [];

  // Sector ETFs → Yields (rate sensitivity) + FX (dollar regime for cyclicals)
  if (SECTOR_SYMBOLS.has(sym)) {
    if (RATE_SENSITIVE_SECTORS[sym]) {
      links.push({
        label: 'Global Yields',
        description: RATE_SENSITIVE_SECTORS[sym],
        to: ROUTES.yields,
        state: { fromSymbol: sym, fromDashboard: 'sectors' },
      });
    } else {
      links.push({
        label: 'Global Yields',
        description: 'Rate environment for sector benchmark.',
        to: ROUTES.yields,
        state: { fromSymbol: sym, fromDashboard: 'sectors' },
      });
    }
    if (sym === 'XLE' || sym === 'XLB') {
      links.push({
        label: 'Commodities',
        description: sym === 'XLE' ? 'Crude oil exposure for energy sector.' : 'Industrial metals for materials sector.',
        to: ROUTES.commodities,
        state: { fromSymbol: sym, fromDashboard: 'sectors' },
        filter: sym === 'XLE' ? 'energy' : 'metals',
      });
    }
    links.push({
      label: 'FX & Liquidity',
      description: 'Dollar regime for cyclical / cross-border exposure.',
      to: ROUTES.fx,
      state: { fromSymbol: sym, fromDashboard: 'sectors' },
    });
    return links;
  }

  // Commodities → Yields + FX, with bespoke descriptions
  if (COMMODITY_SYMBOLS.has(sym) || (assetClass === 'commodity')) {
    const meta = COMMODITY_LINKS[symbol] ?? {};
    links.push({
      label: 'Global Yields',
      description: meta.yields ?? 'Real-rate context for the commodity.',
      to: ROUTES.yields,
      state: { fromSymbol: sym, fromDashboard: 'commodities' },
    });
    links.push({
      label: 'FX & Liquidity',
      description: meta.fx ?? 'Dollar regime — commodities are dollar-priced.',
      to: ROUTES.fx,
      state: { fromSymbol: sym, fromDashboard: 'commodities' },
    });
    return links;
  }

  // FX → Yields (rate differentials) + Commodities (dollar transmission)
  if (FX_SYMBOLS_SET.has(symbol) || assetClass === 'fx') {
    links.push({
      label: 'Global Yields',
      description: 'Rate differentials drive FX moves.',
      to: ROUTES.yields,
      state: { fromSymbol: sym, fromDashboard: 'fx' },
    });
    links.push({
      label: 'Commodities',
      description: 'Dollar regime transmits to commodity prices.',
      to: ROUTES.commodities,
      state: { fromSymbol: sym, fromDashboard: 'fx' },
    });
    if (sym === 'UUP' || symbol.includes('USD')) {
      links.push({
        label: 'World Equity',
        description: 'Dollar strength typically pressures EM equity.',
        to: ROUTES.worldEquity,
        state: { fromSymbol: sym, fromDashboard: 'fx' },
        filter: 'emerging',
      });
    }
    return links;
  }

  // Country ETFs → FX (local currency) + Commodities (when export-exposed)
  if (COUNTRY_ETFS.has(sym)) {
    links.push({
      label: 'FX & Liquidity',
      description: 'Dollar regime affects this country market.',
      to: ROUTES.fx,
      state: { fromSymbol: sym, fromDashboard: 'countries' },
    });
    const commodityLink = COUNTRY_COMMODITY_LINKS[sym];
    if (commodityLink) {
      links.push({
        label: 'Commodities',
        description: commodityLink.note,
        to: ROUTES.commodities,
        state: { fromSymbol: sym, fromDashboard: 'countries' },
        filter: commodityLink.commodity,
      });
    }
    links.push({
      label: 'World Equity',
      description: 'Compare against regional peers.',
      to: ROUTES.worldEquity,
      state: { fromSymbol: sym, fromDashboard: 'countries' },
    });
    return links;
  }

  // Default — broad cross-asset context
  links.push({
    label: 'Global Yields',
    description: 'Macro rate environment.',
    to: ROUTES.yields,
    state: { fromSymbol: sym },
  });
  links.push({
    label: 'FX & Liquidity',
    description: 'Dollar regime context.',
    to: ROUTES.fx,
    state: { fromSymbol: sym },
  });
  return links;
}
