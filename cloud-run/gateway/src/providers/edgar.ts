/**
 * SEC EDGAR adapter — institutional filing ingestion.
 * Supports: 10-K, 10-Q, 8-K, insider filings, company facts (XBRL).
 *
 * IMPORTANT: All EDGAR API requests MUST include a User-Agent header of the form:
 *   "CompanyName contact@email.com"
 * Configure via SEC_EDGAR_USER_AGENT env var.
 *
 * Rate limit: SEC allows max 10 requests/second per IP.
 * Docs: https://www.sec.gov/developer
 */

import { requireEnv } from './http';

const DATA_BASE = 'https://data.sec.gov';
const REF_BASE  = 'https://www.sec.gov';
const EFTS_BASE = 'https://efts.sec.gov';

// ─── User-Agent (mandatory per SEC policy) ────────────────────────────────

function userAgent(): string {
  const ua = process.env.SEC_EDGAR_USER_AGENT || process.env.SEC_EDGAR_API_TOKEN;
  if (!ua) {
    throw new Error(
      'SEC_EDGAR_USER_AGENT must be set to a compliant "AppName contact@email.com" string.',
    );
  }
  return ua;
}

function edgarHeaders(): Record<string, string> {
  return { 'User-Agent': userAgent(), Accept: 'application/json' };
}

async function edgarGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: edgarHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[edgar] ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── CIK resolution ──────────────────────────────────────────────────────

interface CikEntry { cik_str: number; ticker: string; title: string; }

let _cikCache: Map<string, number> | null = null;
let _cikCachedAt = 0;

async function getCikMap(): Promise<Map<string, number>> {
  if (_cikCache && Date.now() - _cikCachedAt < 24 * 60 * 60_000) return _cikCache;
  const raw = await edgarGet<Record<string, CikEntry>>(`${REF_BASE}/files/company_tickers.json`);
  const map = new Map<string, number>();
  for (const e of Object.values(raw)) map.set(e.ticker.toUpperCase(), e.cik_str);
  _cikCache = map;
  _cikCachedAt = Date.now();
  return map;
}

export async function lookupCik(symbol: string): Promise<number | null> {
  const map = await getCikMap();
  return map.get(symbol.toUpperCase()) ?? null;
}

function padCik(cik: number): string {
  return String(cik).padStart(10, '0');
}

// ─── Company Submissions (filing history) ─────────────────────────────────

export interface EdgarRecentFilings {
  accessionNumber: string[];
  filingDate: string[];
  reportDate: string[];
  form: string[];
  primaryDocument: string[];
  primaryDocDescription: string[];
  items: string[];
}

export interface EdgarSubmissions {
  cik: string;
  entityType: string;
  sic?: string;
  sicDescription?: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  filings: { recent: EdgarRecentFilings };
}

export async function getSubmissions(cik: number): Promise<EdgarSubmissions> {
  return edgarGet<EdgarSubmissions>(`${DATA_BASE}/submissions/CIK${padCik(cik)}.json`);
}

// ─── Normalised Filing record ──────────────────────────────────────────────

export interface EdgarFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  form: string;
  primaryDocument: string;
  description: string;
  viewUrl: string; // HTML viewer on EDGAR
}

