/**
 * v3p2Service.ts — typed client for the V3 Phase 2 gateway routes.
 *
 * Wraps `/v1/macro/regimes`, `/v1/filings/*`, `/v1/narratives/*`,
 * `/v1/relations/context`, `/v1/briefings/latest`. Mirrors the shapes the
 * Wave I producers and Wave M panels consume.
 */

import { gatewayGet, ClientTTL } from './gatewayClient';

// ─── Macro ───────────────────────────────────────────────────────────────────

export interface MacroRegimeRow {
  observation_type:
    | 'liquidity_regime'
    | 'inflation_regime'
    | 'rates_regime'
    | 'growth_regime';
  regime_state: string;
  title: string;
  summary: string;
  body: string;
  confidence: number;
  severity: string | null;
  observation_time: { value: string } | string;
  related_series: string[] | null;
}

export async function fetchMacroRegimes(): Promise<MacroRegimeRow[]> {
  const r = await gatewayGet<{ regimes: MacroRegimeRow[]; count: number }>(
    '/macro/regimes',
    undefined,
    ClientTTL.macro_series,
  );
  return r.regimes;
}

export interface MacroObservationRow extends MacroRegimeRow {
  id: string;
  related_symbols: string[] | null;
  tags: string[] | null;
}

export async function fetchMacroObservations(opts: {
  limit?: number;
  observation_type?: string;
} = {}): Promise<MacroObservationRow[]> {
  const r = await gatewayGet<{ items: MacroObservationRow[]; count: number }>(
    '/macro/observations',
    { limit: opts.limit ?? 50, observation_type: opts.observation_type ?? null },
    ClientTTL.macro_series,
  );
  return r.items;
}

export interface GlobalIndicatorRow {
  country_iso3: string;
  country_name: string | null;
  provider: string;
  indicator_code: string;
  indicator_name: string | null;
  indicator_category: string | null;
  period: string;
  period_start: { value: string } | string | null;
  value: number | null;
  yoy_change: number | null;
  period_change: number | null;
  unit: string | null;
  is_forecast: boolean | null;
  data_quality_score: number | null;
  updated_at: { value: string } | string | null;
}

export interface CountryRegimeRow {
  country_iso3: string;
  country_name: string | null;
  as_of_date: { value: string } | string;
  latest_period: string | null;
  growth_state: string | null;
  inflation_state: string | null;
  debt_state: string | null;
  external_state: string | null;
  employment_state: string | null;
  composite_risk_score: number | null;
  data_coverage: number | null;
  indicator_count: number | null;
  evidence: unknown;
  source_providers: string[] | null;
  updated_at: { value: string } | string | null;
}

export async function fetchGlobalIndicators(opts: {
  countries?: string[];
  category?: string;
  limit?: number;
} = {}): Promise<GlobalIndicatorRow[]> {
  const r = await gatewayGet<{ items: GlobalIndicatorRow[]; count: number }>(
    '/macro/global-indicators',
    {
      countries: opts.countries?.join(',') ?? null,
      category: opts.category ?? null,
      limit: opts.limit ?? 120,
    },
    ClientTTL.macro_series,
  );
  return r.items;
}

export async function fetchCountryRegimes(opts: {
  countries?: string[];
  limit?: number;
} = {}): Promise<CountryRegimeRow[]> {
  const r = await gatewayGet<{ items: CountryRegimeRow[]; count: number }>(
    '/macro/country-regimes',
    {
      countries: opts.countries?.join(',') ?? null,
      limit: opts.limit ?? 24,
    },
    ClientTTL.macro_series,
  );
  return r.items;
}

// ─── Filings ─────────────────────────────────────────────────────────────────

export interface FilingRow {
  id: string;
  symbol: string | null;
  cik: string;
  accession_number: string;
  form_type: string;
  filing_date: { value: string } | string;
  period_of_report: { value: string } | string | null;
  entity_name: string | null;
  document_url: string | null;
  observation_time: { value: string } | string | null;
}

