/**
 * /v1/edgar — SEC EDGAR filing ingestion.
 *
 * Requires SEC_EDGAR_USER_AGENT to be set to a compliant string:
 *   "YourAppName contact@youremail.com"
 *
 * Endpoints:
 *   GET /v1/edgar/:symbol/filings       — recent filing history
 *   GET /v1/edgar/:symbol/facts         — XBRL company fundamentals
 *   GET /v1/edgar/:symbol/snapshot      — normalised fundamentals snapshot
 *   GET /v1/edgar/search                — full-text filing search
 */

import { Router } from 'express';
import { z } from 'zod';
import * as edgar from '../providers/edgar';
import { withCache, TTL } from '../services/cache';

const router = Router();

// ─── Config guard ─────────────────────────────────────────────────────────
function requireEdgar(res: import('express').Response): boolean {
  if (!edgar.isConfigured()) {
    res.status(503).json({
      error: 'SEC EDGAR not configured',
      hint: 'Set SEC_EDGAR_USER_AGENT="AppName contact@email.com" in your environment.',
    });
    return false;
  }
  return true;
}

// ─── /edgar/:symbol/filings ───────────────────────────────────────────────
const FilingsQuery = z.object({
  forms: z.string().optional(),   // comma-separated: "10-K,10-Q"
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get('/:symbol/filings', async (req, res, next) => {
  try {
    if (!requireEdgar(res)) return;
    const symbol = req.params.symbol.toUpperCase();
    const { forms, limit } = FilingsQuery.parse(req.query);
    const formList = forms?.split(',').map((f) => f.trim()).filter(Boolean);
    const cacheKey = `edgar:filings:${symbol}:${formList?.join(',') ?? 'all'}:${limit}`;
    const data = await withCache(cacheKey, TTL.fundamentals, () =>
      edgar.getFilings(symbol, { forms: formList, limit }),
    );
    res.json({ symbol, filings: data, count: data.length });
  } catch (err) { next(err); }
});

// ─── /edgar/:symbol/snapshot ──────────────────────────────────────────────
router.get('/:symbol/snapshot', async (req, res, next) => {
  try {
    if (!requireEdgar(res)) return;
    const symbol = req.params.symbol.toUpperCase();
    const data = await withCache(`edgar:snapshot:${symbol}`, TTL.fundamentals, () =>
      edgar.getFundamentalsSnapshot(symbol),
    );
    res.json(data);
  } catch (err) { next(err); }
});

// ─── /edgar/:symbol/cik ───────────────────────────────────────────────────
router.get('/:symbol/cik', async (req, res, next) => {
  try {
    if (!requireEdgar(res)) return;
    const symbol = req.params.symbol.toUpperCase();
    const cik = await edgar.lookupCik(symbol);
    if (!cik) { res.status(404).json({ error: `CIK not found for ${symbol}` }); return; }
    res.json({ symbol, cik, cikPadded: String(cik).padStart(10, '0') });
  } catch (err) { next(err); }
});

// ─── /edgar/search ────────────────────────────────────────────────────────
const SearchQuery = z.object({
  q: z.string().optional(),
  ticker: z.string().optional(),
  forms: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(40).default(20),
});

router.get('/search', async (req, res, next) => {
  try {
    if (!requireEdgar(res)) return;
    const params = SearchQuery.parse(req.query);
    const formList = params.forms?.split(',').map((f) => f.trim()).filter(Boolean);
    const cacheKey = `edgar:search:${JSON.stringify(params)}`;
    const hits = await withCache(cacheKey, TTL.news, () =>
      edgar.searchFilings({
        query: params.q,
        ticker: params.ticker,
        formTypes: formList,
        startDate: params.startDate,
        endDate: params.endDate,
        limit: params.limit,
      }),
    );
    res.json({ hits, count: hits.length });
  } catch (err) { next(err); }
});

export default router;