export async function getFilings(
  symbol: string,
  opts: { forms?: string[]; limit?: number } = {},
): Promise<EdgarFiling[]> {
  const cik = await lookupCik(symbol);
  if (!cik) throw new Error(`EDGAR: CIK not found for ${symbol}`);

  const subs = await getSubmissions(cik);
  const r = subs.filings.recent;
  const limit = opts.limit ?? 20;
  const formFilter = opts.forms?.map((f) => f.toUpperCase());

  const results: EdgarFiling[] = [];
  for (let i = 0; i < r.form.length && results.length < limit; i++) {
    const form = r.form[i];
    if (formFilter && !formFilter.includes(form.toUpperCase())) continue;
    const acc = r.accessionNumber[i].replace(/-/g, '');
    const paddedCik = padCik(cik);
    results.push({
      accessionNumber: r.accessionNumber[i],
      filingDate: r.filingDate[i],
      reportDate: r.reportDate[i],
      form,
      primaryDocument: r.primaryDocument[i],
      description: r.primaryDocDescription[i],
      viewUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${r.primaryDocument[i]}`,
    });
    void paddedCik; // used for URL construction logic above
  }
  return results;
}

// ─── Company Facts (XBRL fundamentals) ───────────────────────────────────

export interface XbrlFactEntry {
  accn: string;
  fy: number;
  fp: string;   // 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'FY'
  form: string;
  filed: string;
  end: string;
  val: number;
  frame?: string;
}

export interface XbrlConcept {
  label: string;
  description: string;
  units: Record<string, XbrlFactEntry[]>;
}

export interface EdgarCompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    'us-gaap'?: Record<string, XbrlConcept>;
    dei?: Record<string, XbrlConcept>;
  };
}

export async function getCompanyFacts(cik: number): Promise<EdgarCompanyFacts> {
  return edgarGet<EdgarCompanyFacts>(`${DATA_BASE}/api/xbrl/companyfacts/CIK${padCik(cik)}.json`);
}

// ─── Normalised XBRL snapshot ─────────────────────────────────────────────
// Extracts a curated set of GAAP concepts for institutional snapshots.

export interface EdgarFundamentalsSnapshot {
  symbol: string;
  cik: number;
  entityName: string;
  asOf: string;
  // Income
  revenue?: number;
  netIncome?: number;
  eps?: number;
  ebitda?: number;
  // Balance sheet
  totalAssets?: number;
  totalLiabilities?: number;
  stockholdersEquity?: number;
  cashAndEquivalents?: number;
  // Cash flow
  operatingCashFlow?: number;
  capitalExpenditures?: number;
  freeCashFlow?: number;
  // Period
  fiscalYear?: number;
  fiscalPeriod?: string;
}

function latestAnnualValue(concept: XbrlConcept | undefined, unit = 'USD'): { val: number; fy: number; fp: string } | null {
  if (!concept) return null;
  const entries = concept.units[unit];
  if (!entries?.length) return null;
  // Pick most recent FY annual entry
  const annual = entries
    .filter((e) => e.form === '10-K' || e.fp === 'FY')
    .sort((a, b) => b.fy - a.fy || b.filed.localeCompare(a.filed));
  if (!annual[0]) return null;
  return { val: annual[0].val, fy: annual[0].fy, fp: annual[0].fp };
}

export async function getFundamentalsSnapshot(symbol: string): Promise<EdgarFundamentalsSnapshot> {
  const cik = await lookupCik(symbol);
  if (!cik) throw new Error(`EDGAR: CIK not found for ${symbol}`);

  const facts = await getCompanyFacts(cik);
  const gaap = facts.facts['us-gaap'] ?? {};

  const rev = latestAnnualValue(gaap['Revenues'] ?? gaap['RevenueFromContractWithCustomerExcludingAssessedTax']);
  const ni  = latestAnnualValue(gaap['NetIncomeLoss']);
  const eps = latestAnnualValue(gaap['EarningsPerShareBasic'], 'USD/shares');
  const assets = latestAnnualValue(gaap['Assets']);
  const liab  = latestAnnualValue(gaap['Liabilities']);
  const eq    = latestAnnualValue(gaap['StockholdersEquity']);
  const cash  = latestAnnualValue(gaap['CashAndCashEquivalentsAtCarryingValue']);
  const ocf   = latestAnnualValue(gaap['NetCashProvidedByUsedInOperatingActivities']);
  const capex = latestAnnualValue(gaap['PaymentsToAcquirePropertyPlantAndEquipment']);

  const ocfVal = ocf?.val;
  const capexVal = capex?.val;

  return {
    symbol,
    cik,
    entityName: facts.entityName,
    asOf: new Date().toISOString(),
    revenue: rev?.val,
    netIncome: ni?.val,
    eps: eps?.val,
    totalAssets: assets?.val,
    totalLiabilities: liab?.val,
    stockholdersEquity: eq?.val,
    cashAndEquivalents: cash?.val,
    operatingCashFlow: ocfVal,
    capitalExpenditures: capexVal,
    freeCashFlow: ocfVal != null && capexVal != null ? ocfVal - capexVal : undefined,
    fiscalYear: rev?.fy,
    fiscalPeriod: rev?.fp,
  };
}

// ─── EFTS Full-Text Search ────────────────────────────────────────────────

export interface EdgarSearchHit {
  id: string;
  form_type: string;
  file_date: string;
  period_of_report?: string;
  display_names: string[];
  entity_id?: string;
}

export async function searchFilings(opts: {
  query?: string;
  ticker?: string;
  formTypes?: string[];
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<EdgarSearchHit[]> {
  const qs = new URLSearchParams();
  if (opts.query) qs.set('q', opts.query);
  else if (opts.ticker) qs.set('q', `"${opts.ticker}"`);
  if (opts.formTypes?.length) qs.set('forms', opts.formTypes.join(','));
  if (opts.startDate) qs.set('startdt', opts.startDate);
  if (opts.endDate) qs.set('enddt', opts.endDate);
  qs.set('dateRange', 'custom');
  const r = await edgarGet<{
    hits: { hits: Array<{ _id: string; _source: Record<string, unknown> }>; total: { value: number } };
  }>(`${EFTS_BASE}/LATEST/search-index?${qs}`);
  const limit = opts.limit ?? 20;
  return r.hits.hits.slice(0, limit).map((h) => ({
    id: h._id,
    form_type: String(h._source.form_type ?? ''),
    file_date: String(h._source.file_date ?? ''),
    period_of_report: h._source.period_of_report as string | undefined,
    display_names: (h._source.display_names ?? []) as string[],
    entity_id: h._source.entity_id as string | undefined,
  }));
}

// ─── Config check ─────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return Boolean(process.env.SEC_EDGAR_USER_AGENT || process.env.SEC_EDGAR_API_TOKEN);
}

// Export requireEnv usage so the caller doesn't need to import separately
export { requireEnv };
