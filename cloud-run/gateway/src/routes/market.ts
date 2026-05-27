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
import { BigQuery } from '@google-cloud/bigquery';
import * as polygon from '../providers/polygon';
import * as finnhub from '../providers/finnhub';
import * as td from '../providers/twelvedata';
import * as eodhd from '../providers/eodhd';
import * as fmp from '../providers/fmp';
import * as serper from '../providers/serper';
import * as stooq from '../providers/stooq';
import { withCache, cacheSet, TTL } from '../services/cache';
import { withFallback, quoteChain, ohlcvChain, newsChain } from '../lib/providerRouter';
import type { OHLCVBar } from '../providers/twelvedata';
import * as fred from '../providers/fred';
import * as coingecko from '../providers/coingecko';
import * as av from '../providers/alphavantage';

const router = Router();
const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'deplyze-quant';
const CLEANED_DS = process.env.BQ_DATASET_CLEANED ?? 'cleaned';

let _bq: BigQuery | null = null;
function getBQ(): BigQuery {
  if (!_bq) {
    _bq = new BigQuery({
      projectId: PROJECT,
      location: process.env.BIGQUERY_LOCATION ?? 'US',
    });
  }
  return _bq;
}

async function queryWarehouseOhlcv(symbol: string, limit: number): Promise<OHLCVBar[]> {
  const [rows] = await getBQ().query({
    query: `
      SELECT
        UNIX_MILLIS(TIMESTAMP(observation_time)) AS ts,
        open,
        high,
        low,
        COALESCE(adjusted_close, close) AS close,
        volume
      FROM \`${PROJECT}.${CLEANED_DS}.ohlcv_cleaned\`
      WHERE symbol = @symbol
        AND observation_time IS NOT NULL
        AND close IS NOT NULL
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY DATE(observation_time)
        ORDER BY updated_at DESC, processing_time DESC, ingestion_time DESC
      ) = 1
      ORDER BY observation_time DESC
      LIMIT @limit
    `,
    params: { symbol, limit },
    location: process.env.BIGQUERY_LOCATION ?? 'US',
    maximumBytesBilled: String(100 * 1024 * 1024),
  });

  return (rows as Array<{
    ts: string | number;
    open: string | number | null;
    high: string | number | null;
    low: string | number | null;
    close: string | number;
    volume: string | number | null;
  }>).reverse().map((r) => ({
    ts: Number(r.ts),
    open: Number(r.open ?? r.close),
    high: Number(r.high ?? r.close),
    low: Number(r.low ?? r.close),
    close: Number(r.close),
    volume: Number(r.volume ?? 0),
  })).filter((b) => Number.isFinite(b.ts) && Number.isFinite(b.close));
}

