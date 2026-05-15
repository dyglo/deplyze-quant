/**
 * /v1/instruments — institutional-grade instrument intelligence.
 *
 * Provider routing:
 *   Profile:      Polygon → FMP → Finnhub
 *   Fundamentals: FMP → Finnhub → EODHD
 *   OHLCV:        EODHD → Twelve Data
 *   News:         Polygon → Finnhub
 *   Earnings:     FMP → Finnhub
 *
 * Synthesises a Gemini-powered institutional narrative from enriched data.
 */

import { Router } from 'express';
import * as td from '../providers/twelvedata';
import * as finnhub from '../providers/finnhub';
import * as fmp from '../providers/fmp';
import * as polygon from '../providers/polygon';
import * as eodhd from '../providers/eodhd';
import { withCache, TTL } from '../services/cache';
import { geminiGenerate, SYSTEM_PROMPTS } from '../services/gemini';
import { withFallback, fundamentalsChain } from '../lib/providerRouter';

const router = Router();

// ─── Normalised intelligence bundle ───────────────────────────────────────

interface NormalisedProfile {
  name?: string;
  sector?: string;
  industry?: string;
  country?: string;
  exchange?: string;
  currency?: string;
  marketCap?: number;
  ceo?: string;
  employees?: number;
  description?: string;
  website?: string;
  logo?: string;
  ipoDate?: string;
  providerId: string;
}

interface NormalisedFundamentals {
  peRatio?: number;
  pbRatio?: number;
  evToEbitda?: number;
  debtToEquity?: number;
  roe?: number;
  roic?: number;
  dividendYield?: number;
  eps?: number;
  revenueGrowthYoY?: number;
  earningsGrowthYoY?: number;
  operatingMargin?: number;
  netMargin?: number;
  beta?: number;
  week52High?: number;
  week52Low?: number;
  ma50?: number;
  ma200?: number;
  providerId: string;
}

interface IntelligenceBundle {
  symbol: string;
  asOf: number;
  quote: Record<string, unknown> | null;
  profile: NormalisedProfile | null;
  fundamentals: NormalisedFundamentals | null;
  recentBars: td.OHLCVBar[];
  news: Array<{ id: string; headline: string; url: string; source: string; publishedAt: number; summary?: string }>;
  earnings: Array<{ date: string; epsActual?: number; epsEstimate?: number; surprisePct?: number }>;
  narrative: string;
}

async function fetchProfile(symbol: string): Promise<NormalisedProfile | null> {
  try {
    const { result, providerId } = await withFallback(fundamentalsChain<NormalisedProfile>({
      fmp: async () => {
        const p = await fmp.getProfile(symbol);
        return {
          name: p.companyName, sector: p.sector, industry: p.industry,
          country: p.country, exchange: p.exchangeShortName, currency: p.currency,
          marketCap: p.mktCap, ceo: p.ceo,
          employees: p.fullTimeEmployees ? parseInt(p.fullTimeEmployees, 10) : undefined,
          description: p.description, website: p.website, logo: p.image,
          ipoDate: p.ipoDate, providerId: 'fmp',
        };
      },
      finnhub: async () => {
        const p = await finnhub.getCompanyProfile(symbol);
        return {
          name: p.name, exchange: p.exchange, currency: p.currency,
          marketCap: p.marketCapitalization ? p.marketCapitalization * 1e6 : undefined,
          website: p.weburl, logo: p.logo, industry: p.finnhubIndustry,
          ipoDate: p.ipo, providerId: 'finnhub',
        };
      },
      eodhd: async () => {
        const f = await eodhd.getFundamentals(symbol);
        const g = f.General;
        return {
          name: g?.Name, sector: g?.Sector, industry: g?.Industry,
          country: g?.CountryName, exchange: g?.Exchange, currency: g?.CurrencyCode,
          ceo: g?.CEO, description: g?.Description, website: g?.WebURL,
          logo: g?.LogoURL, ipoDate: g?.IPODate, providerId: 'eodhd',
        };
      },
    }));
    void providerId;
    return result;
  } catch { return null; }
}

