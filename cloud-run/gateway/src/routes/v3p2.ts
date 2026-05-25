/**
 * /v1/{macro,filings,narratives,research,relations,briefings} — V3 Phase 2
 * gateway routes (Wave L).
 *
 * All endpoints are BigQuery-backed, auth-protected (via the shared router
 * middleware in index.ts), and cached. Queries are bounded with
 * `maximumBytesBilled` so a runaway query cannot exceed the per-call budget.
 *
 * Routes added by this file:
 *   GET /macro/regimes          — latest 4-kind regime classification
 *   GET /macro/observations     — recent macro_observations
 *   GET /filings/recent         — recent public_filings_raw (newest first)
 *   GET /filings/symbol/:symbol — filings for a single symbol
 *   GET /narratives/emerging    — recent narrative_artifacts
 *   GET /narratives/memory      — narrative_memory list
 *   GET /research/macro-observations  — alias of /macro/observations
 *   GET /relations/context      — composite for the Wave I producers
 *   GET /briefings/latest       — latest generated_briefings of each type
 */

import { Router } from 'express';
import { z } from 'zod';
import { BigQuery } from '@google-cloud/bigquery';
import { withCache, TTL } from '../services/cache';

const router = Router();

// Reuse the lazy singleton pattern from routes/intelligence.ts.
let _bq: BigQuery | null = null;
function getBQ(): BigQuery {
  if (!_bq) {
    _bq = new BigQuery({
      projectId: process.env.FIREBASE_PROJECT_ID ?? 'deplyze-quant',
      location: 'US',
    });
  }
  return _bq;
}

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'deplyze-quant';

async function runQuery<T>(query: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const bq = getBQ();
  const [rows] = await bq.query({
    query,
    params,
    location: 'US',
    maximumBytesBilled: String(50 * 1024 * 1024), // 50 MB cap
  });
  return rows as T[];
}

// ─── Macro ───────────────────────────────────────────────────────────────────

router.get('/macro/regimes', async (_req, res, next) => {
  try {
    const rows = await withCache('v3p2:macro:regimes', TTL.quote * 10, () =>
      runQuery<{
        observation_type: string;
        regime_state: string;
        title: string;
        summary: string;
        body: string;
        confidence: number;
        severity: string | null;
        observation_time: { value: string } | string;
        related_series: string[];
      }>(`
        WITH latest AS (
          SELECT observation_type, MAX(observation_time) AS ts
          FROM \`${PROJECT}.research.macro_observations\`
          WHERE observation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
          GROUP BY observation_type
        )
        SELECT m.observation_type, m.regime_state, m.title, m.summary, m.body,
               m.confidence, m.severity, m.observation_time, m.related_series
        FROM \`${PROJECT}.research.macro_observations\` m
        JOIN latest l USING (observation_type)
        WHERE m.observation_time = l.ts
      `),
    );
    res.json({ regimes: rows, count: rows.length });
  } catch (err) { next(err); }
});

const MacroObsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  observation_type: z.string().optional(),
});

const GlobalIndicatorsQuery = z.object({
  countries: z.string().optional(),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(120),
});

router.get('/macro/global-indicators', async (req, res, next) => {
  try {
    const { countries, category, limit } = GlobalIndicatorsQuery.parse(req.query);
    const countryList = countries
      ? countries.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean)
      : ['USA', 'CHN', 'JPN', 'DEU', 'GBR', 'FRA', 'IND', 'BRA'];
    const cacheKey = `v3p2:macro:global:${countryList.join(',')}:${category ?? 'all'}:${limit}`;
    const rows = await withCache(cacheKey, TTL.quote * 10, () => {
      const params: Record<string, unknown> = { countries: countryList, limit };
      let where = 'country_iso3 IN UNNEST(@countries)';
      if (category) {
        where += ' AND indicator_category = @category';
        params.category = category;
      }
      return runQuery<unknown>(`
        WITH ranked AS (
          SELECT *,
                 ROW_NUMBER() OVER (
                   PARTITION BY country_iso3, indicator_code
                   ORDER BY period_start DESC, updated_at DESC
                 ) AS rn
          FROM \`${PROJECT}.cleaned.global_indicators_cleaned\`
          WHERE ${where}
        )
        SELECT country_iso3, country_name, provider, indicator_code,
               indicator_name, indicator_category, period, period_start,
               value, yoy_change, period_change, unit, is_forecast,
               data_quality_score, updated_at
        FROM ranked
        WHERE rn = 1
        ORDER BY country_iso3, indicator_category, indicator_name
        LIMIT @limit
      `, params);
    });
    res.json({ items: rows, count: rows.length });
  } catch (err) { next(err); }
});

