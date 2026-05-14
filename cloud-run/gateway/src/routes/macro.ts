/**
 * /v1/macro — Alpha Vantage macro time series.
 *
 * Alpha Vantage free tier is 25 requests / DAY so every endpoint is heavily
 * cached (6h). Series IDs map to canonical strings in src/types.ts.
 */

import { Router } from 'express';
import { z } from 'zod';
import * as av from '../providers/alphavantage';
import { withCache, TTL } from '../services/cache';

const router = Router();

const SeriesParam = z.object({ id: z.enum(av.MACRO_SERIES_IDS as [string, ...string[]]) });

router.get('/series/:id', async (req, res, next) => {
  try {
    const { id } = SeriesParam.parse({ id: req.params.id.toUpperCase() });
    const data = await withCache(`av:macro:${id}`, TTL.macro_series, () =>
      av.getMacroSeries(id as av.MacroSeriesId),
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
