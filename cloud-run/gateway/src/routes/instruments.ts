/**
 * /v1/instruments — instrument-level intelligence composition.
 *
 * Pulls OHLCV (Twelve Data), fundamentals + news (Finnhub), and synthesises an
 * institutional briefing via Gemini. Result cached for 30 minutes.
 */

import { Router } from 'express';
import * as td from '../providers/twelvedata';
import * as finnhub from '../providers/finnhub';
import { withCache, TTL } from '../services/cache';
import { geminiGenerate, SYSTEM_PROMPTS } from '../services/gemini';

const router = Router();

interface IntelligenceBundle {
  symbol: string;
  asOf: number;
  quote: td.TdQuote;
  profile: finnhub.FinnhubCompanyProfile | null;
  basicFinancials: finnhub.FinnhubBasicFinancials | null;
  recentBars: td.OHLCVBar[];
  news: ReturnType<typeof normaliseNews>;
  narrative: string;
}

function normaliseNews(items: finnhub.FinnhubNewsItem[]) {
  return items.slice(0, 8).map((n) => ({
    id: String(n.id),
    headline: n.headline,
    summary: n.summary,
    url: n.url,
    source: n.source,
    publishedAt: n.datetime * 1000,
  }));
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

        const [quote, recentBars, profile, basicFinancials, news] = await Promise.allSettled([
          td.getQuote(symbol),
          td.getTimeSeries(symbol, '1day', 60),
          finnhub.getCompanyProfile(symbol),
          finnhub.getBasicFinancials(symbol),
          finnhub.getCompanyNews(symbol, fmt(past), fmt(today)),
        ]);

        const get = <T,>(r: PromiseSettledResult<T>): T | null =>
          r.status === 'fulfilled' ? r.value : null;

        const q = get(quote);
        const bars = get(recentBars) ?? [];
        const prof = get(profile);
        const bf = get(basicFinancials);
        const newsItems = normaliseNews(get(news) ?? []);

        if (!q) throw new Error(`No quote available for ${symbol}`);

        const last20 = bars.slice(-20).map((b) => b.close);
        const ret = last20.length > 1 ? (last20[last20.length - 1] / last20[0] - 1) * 100 : 0;
        const vol = last20.length > 1 ? Math.sqrt(
          last20.slice(1).map((c, i) => Math.log(c / last20[i]) ** 2)
            .reduce((a, b) => a + b, 0) / (last20.length - 1)
        ) * Math.sqrt(252) * 100 : 0;

        const evidence = [
          `Last price: ${q.price} (${q.changePercent.toFixed(2)}% today)`,
          `20-day return: ${ret.toFixed(2)}%`,
          `Annualised 20-day vol: ${vol.toFixed(1)}%`,
          prof?.finnhubIndustry ? `Industry: ${prof.finnhubIndustry}` : null,
          prof?.marketCapitalization ? `Market cap: ${prof.marketCapitalization}` : null,
          bf?.metric ? `Financial highlights: ${
            ['peBasicExclExtraTTM','revenueGrowthTTMYoy','epsGrowthTTMYoy']
              .map((k) => bf.metric?.[k] != null ? `${k}=${bf.metric[k]}` : null)
              .filter(Boolean).join(', ')
          }` : null,
          newsItems.length ? `Recent headlines:\n  - ${newsItems.slice(0,5).map((n) => n.headline).join('\n  - ')}` : null,
        ].filter(Boolean).join('\n');

        const narrative = await geminiGenerate({
          systemInstruction: SYSTEM_PROMPTS.instrumentAnalyst,
          prompt: `Instrument: ${symbol}\n\nEvidence:\n${evidence}`,
          temperature: 0.3,
        });

        return {
          symbol,
          asOf: Date.now(),
          quote: q,
          profile: prof,
          basicFinancials: bf,
          recentBars: bars,
          news: newsItems,
          narrative,
        };
      },
    );

    res.json(result);
  } catch (err) { next(err); }
});

export default router;
