/**
 * /v1/market — quotes, OHLCV, news, symbol search, movers.
 *
 * Provider routing:
 *   Quotes:   Polygon → Finnhub → Twelve Data
 *   OHLCV:    EODHD → Twelve Data → FMP
 *   News:     Polygon → Finnhub → Serper
 *   Movers:   FMP (primary)
 *   Search:   Twelve Data (primary)
 */

import { Router } from 'express';
import { z } from 'zod';
import * as polygon from '../providers/polygon';
import * as finnhub from '../providers/finnhub';
import * as td from '../providers/twelvedata';
import * as eodhd from '../providers/eodhd';
import * as fmp from '../providers/fmp';
import * as serper from '../providers/serper';
import { withCache, TTL } from '../services/cache';
import { withFallback, quoteChain, ohlcvChain, newsChain } from '../lib/providerRouter';
import type { OHLCVBar } from '../providers/twelvedata';

const router = Router();

// ─── /quote/:symbol ────────────────────────────────────────────────────────
router.get('/quote/:symbol', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const data = await withCache(`quote:v2:${symbol}`, TTL.quote, async () => {
      const { result, providerId } = await withFallback(quoteChain({
        polygon: async () => {
          const s = await polygon.getSnapshot(symbol);
          const price = s.lastTrade?.p ?? s.day?.c ?? 0;
          return {
            symbol,
            price,
            open: s.day?.o ?? 0,
            high: s.day?.h ?? 0,
            low: s.day?.l ?? 0,
            previousClose: s.prevDay?.c ?? 0,
            change: s.todaysChange,
            changePercent: s.todaysChangePerc,
            ts: s.updated ? Math.floor(s.updated / 1_000_000) : Date.now(),
            source: 'polygon',
          };
        },
        finnhub: async () => {
          const q = await finnhub.getQuote(symbol);
          return {
            symbol, price: q.c, open: q.o, high: q.h, low: q.l,
            previousClose: q.pc, change: q.d, changePercent: q.dp,
            ts: q.t * 1000, source: 'finnhub',
          };
        },
        twelve_data: async () => {
          const q = await td.getQuote(symbol);
          return { ...q, source: 'twelve_data' };
        },
      }));
      return { ...result, source: providerId };
    });
    res.json(data);
  } catch (err) { next(err); }
});

