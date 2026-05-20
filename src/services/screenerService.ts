/**
 * screenerService.ts — institutional market screener data layer.
 *
 * Normalises data from the existing gateway endpoints into a unified ScreenerRow
 * schema. Intelligence scores are computed locally from available price data
 * (regime, anomaly, and volatility classification) — no separate screener
 * endpoint is required.
 */

import { gatewayGet, ClientTTL } from './gatewayClient';
import { fetchQuotes, fetchMarketMovers } from './marketService';
import type { BatchQuoteRow } from './marketService';

// Chunk large symbol lists so each request stays within the gateway's 100-symbol
// batch limit. Chunks are fetched in parallel and results are merged.
// The deployed gateway caps /market/quotes at 25 symbols. Split large requests
// into chunks of 24 so every chunk fits under that limit, even before the
// gateway source change (slice 25→100) is compiled and redeployed.
async function fetchQuotesBatched(symbols: string[], chunkSize = 24): Promise<BatchQuoteRow[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += chunkSize) chunks.push(symbols.slice(i, i + chunkSize));
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        return await fetchQuotes(chunk);
      } catch (err) {
        console.error('[fetchQuotesBatched] Failed to fetch chunk:', chunk, err);
        return chunk.map((sym) => ({
          symbol: sym,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    })
  );
  return results.flat();
}

// ─── Domain types ────────────────────────────────────────────────────────────

export type VolatilityState = 'low' | 'normal' | 'elevated' | 'extreme';
export type RiskMode = 'risk-on' | 'risk-off' | 'neutral';
export type MarketStatus = 'pre-market' | 'open' | 'after-hours' | 'closed';

export type DiscoveryTab =
  | 'gainers' | 'losers' | 'active'
  | 'unusual-volume' | 'vol-expansion' | 'gap-up' | 'gap-down'
  | 'mega-caps' | 'sectors' | 'etfs' | 'fx' | 'commodities' | 'crypto'
  | 'saved';

export interface ScreenerRow {
  symbol: string;
  name: string;
  sector?: string;
  assetClass: 'equity' | 'etf' | 'fx' | 'crypto' | 'commodity' | 'index';
  price: number;
  changePercent: number;
  change?: number;
  volume?: number;
  relativeVolume?: number;
  marketCapTier?: 'mega' | 'large' | 'mid' | 'small';
  high?: number;
  low?: number;
  open?: number;
  previousClose?: number;
  // intelligence (locally computed)
  volatilityState: VolatilityState;
  momentumScore: number;       // –100 → +100
  anomalyTag?: string;
  intelligenceNote?: string;
  lastUpdated: number;
}

export interface PulseQuote {
  symbol: string;
  label: string;
  price: number;
  changePercent: number;
}

export interface MarketPulseData {
  indices: PulseQuote[];
  marketStatus: MarketStatus;
  riskMode: RiskMode;
  advancers: number;
  decliners: number;
  unchanged: number;
  breadthPct: number;         // advancers / (advancers + decliners)
  topSector?: string;
  worstSector?: string;
  fetchedAt: number;
}

export interface HeatmapCell {
  symbol: string;
  name: string;
  sector: string;
  changePercent: number;
  price?: number;
  weight: 'xl' | 'lg' | 'md' | 'sm';  // visual tile size tier
}

export interface HeatmapSector {
  name: string;
  avgChange: number;
  cells: HeatmapCell[];
}

// ─── Preset symbol universes ─────────────────────────────────────────────────

export const MEGA_CAP_SYMBOLS = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA',
  'BRK.B', 'JPM', 'AVGO', 'V', 'JNJ', 'XOM', 'MA', 'UNH', 'COST',
];

export const ETF_SYMBOLS = [
  'SPY', 'QQQ', 'IWM', 'EFA', 'EEM', 'GLD', 'TLT', 'HYG', 'LQD',
  'XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLU', 'XLRE', 'XLB', 'XLC', 'XLP', 'XLY',
];

export const SECTOR_ETF_SYMBOLS = [
  'XLK', 'XLF', 'XLV', 'XLI', 'XLE', 'XLU', 'XLRE', 'XLB', 'XLC', 'XLP', 'XLY',
];

export const FX_SYMBOLS = [
  'EUR/USD', 'USD/JPY', 'GBP/USD', 'AUD/USD', 'USD/CHF',
  'USD/CAD', 'NZD/USD', 'USD/MXN', 'USD/SGD',
];

export const COMMODITY_SYMBOLS = [
  'XAU/USD', 'XAG/USD', 'WTI/USD', 'BCO/USD', 'NG/USD', 'HG/USD',
];