// ─── /quote/:symbol ────────────────────────────────────────────────────────
router.get('/quote/:symbol', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    // FX, commodities and crypto use XX/YY format — Polygon (US equities only)
    // and Finnhub return all-zeros for them, masking the real error. Skip
    // directly to Twelve Data (which supports FX/metals/energy pairs natively).
    const isCrossAsset = symbol.includes('/');
    const data = await withCache(`quote:v2:${symbol}`, TTL.quote, async () => {
      const { result, providerId } = await withFallback(quoteChain({
        polygon: !isCrossAsset ? async () => {
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
        } : undefined,
        finnhub: !isCrossAsset ? async () => {
          const q = await finnhub.getQuote(symbol);
          // Finnhub returns all-zeros for unknown symbols (HTTP 200, not an error).
          // Treat a zero price as "no data" so Twelve Data is tried instead.
          if (q.c === 0 && q.pc === 0) throw new Error('Finnhub: no data for symbol');
          return {
            symbol, price: q.c, open: q.o, high: q.h, low: q.l,
            previousClose: q.pc, change: q.d, changePercent: q.dp,
            ts: q.t * 1000, source: 'finnhub',
          };
        } : undefined,
        twelve_data: async () => {
          const q = await td.getQuote(td.normalizeTdSymbol(symbol));
          return { ...q, symbol, source: 'twelve_data' };
        },
        eodhd: async () => {
          const q = await eodhd.getQuote(symbol);
          return { ...q, source: 'eodhd' };
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
    const list = symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 100);
    const out = await Promise.all(
      list.map(async (sym) => {
        const isCrossAsset = sym.includes('/');
        try {
          const data = await withCache(`quote:v2:${sym}`, TTL.quote, async () => {
            const { result, providerId } = await withFallback(quoteChain({
              polygon: !isCrossAsset ? async () => {
                const s = await polygon.getSnapshot(sym);
                const price = s.lastTrade?.p ?? s.day?.c ?? 0;
                return {
                  symbol: sym, price, open: s.day?.o ?? 0, high: s.day?.h ?? 0,
                  low: s.day?.l ?? 0, previousClose: s.prevDay?.c ?? 0,
                  change: s.todaysChange, changePercent: s.todaysChangePerc,
                  ts: s.updated ? Math.floor(s.updated / 1_000_000) : Date.now(), source: 'polygon',
                };
              } : undefined,
              finnhub: !isCrossAsset
                // Equities: standard Finnhub quote.
                // Outside market hours c=0 is normal; use pc as the effective price.
                ? async () => {
                    const q = await finnhub.getQuote(sym);
                    // Only reject when both current price AND previous close are zero
                    // (meaning the symbol is truly unknown, not just market-closed).
                    if (q.c === 0 && q.pc === 0) throw new Error('Finnhub: no data for symbol');
                    const price = q.c !== 0 ? q.c : q.pc;
                    return {
                      symbol: sym, price, open: q.o || q.pc, high: q.h || q.pc, low: q.l || q.pc,
                      previousClose: q.pc, change: q.d, changePercent: q.dp,
                      ts: q.t ? q.t * 1000 : Date.now(), source: 'finnhub',
                    };
                  }
                // FX / Crypto: use Finnhub OANDA/Binance endpoints
                : finnhub.toFinnhubCrossAssetSymbol(sym)
                  ? async () => {
                      const q = await finnhub.getCrossAssetQuote(sym);
                      return {
                        symbol: sym, price: q.c, open: q.o, high: q.h, low: q.l,
                        previousClose: q.pc, change: q.d, changePercent: q.dp,
                        ts: q.t ? q.t * 1000 : Date.now(), source: 'finnhub',
                      };
                    }
                  : undefined,
              twelve_data: async () => {
                const q = await td.getQuote(td.normalizeTdSymbol(sym));
                return { ...q, symbol: sym, source: 'twelve_data' };
              },
              eodhd: async () => {
                const q = await eodhd.getQuote(sym);
                return { ...q, source: 'eodhd' };
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

// GET /ohlcv/:symbol(*) — matches any symbol string including those containing slashes
// (e.g. FX / Crypto like ETH/USD), which get double-decoded (%2F → /) before routing.
router.get('/ohlcv/:symbol(*)', async (req, res, next) => {

  try {
    const symbol = req.params.symbol.toUpperCase();
    const { interval, outputsize } = OhlcvQuery.parse(req.query);
    const isDaily = interval === '1day' || interval === '1week' || interval === '1month';
    const ttl = isDaily ? TTL.ohlcv_daily : TTL.ohlcv_intraday;
    const cacheKey = `ohlcv:v4:${symbol}:${interval}:${outputsize}`;

    const isFx     = fred.isFxSupported(symbol);
    const isCrypto = coingecko.isCryptoSupported(symbol);
    const isCrossAsset = symbol.includes('/');

    // Minimum bar threshold: only applies to large equity history requests.
    const SPARSE_MIN = (!isCrossAsset && outputsize >= 500) ? 280 : 0;
    const warehouseEligible = interval === '1day' && !isCrossAsset && !isFx && !isCrypto;
    const warehouseMin = SPARSE_MIN > 0 ? SPARSE_MIN : Math.min(10, outputsize);
    const minUsableBars = warehouseEligible ? warehouseMin : SPARSE_MIN;
    let warehouseBars: OHLCVBar[] = [];

    const fetchFresh = async (): Promise<OHLCVBar[]> => {
      const today    = new Date().toISOString().slice(0, 10);
      const pastDate = new Date(Date.now() - outputsize * 1.5 * 86400_000).toISOString().slice(0, 10);
      const tdInterval = interval as Parameters<typeof td.getTimeSeries>[1];

      // ── FX / Commodity: FRED is the primary free source ─────────────────
      if (isFx) {
        const { result } = await withFallback(ohlcvChain<OHLCVBar[]>({
          // FRED daily closing rates — free, 120 req/min, no daily cap
          eodhd: async (signal) => fred.getFxOhlcvBars(symbol, outputsize, signal),
          // Twelve Data as fallback for FX (handles slash-format natively)
          twelve_data: async (signal) => td.getTimeSeries(td.normalizeTdSymbol(symbol), tdInterval, outputsize, signal),
        }));
        return result;
      }

      // ── Crypto: CoinGecko first (free, no key), Twelve Data as fallback ──
      if (isCrypto) {
        const { result } = await withFallback(ohlcvChain<OHLCVBar[]>({
          eodhd: async (signal) => coingecko.getCryptoOhlcvBars(symbol, outputsize, signal),
          twelve_data: async (signal) => td.getTimeSeries(td.normalizeTdSymbol(symbol), tdInterval, outputsize, signal),
        }));
        return result;
      }

      // ── Equities / ETFs / Indices: paid feeds first, public/low-quota feeds last ──
      const { result } = await withFallback(ohlcvChain<OHLCVBar[]>({
        eodhd: isDaily ? async (signal) => {
          const rawBars = await eodhd.getHistoricalBars(symbol, { from: pastDate, to: today }, signal);
          if (!rawBars.length) throw new Error('EODHD: empty response');
          const bars = rawBars.slice(-outputsize).map((b) => ({
            ts: Date.parse(b.date),
            open: b.open, high: b.high, low: b.low,
            close: b.adjusted_close ?? b.close, volume: b.volume,
          }));
          if (bars.length < SPARSE_MIN) throw new Error(`EODHD: sparse result (${bars.length}/${outputsize} bars)`);
          return bars;
        } : undefined,
        twelve_data: async (signal) => {
          const bars = await td.getTimeSeries(td.normalizeTdSymbol(symbol), tdInterval, outputsize, signal);
          if (bars.length < SPARSE_MIN) throw new Error(`Twelve Data: sparse result (${bars.length}/${outputsize} bars)`);
          return bars;
        },
        fmp: isDaily ? async (signal) => {
          const rawBars = await fmp.getHistoricalPrice(symbol, pastDate, today, outputsize, signal);
          if (!rawBars.length) throw new Error('FMP: empty response');
          return rawBars.map((b) => ({
            ts: Date.parse(b.date),
            open: b.open, high: b.high, low: b.low, close: b.adjClose ?? b.close, volume: b.volume,
          }));
        } : undefined,
        polygon: isDaily && !isCrossAsset ? async (signal) => {
          const aggs = await polygon.getAggs({
            symbol,
            multiplier: 1,
            timespan: 'day',
            from: pastDate,
            to: today,
            adjusted: true,
            limit: outputsize,
            signal,
          });
          if (!aggs.length) throw new Error('Polygon: empty response');
          const bars = aggs.map((a) => ({
            ts: a.t,
            open: a.o, high: a.h, low: a.l, close: a.c, volume: a.v,
          }));
          if (bars.length < SPARSE_MIN) throw new Error(`Polygon: sparse result (${bars.length}/${outputsize} bars)`);
          return bars;
        } : undefined,
        alpha_vantage: isDaily && !isCrossAsset && av.isConfigured() ? async (signal) => {
          const bars = await av.getEquityDaily(symbol, outputsize, signal);
          if (bars.length < SPARSE_MIN) throw new Error(`Alpha Vantage: sparse result (${bars.length}/${outputsize} bars)`);
          return bars;
        } : undefined,
        stooq: isDaily && !isCrossAsset && stooq.isConfigured() ? async (signal) => {
          const bars = await stooq.getDailyBars(symbol, pastDate, today, outputsize, signal);
          if (bars.length < SPARSE_MIN) throw new Error(`Stooq: sparse result (${bars.length}/${outputsize} bars)`);
          return bars;
        } : undefined,
      }));
      return result;
    };

    let bars: OHLCVBar[];
    let source = 'provider';
    let stale = false;
    try {
      if (warehouseEligible) {
        try {
          warehouseBars = await queryWarehouseOhlcv(symbol, outputsize);
          if (warehouseBars.length >= warehouseMin) {
            source = 'warehouse';
            bars = warehouseBars;
            void fetchFresh()
              .then(async (fresh) => {
                if (fresh.length >= warehouseMin) {
                  await cacheSet(cacheKey, fresh, ttl);
                }
              })
              .catch((refreshErr) => {
                console.warn(`[ohlcv] background provider refresh failed for ${symbol}: ${(refreshErr as Error).message}`);
              });
            res.json({ symbol, interval, bars, source, stale });
            return;
          }
        } catch (warehouseErr) {
          console.warn(`[ohlcv] warehouse fallback failed for ${symbol}: ${(warehouseErr as Error).message}`);
        }
      }

      bars = await withCache(cacheKey, ttl, fetchFresh);
      // Post-cache sparse guard (equities only)
      if (bars.length < minUsableBars) {
        console.warn(`[ohlcv] stale sparse cache for ${symbol} — re-fetching`);
        bars = await fetchFresh();
        await cacheSet(cacheKey, bars, ttl);
      }
    } catch (providerErr) {
      console.warn(`[ohlcv] all providers failed for ${symbol}: ${(providerErr as Error).message}`);
      if (warehouseBars.length > 0) {
        bars = warehouseBars;
        source = 'warehouse';
        stale = true;
      } else {
        bars = [];
      }
    }

    res.json({ symbol, interval, bars, source, stale });
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
    let items: Awaited<ReturnType<typeof serper.searchNews>>;
    try {
      items = await withCache(cacheKey, TTL.news, () => serper.searchNews(q, 15));
    } catch (providerErr) {
      console.warn(`[headlines] Serper unavailable: ${(providerErr as Error).message}`);
      items = [];
    }
    res.json({ items });
  } catch (err) { next(err); }
});

// ─── /movers ──────────────────────────────────────────────────────────────
router.get('/movers', async (req, res, next) => {
  try {
    const type = (req.query.type as string) ?? 'gainers';
    const cacheKey = `movers:fmp:${type}`;
    let data: unknown[];
    try {
      data = await withCache(cacheKey, TTL.quote * 5, async () => {
        if (type === 'losers') return fmp.getLosers();
        if (type === 'active') return fmp.getMostActive();
        return fmp.getGainers();
      });
    } catch (providerErr) {
      // FMP key not configured or quota exceeded — return empty list gracefully.
      console.warn(`[movers] FMP unavailable: ${(providerErr as Error).message}`);
      data = [];
    }
    res.json({ type, movers: data });
  } catch (err) { next(err); }
});

export default router;