// ─── /quotes (batch) ───────────────────────────────────────────────────────
const BatchQuery = z.object({ symbols: z.string().min(1) });
router.get('/quotes', async (req, res, next) => {
  try {
    const { symbols } = BatchQuery.parse(req.query);
    const list = symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 25);
    const out = await Promise.all(
      list.map(async (sym) => {
        try {
          const data = await withCache(`quote:v2:${sym}`, TTL.quote, async () => {
            const { result, providerId } = await withFallback(quoteChain({
              polygon: async () => {
                const s = await polygon.getSnapshot(sym);
                const price = s.lastTrade?.p ?? s.day?.c ?? 0;
                return {
                  symbol: sym, price, open: s.day?.o ?? 0, high: s.day?.h ?? 0,
                  low: s.day?.l ?? 0, previousClose: s.prevDay?.c ?? 0,
                  change: s.todaysChange, changePercent: s.todaysChangePerc,
                  ts: s.updated ? Math.floor(s.updated / 1_000_000) : Date.now(), source: 'polygon',
                };
              },
              finnhub: async () => {
                const q = await finnhub.getQuote(sym);
                return {
                  symbol: sym, price: q.c, open: q.o, high: q.h, low: q.l,
                  previousClose: q.pc, change: q.d, changePercent: q.dp,
                  ts: q.t * 1000, source: 'finnhub',
                };
              },
              twelve_data: async () => {
                const q = await td.getQuote(sym);
                return { ...q, source: 'twelve_data' };
              },
            }));
            return { ...result, source: providerId };
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

function intervalToPolygon(interval: string): { multiplier: number; timespan: polygon.PolygonTimespan } | null {
  const map: Record<string, { multiplier: number; timespan: polygon.PolygonTimespan }> = {
    '1min':  { multiplier: 1,  timespan: 'minute' },
    '5min':  { multiplier: 5,  timespan: 'minute' },
    '15min': { multiplier: 15, timespan: 'minute' },
    '30min': { multiplier: 30, timespan: 'minute' },
    '1h':    { multiplier: 1,  timespan: 'hour'   },
    '4h':    { multiplier: 4,  timespan: 'hour'   },
    '1day':  { multiplier: 1,  timespan: 'day'    },
    '1week': { multiplier: 1,  timespan: 'week'   },
    '1month':{ multiplier: 1,  timespan: 'month'  },
  };
  return map[interval] ?? null;
}

router.get('/ohlcv/:symbol', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const { interval, outputsize } = OhlcvQuery.parse(req.query);
    const isDaily = interval === '1day' || interval === '1week' || interval === '1month';
    const ttl = isDaily ? TTL.ohlcv_daily : TTL.ohlcv_intraday;
    // Keep legacy cache key so warm entries remain valid after the V2 upgrade.
    const cacheKey = `ohlcv:${symbol}:${interval}:${outputsize}`;

    const bars = await withCache(cacheKey, ttl, async () => {
      const today = new Date().toISOString().slice(0, 10);
      const pastDate = new Date(Date.now() - outputsize * 1.5 * 86400_000).toISOString().slice(0, 10);
      const tdInterval = interval as Parameters<typeof td.getTimeSeries>[1];

      // For daily bars: try EODHD first (adjusted close), fall back to Twelve Data, then FMP.
      // For intraday: Twelve Data is the only provider with minute/hour data in this tier.
      const { result } = await withFallback(ohlcvChain<OHLCVBar[]>({
        eodhd: isDaily ? async () => {
          const rawBars = await eodhd.getHistoricalBars(symbol, { from: pastDate, to: today });
          if (!rawBars.length) throw new Error('EODHD: empty response');
          return rawBars.slice(-outputsize).map((b) => ({
            ts: Date.parse(b.date),
            open: b.open, high: b.high, low: b.low,
            close: b.adjusted_close ?? b.close, volume: b.volume,
          }));
        } : undefined,
        twelve_data: async () => td.getTimeSeries(symbol, tdInterval, outputsize),
        fmp: isDaily ? async () => {
          const rawBars = await fmp.getHistoricalPrice(symbol, pastDate, today, outputsize);
          if (!rawBars.length) throw new Error('FMP: empty response');
          return rawBars.map((b) => ({
            ts: Date.parse(b.date),
            open: b.open, high: b.high, low: b.low, close: b.adjClose ?? b.close, volume: b.volume,
          }));
        } : undefined,
      }));

      return result;
    });

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
    const cacheKey = symbol ? `news:v2:sym:${symbol}` : `news:v2:cat:${category}`;
    const items = await withCache(cacheKey, TTL.news, async () => {
      const { result } = await withFallback(newsChain<Array<{
        id: string; headline: string; summary?: string; url: string;
        source: string; publishedAt: number; image?: string; symbols?: string[];
      }>>({
        polygon: symbol ? async () => {
          const news = await polygon.getNews({ symbol, limit });
          return news.map((n) => ({
            id: n.id,
            headline: n.title,
            summary: n.description,
            url: n.article_url,
            source: n.publisher.name,
            publishedAt: Date.parse(n.published_utc),
            image: n.image_url,
            symbols: n.tickers,
          }));
        } : undefined,
        finnhub: async () => {
          if (symbol) {
            const today = new Date();
            const past = new Date(today.getTime() - 7 * 86400_000);
            const fmt = (d: Date) => d.toISOString().slice(0, 10);
            const items = await finnhub.getCompanyNews(symbol, fmt(past), fmt(today));
            return items.slice(0, limit).map((n) => ({
              id: String(n.id), headline: n.headline, summary: n.summary,
              url: n.url, source: n.source, publishedAt: n.datetime * 1000,
              image: n.image, symbols: n.related ? n.related.split(',').map((s) => s.trim()) : [],
            }));
          }
          const items = await finnhub.getMarketNews(category);
          return items.slice(0, limit).map((n) => ({
            id: String(n.id), headline: n.headline, summary: n.summary,
            url: n.url, source: n.source, publishedAt: n.datetime * 1000,
            image: n.image, symbols: [],
          }));
        },
        serper: async () => {
          const q = symbol ? `${symbol} stock news` : 'global markets financial news';
          const results = await serper.searchNews(q, limit);
          return results.map((r, i) => ({
            id: `serper-${i}`,
            headline: r.title,
            url: r.link,
            source: r.source ?? 'web',
            publishedAt: r.date ? Date.parse(r.date) : Date.now(),
            symbols: symbol ? [symbol] : [],
          }));
        },
      }));
      return result;
    });
    res.json({ items: items.slice(0, limit) });
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

// ─── /headlines (fast news) ────────────────────────────────────────────────
router.get('/headlines', async (req, res, next) => {
  try {
    const q = (req.query.q as string | undefined) ?? 'global markets';
    const cacheKey = `serper:news:${q.toLowerCase()}`;
    const items = await withCache(cacheKey, TTL.news, () => serper.searchNews(q, 15));
    res.json({ items });
  } catch (err) { next(err); }
});

// ─── /movers ──────────────────────────────────────────────────────────────
router.get('/movers', async (req, res, next) => {
  try {
    const type = (req.query.type as string) ?? 'gainers';
    const cacheKey = `movers:fmp:${type}`;
    const data = await withCache(cacheKey, TTL.quote * 5, async () => {
      if (type === 'losers') return fmp.getLosers();
      if (type === 'active') return fmp.getMostActive();
      return fmp.getGainers();
    });
    res.json({ type, movers: data });
  } catch (err) { next(err); }
});

export default router;