export const CRYPTO_SYMBOLS = [
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'ADA/USD', 'AVAX/USD', 'DOGE/USD',
];

// Curated heatmap universe by sector
export const HEATMAP_SECTORS: { name: string; symbols: string[]; weights: Record<string, 'xl' | 'lg' | 'md' | 'sm'> }[] = [
  {
    name: 'Technology',
    symbols: ['AAPL', 'MSFT', 'NVDA', 'META', 'GOOGL', 'AVGO', 'AMD', 'ORCL', 'INTC', 'CRM'],
    weights: { AAPL: 'xl', MSFT: 'xl', NVDA: 'xl', META: 'lg', GOOGL: 'lg', AVGO: 'lg', AMD: 'md', ORCL: 'md', INTC: 'sm', CRM: 'sm' },
  },
  {
    name: 'Financials',
    symbols: ['JPM', 'V', 'MA', 'BAC', 'GS', 'MS', 'WFC', 'BLK', 'C', 'AXP'],
    weights: { JPM: 'xl', V: 'xl', MA: 'lg', BAC: 'lg', GS: 'md', MS: 'md', WFC: 'md', BLK: 'sm', C: 'sm', AXP: 'sm' },
  },
  {
    name: 'Healthcare',
    symbols: ['UNH', 'LLY', 'JNJ', 'ABBV', 'MRK', 'PFE', 'TMO', 'DHR', 'BMY', 'AMGN'],
    weights: { UNH: 'xl', LLY: 'xl', JNJ: 'lg', ABBV: 'lg', MRK: 'md', PFE: 'md', TMO: 'md', DHR: 'sm', BMY: 'sm', AMGN: 'sm' },
  },
  {
    name: 'Energy',
    symbols: ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'VLO', 'OXY', 'PSX', 'HAL'],
    weights: { XOM: 'xl', CVX: 'xl', COP: 'lg', SLB: 'md', EOG: 'md', MPC: 'sm', VLO: 'sm', OXY: 'sm', PSX: 'sm', HAL: 'sm' },
  },
  {
    name: 'Consumer',
    symbols: ['AMZN', 'TSLA', 'WMT', 'HD', 'COST', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW'],
    weights: { AMZN: 'xl', TSLA: 'xl', WMT: 'lg', HD: 'lg', COST: 'md', MCD: 'md', NKE: 'sm', SBUX: 'sm', TGT: 'sm', LOW: 'sm' },
  },
  {
    name: 'Industrials',
    symbols: ['CAT', 'GE', 'HON', 'BA', 'LMT', 'UPS', 'RTX', 'DE', 'GD', 'EMR'],
    weights: { CAT: 'xl', GE: 'xl', HON: 'lg', BA: 'lg', LMT: 'md', UPS: 'md', RTX: 'sm', DE: 'sm', GD: 'sm', EMR: 'sm' },
  },
];

// Extended heatmap universe — equity + FX + crypto + commodities + ETFs
export const HEATMAP_SECTORS_EXTENDED: typeof HEATMAP_SECTORS = [
  ...HEATMAP_SECTORS,
  {
    name: 'ETFs',
    symbols: ['SPY', 'QQQ', 'IWM', 'EFA', 'EEM', 'TLT', 'GLD', 'HYG', 'LQD', 'XLF', 'XLK', 'XLE'],
    weights: { SPY: 'xl', QQQ: 'xl', IWM: 'lg', EFA: 'lg', EEM: 'md', TLT: 'md', GLD: 'md', HYG: 'sm', LQD: 'sm', XLF: 'sm', XLK: 'sm', XLE: 'sm' },
  },
  {
    name: 'FX',
    symbols: ['EUR/USD', 'USD/JPY', 'GBP/USD', 'AUD/USD', 'USD/CHF', 'USD/CAD', 'NZD/USD', 'USD/MXN'],
    weights: { 'EUR/USD': 'xl', 'USD/JPY': 'xl', 'GBP/USD': 'lg', 'AUD/USD': 'md', 'USD/CHF': 'md', 'USD/CAD': 'md', 'NZD/USD': 'sm', 'USD/MXN': 'sm' },
  },
  {
    name: 'Crypto',
    symbols: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'ADA/USD', 'AVAX/USD', 'DOGE/USD'],
    weights: { 'BTC/USD': 'xl', 'ETH/USD': 'xl', 'SOL/USD': 'lg', 'XRP/USD': 'md', 'ADA/USD': 'sm', 'AVAX/USD': 'sm', 'DOGE/USD': 'sm' },
  },
  {
    name: 'Commodities',
    symbols: ['XAU/USD', 'XAG/USD', 'WTI/USD', 'BCO/USD', 'NG/USD', 'HG/USD'],
    weights: { 'XAU/USD': 'xl', 'XAG/USD': 'lg', 'WTI/USD': 'lg', 'BCO/USD': 'md', 'NG/USD': 'sm', 'HG/USD': 'sm' },
  },
];

