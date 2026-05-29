/**
 * /v1/earnings — earnings calendar, surprises, consensus.
 * Provider routing: FMP → EODHD
 */

import { Router } from 'express';
import { z } from 'zod';
import * as fmp from '../providers/fmp';
import * as finnhub from '../providers/finnhub';
import * as eodhd from '../providers/eodhd';
import { withCache, TTL } from '../services/cache';
import { withFallback } from '../lib/providerRouter';
import { log, reqContext } from '../lib/logger';

const router = Router();

type EarningsCalendarEvent = {
  date: string;
  symbol: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  revenue?: number | null;
  revenueEstimate?: number | null;
  time?: string;
  fiscalDateEnding?: string;
};

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
  // Validate up front so a bad date never reaches a provider. Zod throws a
  // ZodError → the central handler returns a clean 400 (not a 500).
  let parsed: z.infer<typeof CalendarQuery>;
  try {
    parsed = CalendarQuery.parse(req.query);
  } catch (err) { next(err); return; }

  const { from, to } = parsed;
  const today = new Date();
  const defaultFrom = from ?? today.toISOString().slice(0, 10);
  const defaultTo = to ?? new Date(today.getTime() + 30 * 86400_000).toISOString().slice(0, 10);

  // Guard against an inverted / absurd window before hitting a provider.
  if (Date.parse(defaultFrom) > Date.parse(defaultTo)) {
    res.status(400).json({ error: 'Bad Request', code: 'VALIDATION_ERROR', message: '`from` must be on or before `to`.' });
    return;
  }

  const cacheKey = `earnings:calendar:${defaultFrom}:${defaultTo}`;
  const t0 = Date.now();

  try {
    const data = await withCache(cacheKey, TTL.news, async () => {
      const { result, providerId } = await withFallback<EarningsCalendarEvent[]>({
        providers: [
          // Primary: FMP `/stable/earnings-calendar` (broadest coverage).
          {
            id: 'fmp', fn: async () => {
              const items = await fmp.getEarningsCalendar(defaultFrom, defaultTo);
              return items.map((e): EarningsCalendarEvent => ({
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
          // Fallback: Finnhub `/calendar/earnings`. FINNHUB_API_KEY is always
          // configured (required env), so this keeps the route alive whenever
          // FMP is quota-limited, premium-gated, or down.
          {
            id: 'finnhub', fn: async () => {
              const items = await finnhub.getEarningsCalendar(defaultFrom, defaultTo);
              return items.map((e): EarningsCalendarEvent => ({
                date: e.date,
                symbol: e.symbol,
                epsActual: e.epsActual ?? null,
                epsEstimate: e.epsEstimate ?? null,
                revenue: e.revenueActual ?? null,
                revenueEstimate: e.revenueEstimate ?? null,
                time: e.hour,
              })).filter((e) => e.date && e.symbol);
            },
          },
        ],
      });
      return { from: defaultFrom, to: defaultTo, events: result, providerId };
    });

    log.info({
      event: 'earnings.calendar.ok', ...reqContext(req),
      servedBy: data.providerId, freshness: 'live',
      eventsCount: data.events.length, latencyMs: Date.now() - t0,
      from: defaultFrom, to: defaultTo,
    });
    res.json({ ...data, degraded: false, freshness: 'live', fetchedAt: Date.now() });
  } catch (err) {
    // Every provider failed (quota / outage / premium gate). This is an
    // EXPECTED failure mode — degrade gracefully to an empty, freshness-tagged
    // payload instead of a raw 500 that blanks the calendar. The frontend
    // already renders an empty calendar as a clean "no events" state.
    const reason = err instanceof Error ? err.message : String(err);
    log.warn({
      event: 'earnings.calendar.degraded', ...reqContext(req),
      freshness: 'degraded', reason, latencyMs: Date.now() - t0,
      from: defaultFrom, to: defaultTo,
    });
    res.json({
      from: defaultFrom,
      to: defaultTo,
      events: [],
      providerId: 'none',
      degraded: true,
      freshness: 'degraded',
      reason: 'Earnings calendar provider temporarily unavailable.',
      fetchedAt: Date.now(),
    });
  }
});

export default router;
