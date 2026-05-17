/**
 * /v1/macro — Alpha Vantage macro time series with FRED fallback.
 *
 * Alpha Vantage free tier is 25 requests / DAY so every endpoint is heavily
 * cached (24h). When AV exhausts its quota it returns a Note/Information
 * field instead of data — the ensureOk() guard turns this into a throw,
 * which triggers the FRED fallback (completely free, 120 req/min).
 *
 * FRED requires a free API key: https://fred.stlouisfed.org/docs/api/api_key.html
 * Set env var FRED_API_KEY to enable. Without it, series fall back to AV only.
 */

import { Router } from 'express';
import { z } from 'zod';
import * as av from '../providers/alphavantage';
import * as fred from '../providers/fred';
import { withCache, TTL } from '../services/cache';

const router = Router();

const ALL_SERIES_IDS = [...av.MACRO_SERIES_IDS, 'T10Y2Y'] as unknown as [string, ...string[]];
const SeriesParam = z.object({ id: z.enum(ALL_SERIES_IDS) });

/** Fetch a macro series from AV, falling back to FRED on any error. */
async function fetchSeriesWithFallback(id: string) {
  // Try Alpha Vantage first
  try {
    return await av.getMacroSeries(id as av.MacroSeriesId);
  } catch (avErr) {
    // Attempt FRED fallback if it supports this series
    if (fred.isSupported(id)) {
      try {
        return await fred.getMacroSeries(id);
      } catch {
        // FRED also failed — re-throw the original AV error
      }
    }
    throw avErr;
  }
}

// Use a longer TTL for macro series — they change at most daily/monthly.
// This dramatically reduces AV calls on the free 25 req/day quota.
const MACRO_TTL = 24 * 60 * 60_000; // 24 h

router.get('/series/:id', async (req, res, next) => {
  try {
    const { id } = SeriesParam.parse({ id: req.params.id.toUpperCase() });

    // T10Y2Y = 10Y Treasury minus 2Y Treasury (not available directly from AV)
    if (id === 'T10Y2Y') {
      const data = await withCache('macro:T10Y2Y', MACRO_TTL, async () => {
        const [dgs10, dgs2] = await Promise.all([
          fetchSeriesWithFallback('DGS10'),
          fetchSeriesWithFallback('DGS2'),
        ]);
        const dgs2Map = new Map(dgs2.points.map((p) => [p.ts, p.value]));
        const points = dgs10.points
          .filter((p) => dgs2Map.has(p.ts))
          .map((p) => ({ ts: p.ts, value: p.value - dgs2Map.get(p.ts)! }));
        return { id: 'T10Y2Y', name: '10Y–2Y Spread', unit: '%', frequency: 'monthly', points };
      });
      res.json(data);
      return;
    }

    const data = await withCache(`macro:${id}`, MACRO_TTL, () =>
      fetchSeriesWithFallback(id),
    );
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/series', (_req, res) => {
  res.json({ ids: av.MACRO_SERIES_IDS });
});

// FX historical daily — used by Macro Regime Desk to render DXY-related pairs.
const FxQuery = z.object({ from: z.string().length(3), to: z.string().length(3) });
router.get('/fx', async (req, res, next) => {
  try {
    const { from, to } = FxQuery.parse({ from: req.query.from, to: req.query.to });
    const bars = await withCache(`av:fx:${from}${to}`, TTL.ohlcv_daily, () =>
      av.getFxDaily(from.toUpperCase(), to.toUpperCase()),
    );
    res.json({ from, to, bars });
  } catch (err) { next(err); }
});

export default router;