export async function fetchExtendedHeatmapData(): Promise<HeatmapSector[]> {
  const allSymbols = HEATMAP_SECTORS_EXTENDED.flatMap((s) => s.symbols);
  const rows = await fetchQuotesBatched(allSymbols);
  const rowMap = new Map(rows.filter((r) => r.ok && r.data).map((r) => [r.symbol, r.data!]));

  return HEATMAP_SECTORS_EXTENDED.map((sector) => {
    const cells: HeatmapCell[] = sector.symbols.map((sym) => ({
      symbol: sym,
      name: sym,
      sector: sector.name,
      changePercent: rowMap.get(sym)?.changePercent ?? 0,
      price: rowMap.get(sym)?.price,
      weight: sector.weights[sym] ?? 'sm',
    }));
    const live = cells.filter((c) => rowMap.has(c.symbol));
    const avgChange = live.length
      ? live.reduce((s, c) => s + c.changePercent, 0) / live.length
      : 0;
    return { name: sector.name, avgChange, cells };
  });
}

// Index symbols for market pulse strip
export const PULSE_SYMBOLS = [
  { symbol: 'SPY',   label: 'SPY' },
  { symbol: 'QQQ',   label: 'QQQ' },
  { symbol: 'IWM',   label: 'IWM' },
  { symbol: 'UVXY',  label: 'VIX' },
  { symbol: 'UUP',   label: 'DXY' },
];

// ─── Intelligence computation ─────────────────────────────────────────────────

export function computeVolatilityState(changePercent: number): VolatilityState {
  const abs = Math.abs(changePercent);
  if (abs < 0.4) return 'low';
  if (abs < 1.8) return 'normal';
  if (abs < 4.5) return 'elevated';
  return 'extreme';
}

export function computeMomentumScore(changePercent: number): number {
  const clamped = Math.max(-10, Math.min(10, changePercent));
  return Math.round((clamped / 10) * 100);
}

export function computeAnomalyTag(changePercent: number, volume?: number, relVol?: number): string | undefined {
  const abs = Math.abs(changePercent);
  if (relVol != null && relVol > 4) return `Vol ${relVol.toFixed(1)}x avg`;
  if (relVol != null && relVol > 2) return `Vol ${relVol.toFixed(1)}x avg`;
  if (abs > 8) return 'Extreme move';
  if (abs > 5) return 'Major move';
  if (abs > 3.5) return 'Notable move';
  return undefined;
}

export function buildIntelligenceNote(row: Pick<ScreenerRow, 'changePercent' | 'volatilityState' | 'relativeVolume'>): string {
  const { changePercent, volatilityState, relativeVolume } = row;
  const abs = Math.abs(changePercent);
  const dir = changePercent >= 0 ? 'advancing' : 'declining';

  const volNote = relativeVolume != null && relativeVolume > 1.5
    ? ` Volume is ${relativeVolume.toFixed(1)}× above the 30-day average, suggesting ${relativeVolume > 3 ? 'institutional' : 'above-average'} participation.`
    : '';

  if (volatilityState === 'extreme') {
    return `Experiencing an extreme ${abs.toFixed(1)}% single-session move — statistically rare and likely catalyst-driven.${volNote}`;
  }
  if (volatilityState === 'elevated') {
    return `${dir.charAt(0).toUpperCase() + dir.slice(1)} ${abs.toFixed(1)}% with elevated volatility, indicating active price discovery.${volNote}`;
  }
  return `${dir.charAt(0).toUpperCase() + dir.slice(1)} ${abs.toFixed(2)}% with ${volatilityState} volatility.${volNote}`;
}

// ─── Normalisation helpers ────────────────────────────────────────────────────

type MoverItem = { ticker?: string; symbol?: string; name?: string; companyName?: string; price: number; change?: number; changesPercentage?: number; changePercent?: number };

export function normalizeMoverRow(item: MoverItem): ScreenerRow {
  const symbol = (item.symbol ?? item.ticker ?? '').toUpperCase();
  const name = item.name ?? item.companyName ?? symbol;
  const changePercent = item.changesPercentage ?? item.changePercent ?? 0;
  const volState = computeVolatilityState(changePercent);

  return {
    symbol,
    name,
    assetClass: 'equity',
    price: item.price,
    changePercent,
    change: item.change,
    volatilityState: volState,
    momentumScore: computeMomentumScore(changePercent),
    anomalyTag: computeAnomalyTag(changePercent),
    intelligenceNote: buildIntelligenceNote({ changePercent, volatilityState: volState, relativeVolume: undefined }),
    lastUpdated: Date.now(),
  };
}