async function fetchFundamentals(symbol: string): Promise<NormalisedFundamentals | null> {
  try {
    const { result, providerId } = await withFallback(fundamentalsChain<NormalisedFundamentals>({
      fmp: async () => {
        const [metrics] = await Promise.all([
          fmp.getKeyMetrics(symbol, 'annual', 1),
        ]);
        const m = metrics[0];
        return {
          peRatio: m?.peRatio,
          pbRatio: m?.pbRatio,
          evToEbitda: m?.enterpriseValueOverEBITDA,
          debtToEquity: m?.debtToEquity,
          roe: m?.roe,
          roic: m?.roic,
          dividendYield: m?.dividendYield,
          beta: undefined as number | undefined,
          operatingMargin: undefined as number | undefined,
          netMargin: undefined as number | undefined,
          providerId: 'fmp',
        };
      },
      finnhub: async () => {
        const bf = await finnhub.getBasicFinancials(symbol);
        const m = bf.metric ?? {};
        return {
          peRatio: Number(m['peBasicExclExtraTTM']) || undefined,
          beta: Number(m['beta']) || undefined,
          dividendYield: Number(m['dividendYieldIndicatedAnnual']) || undefined,
          week52High: Number(m['52WeekHigh']) || undefined,
          week52Low: Number(m['52WeekLow']) || undefined,
          roe: Number(m['roeTTM']) || undefined,
          revenueGrowthYoY: Number(m['revenueGrowthTTMYoy']) || undefined,
          earningsGrowthYoY: Number(m['epsGrowthTTMYoy']) || undefined,
          providerId: 'finnhub',
        };
      },
      eodhd: async () => {
        const f = await eodhd.getFundamentals(symbol);
        const h = f.Highlights;
        const v = f.Valuation;
        const t = f.Technicals;
        return {
          peRatio: v?.TrailingPE ?? h?.PERatio,
          pbRatio: v?.PriceBookMRQ,
          evToEbitda: v?.EnterpriseValueEbitda,
          beta: t?.Beta,
          week52High: t?.['52WeekHigh'],
          week52Low: t?.['52WeekLow'],
          ma50: t?.['50DayMA'],
          ma200: t?.['200DayMA'],
          dividendYield: h?.DividendYield,
          roe: h?.ReturnOnEquityTTM,
          operatingMargin: h?.OperatingMarginTTM,
          netMargin: h?.ProfitMargin,
          revenueGrowthYoY: h?.QuarterlyRevenueGrowthYOY,
          earningsGrowthYoY: h?.QuarterlyEarningsGrowthYOY,
          eps: h?.EarningsShare,
          providerId: 'eodhd',
        };
      },
    }));
    void providerId;
    return result;
  } catch { return null; }
}

async function fetchEarnings(symbol: string): Promise<Array<{ date: string; epsActual?: number; epsEstimate?: number; surprisePct?: number }>> {
  try {
    const surprises = await fmp.getEarningsSurprises(symbol, 6);
    return surprises.map((e) => ({
      date: e.date,
      epsActual: e.actualEarningResult,
      epsEstimate: e.estimatedEarning,
      surprisePct: e.estimatedEarning
        ? ((e.actualEarningResult - e.estimatedEarning) / Math.abs(e.estimatedEarning)) * 100
        : undefined,
    }));
  } catch {
    try {
      // Fallback to EODHD earnings history
      const f = await eodhd.getFundamentals(symbol);
      const history = f.Earnings?.History;
      if (!history) return [];
      return Object.values(history)
        .slice(0, 6)
        .map((e) => ({
          date: e.date,
          epsActual: e.epsActual,
          epsEstimate: e.epsEstimate,
          surprisePct: e.surprisePercent,
        }));
    } catch { return []; }
  }
}