const CountryRegimesQuery = z.object({
  countries: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

router.get('/macro/country-regimes', async (req, res, next) => {
  try {
    const { countries, limit } = CountryRegimesQuery.parse(req.query);
    const countryList = countries
      ? countries.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean)
      : null;
    const cacheKey = `v3p2:macro:country_regimes:${countryList?.join(',') ?? 'all'}:${limit}`;
    const rows = await withCache(cacheKey, TTL.quote * 10, () => {
      const params: Record<string, unknown> = { limit };
      const where = countryList?.length ? 'WHERE country_iso3 IN UNNEST(@countries)' : '';
      if (countryList?.length) params.countries = countryList;
      return runQuery<unknown>(`
        WITH ranked AS (
          SELECT *,
                 ROW_NUMBER() OVER (
                   PARTITION BY country_iso3
                   ORDER BY as_of_date DESC, updated_at DESC
                 ) AS rn
          FROM \`${PROJECT}.features.country_regime_features\`
          ${where}
        )
        SELECT country_iso3, country_name, as_of_date, latest_period,
               growth_state, inflation_state, debt_state, external_state,
               employment_state, composite_risk_score, data_coverage,
               indicator_count, evidence, source_providers, updated_at
        FROM ranked
        WHERE rn = 1
        ORDER BY composite_risk_score DESC, country_iso3
        LIMIT @limit
      `, params);
    });
    res.json({ items: rows, count: rows.length });
  } catch (err) { next(err); }
});

router.get('/macro/observations', async (req, res, next) => {
  try {
    const { limit, observation_type } = MacroObsQuery.parse(req.query);
    const cacheKey = `v3p2:macro:obs:${observation_type ?? 'all'}:${limit}`;
    const rows = await withCache(cacheKey, TTL.quote * 5, () => {
      const params: Record<string, unknown> = { limit };
      let where = '';
      if (observation_type) {
        where = ' AND observation_type = @observation_type';
        params.observation_type = observation_type;
      }
      return runQuery<unknown>(`
        SELECT id, observation_type, regime_state, title, summary, body, severity,
               confidence, related_series, related_symbols, tags, observation_time
        FROM \`${PROJECT}.research.macro_observations\`
        WHERE TRUE${where}
        ORDER BY observation_time DESC
        LIMIT @limit
      `, params);
    });
    res.json({ items: rows, count: rows.length });
  } catch (err) { next(err); }
});

// ─── Filings ─────────────────────────────────────────────────────────────────

const FilingsRecentQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  forms: z.string().optional(),    // comma-separated
  since_days: z.coerce.number().int().min(1).max(365).default(30),
});

router.get('/filings/recent', async (req, res, next) => {
  try {
    const { limit, forms, since_days } = FilingsRecentQuery.parse(req.query);
    const formsList = forms ? forms.split(',').map((f) => f.trim()).filter(Boolean) : null;
    const cacheKey = `v3p2:filings:recent:${formsList?.join(',') ?? 'all'}:${since_days}:${limit}`;
    const rows = await withCache(cacheKey, TTL.quote * 4, () => {
      const params: Record<string, unknown> = { limit, since_days };
      let where = ` AND filing_date >= DATE_SUB(CURRENT_DATE(), INTERVAL @since_days DAY)`;
      if (formsList && formsList.length) {
        where += ` AND form_type IN UNNEST(@forms)`;
        params.forms = formsList;
      }
      return runQuery<unknown>(`
        SELECT id, symbol, cik, accession_number, form_type, filing_date,
               period_of_report, entity_name, document_url, source_url,
               ingestion_time, observation_time
        FROM \`${PROJECT}.raw_public.public_filings_raw\`
        WHERE provider = 'sec_edgar'${where}
        ORDER BY filing_date DESC
        LIMIT @limit
      `, params);
    });
    res.json({ items: rows, count: rows.length });
  } catch (err) { next(err); }
});

const FilingsSymbolParams = z.object({ symbol: z.string().min(1).max(8).regex(/^[A-Za-z.]+$/) });
const FilingsSymbolQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/filings/symbol/:symbol', async (req, res, next) => {
  try {
    const { symbol } = FilingsSymbolParams.parse(req.params);
    const { limit } = FilingsSymbolQuery.parse(req.query);
    const sym = symbol.toUpperCase();
    const cacheKey = `v3p2:filings:sym:${sym}:${limit}`;
    const rows = await withCache(cacheKey, TTL.quote * 4, () =>
      runQuery<unknown>(`
        SELECT id, symbol, cik, accession_number, form_type, filing_date,
               period_of_report, entity_name, document_url, observation_time
        FROM \`${PROJECT}.raw_public.public_filings_raw\`
        WHERE provider = 'sec_edgar' AND symbol = @symbol
        ORDER BY filing_date DESC
        LIMIT @limit
      `, { symbol: sym, limit }),
    );
    res.json({ symbol: sym, items: rows, count: rows.length });
  } catch (err) { next(err); }
});

