/**
 * edgarService — SEC EDGAR filing ingestion and XBRL fundamentals.
 *
 * The SEC requires a compliant User-Agent. Configure SEC_EDGAR_USER_AGENT
 * on the gateway side. If EDGAR is not configured, endpoints return graceful
 * 503 responses that the frontend handles without crashing.
 */

import { gatewayGet, GatewayError, ClientTTL } from './gatewayClient';
import type { SecFiling, EdgarFundamentalsSnapshot } from '../lib/market-data/contracts';

// ─── Recent filings ────────────────────────────────────────────────────────

export type EdgarFormType = '10-K' | '10-Q' | '8-K' | 'DEF 14A' | '4' | 'SC 13G' | 'SC 13D' | string;

export interface FilingsResponse {
  symbol: string;
  filings: SecFiling[];
  count: number;
}

export async function fetchFilings(
  symbol: string,
  opts: { forms?: EdgarFormType[]; limit?: number } = {},
): Promise<FilingsResponse> {
  const params: Record<string, string | number> = {};
  if (opts.forms?.length) params.forms = opts.forms.join(',');
  if (opts.limit) params.limit = opts.limit;

  try {
    return await gatewayGet<FilingsResponse>(
      `/edgar/${encodeURIComponent(symbol)}/filings`,
      params,
      ClientTTL.ohlcv_daily,
    );
  } catch (err) {
    if (err instanceof GatewayError && err.status === 503) {
      return { symbol, filings: [], count: 0 };
    }
    throw err;
  }
}

// ─── XBRL fundamentals snapshot ───────────────────────────────────────────

export async function fetchEdgarFundamentals(symbol: string): Promise<EdgarFundamentalsSnapshot | null> {
  try {
    return await gatewayGet<EdgarFundamentalsSnapshot>(
      `/edgar/${encodeURIComponent(symbol)}/snapshot`,
      undefined,
      ClientTTL.ohlcv_daily,
    );
  } catch (err) {
    if (err instanceof GatewayError && (err.status === 503 || err.status === 404)) return null;
    throw err;
  }
}

// ─── CIK lookup ──────────────────────────────────────────────────────────

export interface CikLookup {
  symbol: string;
  cik: number;
  cikPadded: string;
}

export async function fetchCik(symbol: string): Promise<CikLookup | null> {
  try {
    return await gatewayGet<CikLookup>(
      `/edgar/${encodeURIComponent(symbol)}/cik`,
      undefined,
      24 * 60 * 60_000, // 24h cache
    );
  } catch (err) {
    if (err instanceof GatewayError && (err.status === 503 || err.status === 404)) return null;
    throw err;
  }
}

// ─── Filing search ────────────────────────────────────────────────────────

export interface FilingSearchHit {
  id: string;
  form_type: string;
  file_date: string;
  period_of_report?: string;
  display_names: string[];
}

export interface FilingSearchResponse {
  hits: FilingSearchHit[];
  count: number;
}

export async function searchFilings(opts: {
  query?: string;
  ticker?: string;
  forms?: EdgarFormType[];
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<FilingSearchResponse> {
  const params: Record<string, string | number> = {};
  if (opts.query) params.q = opts.query;
  if (opts.ticker) params.ticker = opts.ticker;
  if (opts.forms?.length) params.forms = opts.forms.join(',');
  if (opts.startDate) params.startDate = opts.startDate;
  if (opts.endDate) params.endDate = opts.endDate;
  if (opts.limit) params.limit = opts.limit;

  try {
    return await gatewayGet<FilingSearchResponse>(
      '/edgar/search',
      params,
      ClientTTL.news,
    );
  } catch (err) {
    if (err instanceof GatewayError && err.status === 503) {
      return { hits: [], count: 0 };
    }
    throw err;
  }
}

// ─── EDGAR helpers ────────────────────────────────────────────────────────

/** Returns the EDGAR filing viewer URL for a given accession number and CIK. */
export function edgarFilingUrl(cik: number, accession: string): string {
  const acc = accession.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/`;
}

/** Returns the EDGAR company page URL. */
export function edgarCompanyUrl(cik: number): string {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K&dateb=&owner=include&count=10`;
}