export async function fetchRecentFilings(opts: {
  limit?: number;
  forms?: string[];
  since_days?: number;
} = {}): Promise<FilingRow[]> {
  const r = await gatewayGet<{ items: FilingRow[]; count: number }>(
    '/filings/recent',
    {
      limit: opts.limit ?? 50,
      forms: opts.forms?.join(',') ?? null,
      since_days: opts.since_days ?? 30,
    },
    ClientTTL.macro_series,
  );
  return r.items;
}

export async function fetchFilingsForSymbol(symbol: string, limit = 20): Promise<FilingRow[]> {
  const r = await gatewayGet<{ symbol: string; items: FilingRow[]; count: number }>(
    `/filings/symbol/${encodeURIComponent(symbol.toUpperCase())}`,
    { limit },
    ClientTTL.macro_series,
  );
  return r.items;
}

// ─── Narratives ──────────────────────────────────────────────────────────────

export interface NarrativeEmergenceRow {
  artifact_id: string;
  artifact_type: string;
  title: string;
  summary: string;
  related_symbols: string[] | null;
  confidence: number;
  severity: string | null;
  evidence: unknown;
  metrics: unknown;
  created_at: { value: string } | string;
}

export async function fetchEmergingNarratives(opts: {
  limit?: number;
  min_confidence?: number;
} = {}): Promise<NarrativeEmergenceRow[]> {
  const r = await gatewayGet<{ items: NarrativeEmergenceRow[]; count: number }>(
    '/narratives/emerging',
    {
      limit: opts.limit ?? 25,
      min_confidence: opts.min_confidence ?? 0.3,
    },
    ClientTTL.macro_series,
  );
  return r.items;
}

export interface NarrativeMemoryRow {
  theme_id: string;
  theme_label: string;
  emergence_at: { value: string } | string | null;
  last_seen_at: { value: string } | string | null;
  recurrence_count: number | null;
  lifetime_score: number;
  polarity_mean: number | null;
  intensity_mean: number | null;
  related_symbols: string[] | null;
  related_entities: string[] | null;
  tags: string[] | null;
}

export async function fetchNarrativeMemory(opts: {
  limit?: number;
  min_lifetime?: number;
} = {}): Promise<NarrativeMemoryRow[]> {
  const r = await gatewayGet<{ items: NarrativeMemoryRow[]; count: number }>(
    '/narratives/memory',
    { limit: opts.limit ?? 50, min_lifetime: opts.min_lifetime ?? 0 },
    ClientTTL.macro_series,
  );
  return r.items;
}

// ─── Relations context (composite for Wave I producers) ─────────────────────

export interface RelationsContextPayload {
  symbol: string;
  peers: string[];
  filings: Array<{
    id: string; symbol: string; formType: string; ts: number; title?: string;
  }>;
  macroRegimes: Array<{
    kind: 'liquidity_regime' | 'inflation_regime' | 'rates_regime' | 'growth_regime';
    label: string; confidence: number; targets: string[]; ts: number;
  }>;
  narratives: Array<{
    themeId: string; themeLabel: string; relatedSymbols: string[];
    lifetimeScore: number; lastSeenTs: number;
  }>;
}

export async function fetchRelationsContext(opts: {
  symbol: string;
  peers?: string[];
  filings_limit?: number;
  themes_limit?: number;
}): Promise<RelationsContextPayload> {
  return gatewayGet<RelationsContextPayload>(
    '/relations/context',
    {
      symbol: opts.symbol.toUpperCase(),
      peers: opts.peers?.join(',') ?? null,
      filings_limit: opts.filings_limit ?? 10,
      themes_limit: opts.themes_limit ?? 10,
    },
    ClientTTL.macro_series,
  );
}

// ─── Briefings ────────────────────────────────────────────────────────────────

export interface BriefingLatestRow {
  id: string;
  briefing_type: string;
  title: string;
  summary: string;
  body: string;
  period_start: { value: string } | string | null;
  period_end: { value: string } | string | null;
  related_symbols: string[] | null;
  tags: string[] | null;
  observation_time: { value: string } | string;
}

export async function fetchLatestBriefings(): Promise<BriefingLatestRow[]> {
  const r = await gatewayGet<{ items: BriefingLatestRow[]; count: number }>(
    '/briefings/latest',
    undefined,
    ClientTTL.macro_series,
  );
  return r.items;
}