// ─── Narratives ──────────────────────────────────────────────────────────────

const NarrativesEmergingQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  min_confidence: z.coerce.number().min(0).max(1).default(0.3),
});

router.get('/narratives/emerging', async (req, res, next) => {
  try {
    const { limit, min_confidence } = NarrativesEmergingQuery.parse(req.query);
    const cacheKey = `v3p2:narratives:emerging:${min_confidence}:${limit}`;
    const rows = await withCache(cacheKey, TTL.quote * 5, () =>
      runQuery<unknown>(`
        SELECT artifact_id, artifact_type, title, summary, related_symbols,
               confidence, severity, evidence, metrics, created_at
        FROM \`${PROJECT}.artifacts.narrative_artifacts\`
        WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
          AND confidence >= @min_confidence
        ORDER BY created_at DESC, confidence DESC
        LIMIT @limit
      `, { limit, min_confidence }),
    );
    res.json({ items: rows, count: rows.length });
  } catch (err) { next(err); }
});

const NarrativeMemoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  min_lifetime: z.coerce.number().min(0).max(1).default(0),
});

router.get('/narratives/memory', async (req, res, next) => {
  try {
    const { limit, min_lifetime } = NarrativeMemoryQuery.parse(req.query);
    const cacheKey = `v3p2:narratives:memory:${min_lifetime}:${limit}`;
    const rows = await withCache(cacheKey, TTL.quote * 10, () =>
      runQuery<unknown>(`
        WITH ranked AS (
          SELECT theme_id, theme_label, emergence_at, last_seen_at,
                 recurrence_count, lifetime_score, polarity_mean, intensity_mean,
                 related_symbols, related_entities, tags,
                 ROW_NUMBER() OVER (PARTITION BY theme_id ORDER BY observation_time DESC) AS rn
          FROM \`${PROJECT}.research.narrative_memory\`
        )
        SELECT * EXCEPT(rn)
        FROM ranked
        WHERE rn = 1 AND lifetime_score >= @min_lifetime
        ORDER BY lifetime_score DESC, last_seen_at DESC
        LIMIT @limit
      `, { limit, min_lifetime }),
    );
    res.json({ items: rows, count: rows.length });
  } catch (err) { next(err); }
});

// ─── Research (alias for macro observations, for path expectations) ───────────

router.get('/research/macro-observations', async (req, res, next) => {
  // Delegate to /macro/observations handler logic.
  try {
    const { limit, observation_type } = MacroObsQuery.parse(req.query);
    const cacheKey = `v3p2:research:macro_obs:${observation_type ?? 'all'}:${limit}`;
    const rows = await withCache(cacheKey, TTL.quote * 5, () => {
      const params: Record<string, unknown> = { limit };
      let where = '';
      if (observation_type) {
        where = ' AND observation_type = @observation_type';
        params.observation_type = observation_type;
      }
      return runQuery<unknown>(`
        SELECT id, observation_type, regime_state, title, summary, body, severity,
               confidence, related_series, related_symbols, tags, observation_time
        FROM \`${PROJECT}.research.macro_observations\`
        WHERE TRUE${where}
        ORDER BY observation_time DESC
        LIMIT @limit
      `, params);
    });
    res.json({ items: rows, count: rows.length });
  } catch (err) { next(err); }
});

// ─── Relations context (composite for Wave I producers) ──────────────────────

const RelationsContextQuery = z.object({
  symbol: z.string().min(1).max(8).regex(/^[A-Za-z.]+$/),
  // Universe for fan-out filtering — comma-separated peers.
  peers: z.string().optional(),
  filings_limit: z.coerce.number().int().min(1).max(50).default(10),
  themes_limit: z.coerce.number().int().min(1).max(30).default(10),
});