export function normalizeBatchRows(rows: BatchQuoteRow[], assetClass: ScreenerRow['assetClass'], sectorMap?: Record<string, string>): ScreenerRow[] {
  return rows
    .filter((r) => r.ok && r.data)
    .map((r) => {
      const q = r.data!;
      const changePercent = q.changePercent ?? 0;
      const volState = computeVolatilityState(changePercent);
      return {
        symbol: r.symbol,
        name: r.symbol,
        sector: sectorMap?.[r.symbol],
        assetClass,
        price: q.price,
        changePercent,
        change: q.change,
        high: q.high,
        low: q.low,
        open: q.open,
        previousClose: q.previousClose,
        volatilityState: volState,
        momentumScore: computeMomentumScore(changePercent),
        anomalyTag: computeAnomalyTag(changePercent),
        intelligenceNote: buildIntelligenceNote({ changePercent, volatilityState: volState, relativeVolume: undefined }),
        lastUpdated: Date.now(),
      };
    });
}

// ─── Movers fallback ──────────────────────────────────────────────────────────
// When the dedicated movers endpoint (FMP) returns an empty list — e.g., key not
// configured or quota exceeded — synthesise movers by fetching batch quotes for
// the curated large-cap universe and sorting by changePercent. This guarantees
// the screener always shows something meaningful.

const MOVERS_FALLBACK_SYMBOLS = [...MEGA_CAP_SYMBOLS, 'NVDA', 'AMD', 'TSLA', 'AMZN', 'NFLX', 'SHOP', 'COIN', 'PLTR', 'SNOW'];

async function fetchMoversWithFallback(type: 'gainers' | 'losers' | 'active'): Promise<ScreenerRow[]> {
  const apiData = await fetchMarketMovers(type);
  if (apiData.length > 0) {
    return apiData.map(normalizeMoverRow);
  }
  // FMP returned nothing — synthesise from batch quotes
  const uniqueSymbols = [...new Set(MOVERS_FALLBACK_SYMBOLS)];
  const rows = await fetchQuotes(uniqueSymbols);
  const normalized = normalizeBatchRows(rows, 'equity');
  if (type === 'gainers') {
    return normalized.filter(r => r.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent);
  }
  if (type === 'losers') {
    return normalized.filter(r => r.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent);
  }
  // active: sort by absolute change
  return normalized.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
}

// ─── Screener fetch functions ─────────────────────────────────────────────────

export async function fetchScreenerRows(tab: DiscoveryTab, pinnedSymbols: string[] = []): Promise<ScreenerRow[]> {
  switch (tab) {
    case 'gainers': {
      return fetchMoversWithFallback('gainers');
    }
    case 'losers': {
      return fetchMoversWithFallback('losers');
    }
    case 'active': {
      return fetchMoversWithFallback('active');
    }
    case 'unusual-volume': {
      const rows = await fetchMoversWithFallback('active');
      return rows.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    }
    case 'vol-expansion': {
      const [g, l] = await Promise.all([
        fetchMoversWithFallback('gainers'),
        fetchMoversWithFallback('losers'),
      ]);
      return [...g, ...l]
        .filter((r) => r.volatilityState === 'elevated' || r.volatilityState === 'extreme')
        .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    }
    case 'gap-up': {
      const rows = await fetchMoversWithFallback('gainers');
      return rows.filter((r) => r.changePercent > 2);
    }
    case 'gap-down': {
      const rows = await fetchMoversWithFallback('losers');
      return rows.filter((r) => r.changePercent < -2);
    }
    case 'mega-caps': {
      const rows = await fetchQuotes(MEGA_CAP_SYMBOLS);
      return normalizeBatchRows(rows, 'equity');
    }
    case 'sectors': {
      const rows = await fetchQuotes(SECTOR_ETF_SYMBOLS);
      return normalizeBatchRows(rows, 'etf');
    }
    case 'etfs': {
      const rows = await fetchQuotes(ETF_SYMBOLS);
      return normalizeBatchRows(rows, 'etf');
    }
    case 'fx': {
      const rows = await fetchQuotes(FX_SYMBOLS);
      return normalizeBatchRows(rows, 'fx');
    }
    case 'commodities': {
      const rows = await fetchQuotes(COMMODITY_SYMBOLS);
      return normalizeBatchRows(rows, 'commodity');
    }
    case 'crypto': {
      const rows = await fetchQuotes(CRYPTO_SYMBOLS);
      return normalizeBatchRows(rows, 'crypto');
    }
    case 'saved': {
      if (!pinnedSymbols.length) return [];
      const rows = await fetchQuotes(pinnedSymbols);
      return normalizeBatchRows(rows, 'equity');
    }
    default:
      return [];
  }
}

