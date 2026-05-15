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

const ALL_SERIES_IDS = [...av.MACRO_SERIES_IDS, 'T10Y2Y'] as unknown as [string, ...string[]];
const SeriesParam = z.object({ id: z.enum(ALL_SERIES_IDS) });

router.get('/series/:id', async (req, res, next) => {
  try {
    const { id } = SeriesParam.parse({ id: req.params.id.toUpperCase() });

    // T10Y2Y = 10Y Treasury minus 2Y Treasury (not available directly from AV)
    if (id === 'T10Y2Y') {
      const data = await withCache('av:macro:T10Y2Y', TTL.macro_series, async () => {
        const [dgs10, dgs2] = await Promise.all([
          av.getMacroSeries('DGS10'),
          av.getMacroSeries('DGS2'),
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
