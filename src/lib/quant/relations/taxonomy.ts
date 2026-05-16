/**
 * Institutional taxonomy for Relations Map.
 *
 * Encodes well-known, slow-moving market truths (sector membership, ETF
 * exposure, benchmark mapping, macro proxies). These mappings are reference
 * data, not fabricated relationships — derived edge strengths come from
 * real OHLCV via the engine producers.
 */

export interface SectorEntry {
  symbol: string;
  sector: string;
  industry?: string;
}

export const SECTOR_TAXONOMY: SectorEntry[] = [
  { symbol: 'AAPL',  sector: 'Technology', industry: 'Consumer Electronics' },
  { symbol: 'MSFT',  sector: 'Technology', industry: 'Software Infrastructure' },
  { symbol: 'GOOGL', sector: 'Technology', industry: 'Internet Services' },
  { symbol: 'META',  sector: 'Technology', industry: 'Internet Services' },
  { symbol: 'AMZN',  sector: 'Consumer Discretionary', industry: 'Internet Retail' },
  { symbol: 'TSLA',  sector: 'Consumer Discretionary', industry: 'Auto Manufacturers' },
  { symbol: 'NVDA',  sector: 'Technology', industry: 'Semiconductors' },
  { symbol: 'AMD',   sector: 'Technology', industry: 'Semiconductors' },
  { symbol: 'AVGO',  sector: 'Technology', industry: 'Semiconductors' },
  { symbol: 'TSM',   sector: 'Technology', industry: 'Semiconductors' },
  { symbol: 'INTC',  sector: 'Technology', industry: 'Semiconductors' },
  { symbol: 'MU',    sector: 'Technology', industry: 'Semiconductors' },
  { symbol: 'JPM',   sector: 'Financials', industry: 'Diversified Banks' },
  { symbol: 'BAC',   sector: 'Financials', industry: 'Diversified Banks' },
  { symbol: 'GS',    sector: 'Financials', industry: 'Investment Banking' },
  { symbol: 'WFC',   sector: 'Financials', industry: 'Diversified Banks' },
  { symbol: 'XOM',   sector: 'Energy', industry: 'Integrated Oil & Gas' },
  { symbol: 'CVX',   sector: 'Energy', industry: 'Integrated Oil & Gas' },
  { symbol: 'COP',   sector: 'Energy', industry: 'Oil & Gas E&P' },
  { symbol: 'JNJ',   sector: 'Healthcare', industry: 'Pharmaceuticals' },
  { symbol: 'PFE',   sector: 'Healthcare', industry: 'Pharmaceuticals' },
  { symbol: 'LLY',   sector: 'Healthcare', industry: 'Pharmaceuticals' },
  { symbol: 'UNH',   sector: 'Healthcare', industry: 'Managed Care' },
];

export const SECTOR_ETF: Record<string, string> = {
  'Technology':              'XLK',
  'Financials':              'XLF',
  'Energy':                  'XLE',
  'Healthcare':              'XLV',
  'Consumer Discretionary':  'XLY',
  'Consumer Staples':        'XLP',
  'Industrials':             'XLI',
  'Materials':               'XLB',
  'Real Estate':             'XLRE',
  'Utilities':               'XLU',
  'Communication Services':  'XLC',
};

export const INDUSTRY_ETF: Record<string, string> = {
  'Semiconductors':       'SMH',
  'Software Infrastructure': 'IGV',
  'Internet Services':    'FDN',
  'Internet Retail':      'XRT',
  'Pharmaceuticals':      'XPH',
  'Integrated Oil & Gas': 'XLE',
};

export const PRIMARY_BENCHMARKS = ['SPY', 'QQQ'] as const;
export const MACRO_PROXIES = ['DXY', 'TLT', 'GLD', 'VIX'] as const;

export function classifySymbol(symbol: string): SectorEntry | null {
  const up = symbol.toUpperCase();
  return SECTOR_TAXONOMY.find((s) => s.symbol === up) ?? null;
}

export function peersOf(symbol: string, cap = 6): string[] {
  const entry = classifySymbol(symbol);
  if (!entry) return [];
  return SECTOR_TAXONOMY
    .filter((s) => s.sector === entry.sector && s.symbol !== entry.symbol)
    .map((s) => s.symbol)
    .slice(0, cap);
}

export function benchmarksFor(symbol: string): string[] {
  const out = new Set<string>(PRIMARY_BENCHMARKS);
  const entry = classifySymbol(symbol);
  if (entry) {
    const sectorEtf = SECTOR_ETF[entry.sector];
    if (sectorEtf) out.add(sectorEtf);
    if (entry.industry && INDUSTRY_ETF[entry.industry]) out.add(INDUSTRY_ETF[entry.industry]);
  }
  out.delete(symbol.toUpperCase());
  return Array.from(out);
}