router.get('/:symbol/intelligence', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const result = await withCache<IntelligenceBundle>(
      `intel:instrument:${symbol}`,
      TTL.synthesis,
      async () => {
        const today = new Date();
        const past = new Date(today.getTime() - 14 * 86400_000);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);

        const [quoteR, barsR, profileR, fundamentalsR, newsR, earningsR] = await Promise.allSettled([
          // Quote: TD → Finnhub fallback so a rate-limited TD doesn't kill the route.
          td.getQuote(symbol).catch(async () => {
            const q = await finnhub.getQuote(symbol);
            return {
              symbol, price: q.c, open: q.o, high: q.h, low: q.l,
              previousClose: q.pc, change: q.d, changePercent: q.dp,
              ts: q.t * 1000, isMarketOpen: false,
            } as td.TdQuote;
          }),
          eodhd.getHistoricalBars(symbol, { from: fmt(past), to: fmt(today) })
            .then((bars) => {
              if (!bars.length) throw new Error('EODHD: empty');
              return bars.map((b) => ({
                ts: Date.parse(b.date), open: b.open, high: b.high, low: b.low,
                close: b.adjusted_close ?? b.close, volume: b.volume,
              }));
            })
            .catch(() => td.getTimeSeries(symbol, '1day', 60)),
          fetchProfile(symbol),
          fetchFundamentals(symbol),
          polygon.getNews({ symbol, limit: 10 })
            .then((n) => n.map((a) => ({
              id: a.id, headline: a.title, url: a.article_url,
              source: a.publisher.name, publishedAt: Date.parse(a.published_utc),
              summary: a.description,
            })))
            .catch(() => finnhub.getCompanyNews(symbol, fmt(past), fmt(today))
              .then((items) => items.slice(0, 10).map((n) => ({
                id: String(n.id), headline: n.headline, url: n.url,
                source: n.source, publishedAt: n.datetime * 1000, summary: n.summary,
              })))),
          fetchEarnings(symbol),
        ]);

        const get = <T,>(r: PromiseSettledResult<T>): T | null =>
          r.status === 'fulfilled' ? r.value : null;

        const q = get(quoteR);
        const bars = (get(barsR) as td.OHLCVBar[] | null) ?? [];
        const profile = get(profileR);
        const fundamentals = get(fundamentalsR);
        const newsItems = get(newsR) ?? [];
        const earnings = get(earningsR) ?? [];

        if (!q) throw new Error(`No quote available for ${symbol}`);

        const last20 = bars.slice(-20).map((b) => b.close);
        const ret = last20.length > 1 ? (last20[last20.length - 1] / last20[0] - 1) * 100 : 0;
        const vol = last20.length > 1 ? Math.sqrt(
          last20.slice(1).map((c, i) => Math.log(c / last20[i]) ** 2)
            .reduce((a, b) => a + b, 0) / (last20.length - 1)
        ) * Math.sqrt(252) * 100 : 0;

        const evidenceParts = [
          `Last price: ${q.price} (${q.changePercent.toFixed(2)}% today)`,
          `20-day return: ${ret.toFixed(2)}% · Annualised 20-day vol: ${vol.toFixed(1)}%`,
          profile?.name ? `Company: ${profile.name}` : null,
          profile?.sector ? `Sector: ${profile.sector} · Industry: ${profile.industry}` : null,
          profile?.country ? `Country: ${profile.country}` : null,
          profile?.marketCap ? `Market cap: $${(profile.marketCap / 1e9).toFixed(2)}B` : null,
          profile?.description ? `Business: ${profile.description.slice(0, 300)}` : null,
          fundamentals?.peRatio ? `P/E: ${fundamentals.peRatio.toFixed(1)}` : null,
          fundamentals?.pbRatio ? `P/B: ${fundamentals.pbRatio.toFixed(2)}` : null,
          fundamentals?.debtToEquity ? `D/E: ${fundamentals.debtToEquity.toFixed(2)}` : null,
          fundamentals?.roe ? `ROE: ${(fundamentals.roe * 100).toFixed(1)}%` : null,
          fundamentals?.dividendYield ? `Dividend yield: ${(fundamentals.dividendYield * 100).toFixed(2)}%` : null,
          earnings.length > 0 ? `Recent earnings (EPS actual vs estimate):\n  ${
            earnings.slice(0, 4).map((e) =>
              `${e.date}: actual=${e.epsActual?.toFixed(2) ?? 'N/A'} est=${e.epsEstimate?.toFixed(2) ?? 'N/A'} surprise=${e.surprisePct?.toFixed(1) ?? 'N/A'}%`
            ).join('\n  ')
          }` : null,
          newsItems.length ? `Recent headlines:\n  - ${newsItems.slice(0, 5).map((n) => n.headline).join('\n  - ')}` : null,
        ].filter(Boolean).join('\n');

        const narrative = await geminiGenerate({
          systemInstruction: SYSTEM_PROMPTS.instrumentAnalyst,
          prompt: `Instrument: ${symbol}\n\nEvidence:\n${evidenceParts}`,
          temperature: 0.3,
        });

        return {
          symbol, asOf: Date.now(),
          quote: q as unknown as Record<string, unknown>,
          profile, fundamentals,
          recentBars: bars,
          news: newsItems.slice(0, 8),
          earnings,
          narrative,
        };
      },
    );

    res.json(result);
  } catch (err) { next(err); }
});

export default router;
