/**
 * /v1/market — quotes, OHLCV, news, symbol search.
 */

import { Router } from 'express';
import { z } from 'zod';
import * as finnhub from '../providers/finnhub';
import * as td from '../providers/twelvedata';
import * as serper from '../providers/serper';
import { withCache, TTL } from '../services/cache';

const router = Router();

// ─── /quote/:symbol ────────────────────────────────────────────────────────
router.get('/quote/:symbol', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const provider = req.query.provider === 'finnhub' ? 'finnhub' : 'twelve_data';
    const cacheKey = `quote:${provider}:${symbol}`;

    const data = await withCache(cacheKey, TTL.quote, async () => {
      if (provider === 'finnhub') {
        const q = await finnhub.getQuote(symbol);
        return {
          symbol,
          price: q.c,
          open: q.o,
          high: q.h,
          low: q.l,
          previousClose: q.pc,
          change: q.d,
          changePercent: q.dp,
          ts: q.t * 1000,
          source: 'finnhub',
        };
      }
      const q = await td.getQuote(symbol);
      return { ...q, source: 'twelve_data' };
    });

    res.json(data);
  } catch (err) { next(err); }
});

// ─── /quotes (batch) ───────────────────────────────────────────────────────
const BatchQuery = z.object({
  symbols: z.string().min(1), // comma-separated
});
router.get('/quotes', async (req, res, next) => {
  try {
    const { symbols } = BatchQuery.parse(req.query);
    const list = symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 25);
    const out = await Promise.all(
      list.map(async (sym) => {
        try {
          const data = await withCache(`quote:twelve_data:${sym}`, TTL.quote, async () => {
            const q = await td.getQuote(sym);
            return { ...q, source: 'twelve_data' };
          });
          return { symbol: sym, ok: true, data };
        } catch (e: unknown) {
          return { symbol: sym, ok: false, error: (e as Error).message };
        }
      }),
    );
    res.json({ quotes: out });
  } catch (err) { next(err); }
});

// ─── /ohlcv/:symbol ────────────────────────────────────────────────────────
const OhlcvQuery = z.object({
  interval: z.enum(['1min','5min','15min','30min','1h','4h','1day','1week','1month']).default('1day'),
  outputsize: z.coerce.number().int().min(10).max(5000).default(200),
});
router.get('/ohlcv/:symbol', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const { interval, outputsize } = OhlcvQuery.parse(req.query);
    const ttl = interval === '1day' || interval === '1week' || interval === '1month'
      ? TTL.ohlcv_daily
      : TTL.ohlcv_intraday;
    const cacheKey = `ohlcv:${symbol}:${interval}:${outputsize}`;
    const bars = await withCache(cacheKey, ttl, () => td.getTimeSeries(symbol, interval, outputsize));
    res.json({ symbol, interval, bars });
  } catch (err) { next(err); }
});

// ─── /news ─────────────────────────────────────────────────────────────────
const NewsQuery = z.object({
  symbol: z.string().optional(),
  category: z.enum(['general','forex','crypto','merger']).default('general'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
router.get('/news', async (req, res, next) => {
  try {
    const { symbol, category, limit } = NewsQuery.parse(req.query);
    const cacheKey = symbol ? `news:symbol:${symbol}` : `news:cat:${category}`;
    const items = await withCache(cacheKey, TTL.news, async () => {
      if (symbol) {
        const today = new Date();
        const past = new Date(today.getTime() - 7 * 86400_000);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        return finnhub.getCompanyNews(symbol.toUpperCase(), fmt(past), fmt(today));
      }
      return finnhub.getMarketNews(category);
    });
    const mapped = items.slice(0, limit).map((n) => ({
      id: String(n.id),
      headline: n.headline,
      summary: n.summary,
      url: n.url,
      source: n.source,
      publishedAt: n.datetime * 1000,
      image: n.image,
      symbols: n.related ? n.related.split(',').map((s) => s.trim()).filter(Boolean) : [],
    }));
    res.json({ items: mapped });
  } catch (err) { next(err); }
});

// ─── /search ───────────────────────────────────────────────────────────────
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q) { res.status(400).json({ error: 'q is required' }); return; }
    const cacheKey = `symsearch:${q.toLowerCase()}`;
    const matches = await withCache(cacheKey, TTL.web_search, () => td.symbolSearch(q));
    res.json({ matches });
  } catch (err) { next(err); }
});

// ─── /headlines (Serper fast-news backup) ──────────────────────────────────
router.get('/headlines', async (req, res, next) => {
  try {
    const q = (req.query.q as string | undefined) ?? 'global markets';
    const cacheKey = `serper:news:${q.toLowerCase()}`;
    const items = await withCache(cacheKey, TTL.news, () => serper.searchNews(q, 15));
    res.json({ items });
  } catch (err) { next(err); }
});

export default router;