// Fetch heatmap data for all sectors in one batch
export async function fetchHeatmapData(): Promise<HeatmapSector[]> {
  const allSymbols = HEATMAP_SECTORS.flatMap((s) => s.symbols);
  const rows = await fetchQuotesBatched(allSymbols);
  const rowMap = new Map(rows.filter((r) => r.ok && r.data).map((r) => [r.symbol, r.data!]));

  return HEATMAP_SECTORS.map((sector) => {
    const cells: HeatmapCell[] = sector.symbols.map((sym) => ({
      symbol: sym,
      name: sym,
      sector: sector.name,
      changePercent: rowMap.get(sym)?.changePercent ?? 0,
      price: rowMap.get(sym)?.price,
      weight: sector.weights[sym] ?? 'sm',
    }));
    const live = cells.filter((c) => rowMap.has(c.symbol));
    const avgChange = live.length
      ? live.reduce((s, c) => s + c.changePercent, 0) / live.length
      : 0;
    return { name: sector.name, avgChange, cells };
  });
}

// Fetch pulse data for the market strip
export async function fetchMarketPulse(): Promise<MarketPulseData> {
  const symbols = PULSE_SYMBOLS.map((p) => p.symbol);
  const rows = await fetchQuotes(symbols);
  const rowMap = new Map(rows.filter((r) => r.ok && r.data).map((r) => [r.symbol, r.data!]));

  const indices: PulseQuote[] = PULSE_SYMBOLS
    .filter(({ symbol }) => rowMap.has(symbol))
    .map(({ symbol, label }) => ({
      symbol,
      label,
      price: rowMap.get(symbol)!.price,
      changePercent: rowMap.get(symbol)!.changePercent ?? 0,
    }));

  const spy = rowMap.get('SPY');
  const vix = rowMap.get('UVXY');
  let riskMode: RiskMode = 'neutral';
  if (spy && vix) {
    if (spy.changePercent != null && spy.changePercent > 0.3 && (vix.changePercent ?? 0) < 0) riskMode = 'risk-on';
    else if (spy.changePercent != null && spy.changePercent < -0.3 && (vix.changePercent ?? 0) > 0) riskMode = 'risk-off';
  }

  // Estimate breadth from indices performance
  const positiveCount = indices.filter((i) => i.changePercent > 0).length;
  const negativeCount = indices.filter((i) => i.changePercent < 0).length;
  const total = positiveCount + negativeCount;

  return {
    indices,
    marketStatus: getMarketStatus(),
    riskMode,
    advancers: positiveCount,
    decliners: negativeCount,
    unchanged: indices.length - positiveCount - negativeCount,
    breadthPct: total > 0 ? Math.round((positiveCount / total) * 100) : 50,
    fetchedAt: Date.now(),
  };
}

// ─── Market status (ET time) ─────────────────────────────────────────────────

export function getMarketStatus(): MarketStatus {
  const now = new Date();
  // ET = UTC-5 (EST) or UTC-4 (EDT)
  const etOffset = isDST(now) ? -4 : -5;
  const etNow = new Date(now.getTime() + etOffset * 60 * 60 * 1000);
  const etHour = etNow.getUTCHours();
  const etMin = etNow.getUTCMinutes();
  const etDay = etNow.getUTCDay();
  const totalMin = etHour * 60 + etMin;

  if (etDay === 0 || etDay === 6) return 'closed';
  if (totalMin >= 4 * 60 && totalMin < 9 * 60 + 30) return 'pre-market';
  if (totalMin >= 9 * 60 + 30 && totalMin < 16 * 60) return 'open';
  if (totalMin >= 16 * 60 && totalMin < 20 * 60) return 'after-hours';
  return 'closed';
}

function isDST(date: Date): boolean {
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  return date.getTimezoneOffset() < Math.max(jan, jul);
}

// ─── ETF sector name map ──────────────────────────────────────────────────────

export const ETF_SECTOR_NAMES: Record<string, string> = {
  XLK: 'Technology',  XLF: 'Financials', XLV: 'Healthcare',
  XLI: 'Industrials', XLE: 'Energy',     XLU: 'Utilities',
  XLRE: 'Real Estate', XLB: 'Materials', XLC: 'Communication',
  XLP: 'Cons. Staples', XLY: 'Cons. Discret.',
};