router.get('/relations/context', async (req, res, next) => {
  try {
    const { symbol, peers, filings_limit, themes_limit } = RelationsContextQuery.parse(req.query);
    const sym = symbol.toUpperCase();
    const peerList = peers ? peers.split(',').map((s) => s.toUpperCase()).filter(Boolean) : [];

    const cacheKey = `v3p2:relations:ctx:${sym}:${peerList.join(',') || 'none'}:${filings_limit}:${themes_limit}`;

    const data = await withCache(cacheKey, TTL.quote * 5, async () => {
      const universe = [sym, ...peerList];
      const [filings, regimes, narratives] = await Promise.all([
        runQuery<{
          accession_number: string; symbol: string; form_type: string;
          filing_date: { value: string } | string; entity_name: string | null;
          document_url: string | null;
        }>(`
          SELECT accession_number, symbol, form_type, filing_date, entity_name, document_url
          FROM \`${PROJECT}.raw_public.public_filings_raw\`
          WHERE provider = 'sec_edgar'
            AND symbol IN UNNEST(@universe)
            AND filing_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
          ORDER BY filing_date DESC
          LIMIT @filings_limit
        `, { universe, filings_limit }),
        runQuery<{
          observation_type: string; regime_state: string; confidence: number;
          related_symbols: string[] | null; observation_time: { value: string } | string;
        }>(`
          WITH latest AS (
            SELECT observation_type, MAX(observation_time) AS ts
            FROM \`${PROJECT}.research.macro_observations\`
            WHERE observation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
            GROUP BY observation_type
          )
          SELECT m.observation_type, m.regime_state, m.confidence,
                 m.related_symbols, m.observation_time
          FROM \`${PROJECT}.research.macro_observations\` m
          JOIN latest l USING (observation_type)
          WHERE m.observation_time = l.ts
        `),
        runQuery<{
          theme_id: string; theme_label: string;
          lifetime_score: number; last_seen_at: { value: string } | string;
          related_symbols: string[] | null;
        }>(`
          WITH ranked AS (
            SELECT theme_id, theme_label, lifetime_score, last_seen_at, related_symbols,
                   ROW_NUMBER() OVER (PARTITION BY theme_id ORDER BY observation_time DESC) AS rn
            FROM \`${PROJECT}.research.narrative_memory\`
          )
          SELECT * EXCEPT(rn)
          FROM ranked
          WHERE rn = 1
            AND EXISTS (
              SELECT 1 FROM UNNEST(related_symbols) s WHERE s IN UNNEST(@universe)
            )
          ORDER BY lifetime_score DESC
          LIMIT @themes_limit
        `, { universe, themes_limit }),
      ]);

      return {
        symbol: sym,
        peers: peerList,
        filings: filings.map((f) => ({
          id: f.accession_number,
          symbol: (f.symbol || '').toUpperCase(),
          formType: f.form_type,
          ts: tsToMs(f.filing_date),
          title: f.entity_name ? `${f.entity_name} ${f.form_type}` : f.form_type,
        })),
        macroRegimes: regimes.map((r) => ({
          kind: r.observation_type as 'liquidity_regime' | 'inflation_regime' | 'rates_regime' | 'growth_regime',
          label: r.regime_state,
          confidence: r.confidence,
          targets: r.related_symbols ?? [],
          ts: tsToMs(r.observation_time),
        })),
        narratives: narratives.map((n) => ({
          themeId: n.theme_id,
          themeLabel: n.theme_label,
          relatedSymbols: n.related_symbols ?? [],
          lifetimeScore: n.lifetime_score,
          lastSeenTs: tsToMs(n.last_seen_at),
        })),
      };
    });

    res.json(data);
  } catch (err) { next(err); }
});

function tsToMs(v: { value: string } | string | null | undefined): number {
  if (v == null) return 0;
  const s = typeof v === 'string' ? v : v.value;
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

// ─── Briefings latest (V3P2 deterministic briefings) ─────────────────────────

router.get('/briefings/latest', async (_req, res, next) => {
  try {
    const rows = await withCache('v3p2:briefings:latest', TTL.quote * 5, () =>
      runQuery<{
        id: string; briefing_type: string; title: string; summary: string;
        body: string; period_start: { value: string } | string;
        period_end: { value: string } | string; related_symbols: string[] | null;
        tags: string[] | null; observation_time: { value: string } | string;
      }>(`
        WITH ranked AS (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY briefing_type ORDER BY observation_time DESC) AS rn
          FROM \`${PROJECT}.research.generated_briefings\`
          WHERE provider = 'deplyze_quant'
            AND observation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
        )
        SELECT id, briefing_type, title, summary, body,
               period_start, period_end, related_symbols, tags, observation_time
        FROM ranked
        WHERE rn = 1
        ORDER BY observation_time DESC
      `),
    );
    res.json({ items: rows, count: rows.length });
  } catch (err) { next(err); }
});

export default router;
