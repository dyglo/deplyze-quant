/**
 * /v1/earnings — earnings calendar, surprises, consensus.
 * Provider routing: FMP → EODHD
 */

import { Router } from 'express';
import { z } from 'zod';
import * as fmp from '../providers/fmp';
import * as eodhd from '../providers/eodhd';
import { withCache, TTL } from '../services/cache';
import { withFallback } from '../lib/providerRouter';

const router = Router();

type EarningsSurpriseRow = {
  date: string;
  epsActual?: number;
  epsEstimate?: number;
  surpriseAbs?: number;
  surprisePct?: number | null;
  revenue?: number | null;
  revenueEstimate?: number | null;
};

// ─── /earnings/:symbol/surprises ──────────────────────────────────────────
router.get('/:symbol/surprises', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const limit = Math.min(Number(req.query.limit ?? 8), 20);
    const data = await withCache(`earnings:surprises:${symbol}`, TTL.fundamentals, async () => {
      const { result, providerId } = await withFallback<EarningsSurpriseRow[]>({
        providers: [
          {
            id: 'fmp', fn: async () => {
              // Fetch EPS surprises and quarterly income statements in parallel.
              // Both return newest-first, so index-matched entries are the same fiscal quarter.
              const [surprises, income] = await Promise.all([
                fmp.getEarningsSurprises(symbol, limit),
                fmp.getIncomeStatement(symbol, 'quarter', limit).catch(() => []),
              ]);
              return surprises.map((e, idx): EarningsSurpriseRow => ({
                date: e.date,
                epsActual: e.actualEarningResult,
                epsEstimate: e.estimatedEarning,
                surpriseAbs: e.actualEarningResult - e.estimatedEarning,
                surprisePct: e.estimatedEarning
                  ? ((e.actualEarningResult - e.estimatedEarning) / Math.abs(e.estimatedEarning)) * 100
                  : null,
                revenue: income[idx]?.revenue ?? null,
                revenueEstimate: null,
              }));
            },
          },
          {
            id: 'eodhd', fn: async () => {
              const f = await eodhd.getFundamentals(symbol);
              const history = f.Earnings?.History ?? {};
              return Object.values(history)
                .slice(0, limit)
                .map((e): EarningsSurpriseRow => ({
                  date: e.date,
                  epsActual: e.epsActual,
                  epsEstimate: e.epsEstimate,
                  surpriseAbs: e.epsDifference,
                  surprisePct: e.surprisePercent ?? null,
                  revenue: null,
                  revenueEstimate: null,
                }));
            },
          },
        ],
      });
      return { symbol, surprises: result, providerId };
    });
    res.json(data);
  } catch (err) { next(err); }
});

// ─── /earnings/calendar ───────────────────────────────────────────────────
const CalendarQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.get('/calendar', async (req, res, next) => {
  try {
    const { from, to } = CalendarQuery.parse(req.query);
    const today = new Date();
    const defaultFrom = from ?? today.toISOString().slice(0, 10);
    const defaultTo = to ?? new Date(today.getTime() + 30 * 86400_000).toISOString().slice(0, 10);
    const cacheKey = `earnings:calendar:${defaultFrom}:${defaultTo}`;
    const data = await withCache(cacheKey, TTL.news, async () => {
      const { result, providerId } = await withFallback<Array<Record<string, unknown>>>({
        providers: [
          {
            id: 'fmp', fn: async () => {
              const items = await fmp.getEarningsCalendar(defaultFrom, defaultTo);
              return items.map((e) => ({
                date: e.date,
                symbol: e.symbol,
                epsActual: e.epsActual ?? e.eps,
                epsEstimate: e.epsEstimated,
                revenue: e.revenueActual ?? e.revenue,
                revenueEstimate: e.revenueEstimated,
                time: e.time,
                fiscalDateEnding: e.fiscalDateEnding,
              })).filter((e) => e.date && e.symbol);
            },
          },
        ],
      });
      return { from: defaultFrom, to: defaultTo, events: result, providerId };
    });
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
