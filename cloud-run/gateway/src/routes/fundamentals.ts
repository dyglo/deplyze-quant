/**
 * /v1/fundamentals — institutional company fundamentals.
 * Provider routing: FMP → Finnhub → EODHD
 */

import { Router } from 'express';
import * as fmp from '../providers/fmp';
import * as finnhub from '../providers/finnhub';
import * as eodhd from '../providers/eodhd';
import * as edgar from '../providers/edgar';
import { withCache, TTL } from '../services/cache';
import { withFallback } from '../lib/providerRouter';

const router = Router();

// ─── /fundamentals/:symbol/profile ────────────────────────────────────────
router.get('/:symbol/profile', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const data = await withCache(`fund:profile:${symbol}`, TTL.fundamentals, async () => {
      const { result, providerId } = await withFallback<Record<string, unknown>>({
        providers: [
          {
            id: 'fmp', fn: async () => {
              const p = await fmp.getProfile(symbol);
              return {
                symbol: p.symbol, name: p.companyName, sector: p.sector,
                industry: p.industry, country: p.country,
                exchange: p.exchangeShortName, currency: p.currency,
                marketCap: p.mktCap, beta: p.beta, cik: p.cik,
                isin: p.isin, ceo: p.ceo,
                employees: p.fullTimeEmployees ? parseInt(p.fullTimeEmployees, 10) : undefined,
                sharesOutstanding: p.sharesOutstanding,
                description: p.description, website: p.website,
                logo: p.image, ipoDate: p.ipoDate,
                isEtf: p.isEtf, isActivelyTrading: p.isActivelyTrading,
              } as Record<string, unknown>;
            },
          },
          {
            id: 'finnhub', fn: async () => {
              const p = await finnhub.getCompanyProfile(symbol);
              return {
                symbol, name: p.name, exchange: p.exchange, currency: p.currency,
                marketCap: p.marketCapitalization ? p.marketCapitalization * 1e6 : undefined,
                website: p.weburl, logo: p.logo, industry: p.finnhubIndustry,
                ipoDate: p.ipo,
              } as Record<string, unknown>;
            },
          },
          {
            id: 'eodhd', fn: async () => {
              const f = await eodhd.getFundamentals(symbol);
              const g = f.General;
              return {
                symbol: g?.Code, name: g?.Name, sector: g?.Sector,
                industry: g?.Industry, country: g?.CountryName,
                exchange: g?.Exchange, currency: g?.CurrencyCode,
                ceo: g?.CEO, description: g?.Description, website: g?.WebURL,
                logo: g?.LogoURL, ipoDate: g?.IPODate, isin: g?.ISIN,
              } as Record<string, unknown>;
            },
          },
        ],
      });
      return { ...result, providerId };
    });
    res.json(data);
  } catch (err) { next(err); }
});

// ─── /fundamentals/:symbol/metrics ────────────────────────────────────────
router.get('/:symbol/metrics', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const period = (req.query.period === 'quarter' ? 'quarter' : 'annual') as 'annual' | 'quarter';
    const cacheKey = `fund:metrics:${symbol}:${period}`;
    const data = await withCache(cacheKey, TTL.fundamentals, async () => {
      const { result, providerId } = await withFallback<{ series: Record<string, unknown>[] }>({
        providers: [
          {
            id: 'fmp', fn: async () => {
              const [metrics, income] = await Promise.all([
                fmp.getKeyMetrics(symbol, period, 4),
                fmp.getIncomeStatement(symbol, period, 4),
              ]);
              return {
                series: metrics.map((m, i) => ({
                  date: m.date, period: m.period,
                  peRatio: m.peRatio, pbRatio: m.pbRatio, evToEbitda: m.enterpriseValueOverEBITDA,
                  debtToEquity: m.debtToEquity, currentRatio: m.currentRatio,
                  roe: m.roe, roic: m.roic, dividendYield: m.dividendYield,
                  earningsYield: m.earningsYield, fcfYield: m.freeCashFlowYield,
                  bookValuePerShare: m.bookValuePerShare,
                  netMargin: income[i]?.netIncomeRatio,
                  operatingMargin: income[i]?.operatingIncomeRatio,
                  revenue: income[i]?.revenue, netIncome: income[i]?.netIncome,
                  ebitda: income[i]?.ebitda, eps: income[i]?.eps,
                })) as Record<string, unknown>[],
              };
            },
          },
          {
            id: 'finnhub', fn: async () => {
              const bf = await finnhub.getBasicFinancials(symbol);
              const m = bf.metric ?? {};
              return {
                series: [{
                  date: new Date().toISOString().slice(0, 10),
                  peRatio: Number(m['peBasicExclExtraTTM']) || undefined,
                  beta: Number(m['beta']) || undefined,
                  dividendYield: Number(m['dividendYieldIndicatedAnnual']) || undefined,
                  week52High: Number(m['52WeekHigh']) || undefined,
                  week52Low: Number(m['52WeekLow']) || undefined,
                  roe: Number(m['roeTTM']) || undefined,
                  revenueGrowthYoY: Number(m['revenueGrowthTTMYoy']) || undefined,
                  earningsGrowthYoY: Number(m['epsGrowthTTMYoy']) || undefined,
                }] as Record<string, unknown>[],
              };
            },
          },
          {
            id: 'eodhd', fn: async () => {
              const f = await eodhd.getFundamentals(symbol);
              const h = f.Highlights; const v = f.Valuation; const t = f.Technicals;
              return {
                series: [{
                  date: h?.MostRecentQuarter ?? new Date().toISOString().slice(0, 10),
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
                  eps: h?.EarningsShare,
                }] as Record<string, unknown>[],
              };
            },
          },
        ],
      });
      return { ...result, providerId };
    });
    res.json(data);
  } catch (err) { next(err); }
});

// ─── /fundamentals/:symbol/financials ─────────────────────────────────────
router.get('/:symbol/financials', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const period = (req.query.period === 'quarter' ? 'quarter' : 'annual') as 'annual' | 'quarter';
    const limit = Math.min(parseInt(String(req.query.limit ?? '8'), 10) || 8, 20);
    const cacheKey = `fund:financials:${symbol}:${period}:${limit}`;
    const data = await withCache(cacheKey, TTL.fundamentals, async () => {
      const income = await fmp.getIncomeStatement(symbol, period, limit);
      return {
        series: income
          .map((r) => ({
            date: r.date,
            period: r.period,
            revenue: r.revenue,
            grossProfit: r.grossProfit,
            operatingIncome: r.operatingIncome,
            netIncome: r.netIncome,
            eps: r.epsdiluted ?? r.eps,
            ebitda: r.ebitda,
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
    });
    res.json(data);
  } catch (err) { next(err); }
});

// ─── /fundamentals/:symbol/analyst ────────────────────────────────────────
router.get('/:symbol/analyst', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const data = await withCache(`fund:analyst:${symbol}`, TTL.fundamentals, async () => {
      const [recsR, targetsR, upgradesR] = await Promise.allSettled([
        fmp.getAnalystRecommendations(symbol, 1),
        fmp.getPriceTargets(symbol, 20),
        fmp.getUpgradesDowngrades(symbol, 20),
      ]);
      const recs = recsR.status === 'fulfilled' ? recsR.value : [];
      const targets = targetsR.status === 'fulfilled' ? targetsR.value : [];
      const upgrades = upgradesR.status === 'fulfilled' ? upgradesR.value : [];

      const rec = recs[0] ?? null;
      const ptValues = targets
        .map((t) => t.adjPriceTarget > 0 ? t.adjPriceTarget : t.priceTarget)
        .filter((v) => v > 0);
      const ptHigh = ptValues.length ? Math.max(...ptValues) : undefined;
      const ptLow = ptValues.length ? Math.min(...ptValues) : undefined;
      const ptAvg = ptValues.length
        ? ptValues.reduce((a, b) => a + b, 0) / ptValues.length
        : undefined;

      return {
        recommendations: rec ? {
          strongBuy: rec.analystRatingsStrongBuy,
          buy: rec.analystRatingsbuy,
          hold: rec.analystRatingsHold,
          sell: rec.analystRatingsSell,
          strongSell: rec.analystRatingsStrongSell,
          date: rec.date,
        } : null,
        priceTargets: {
          high: ptHigh,
          low: ptLow,
          avg: ptAvg,
          count: ptValues.length,
          recent: targets.slice(0, 8).map((t) => {
            const tMs = new Date(t.publishedDate).getTime();
            // Match upgrade/downgrade by same company within ±30 days of the price target
            const match = upgrades.find((u) => {
              const uMs = new Date(u.publishedDate).getTime();
              return (
                u.gradingCompany.toLowerCase() === t.analystCompany.toLowerCase() &&
                Math.abs(uMs - tMs) < 30 * 86_400_000
              );
            });
            return {
              date: t.publishedDate,
              target: t.adjPriceTarget > 0 ? t.adjPriceTarget : t.priceTarget,
              analyst: t.analystName,
              company: t.analystCompany,
              action: match?.action,
              rating: match?.newGrade,
              previousRating: match?.previousGrade,
            };
          }),
        },
      };
    });
    res.json(data);
  } catch (err) { next(err); }
});

// ─── /fundamentals/:symbol/peers ──────────────────────────────────────────
router.get('/:symbol/peers', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const data = await withCache(`fund:peers:${symbol}`, TTL.fundamentals, async () => {
      const peerSymbols = await fmp.getStockPeers(symbol);
      if (!peerSymbols.length) return { peers: [] };
      const quotes = await fmp.getQuoteBatch(peerSymbols);
      return {
        peers: quotes.map((q) => ({
          symbol: q.symbol,
          name: q.name,
          price: q.price,
          changePercent: q.changesPercentage,
          marketCap: q.marketCap,
          pe: q.pe,
          volume: q.volume,
        })),
      };
    });
    res.json(data);
  } catch (err) { next(err); }
});

// ─── /fundamentals/:symbol/ownership ──────────────────────────────────────
router.get('/:symbol/ownership', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const data = await withCache(`fund:ownership:${symbol}`, TTL.fundamentals, async () => {
      const holders = await fmp.getInstitutionalHolders(symbol, 10);
      return { holders };
    });
    res.json(data);
  } catch (err) { next(err); }
});

// ─── /fundamentals/:symbol/edgar ──────────────────────────────────────────
router.get('/:symbol/edgar', async (req, res, next) => {
  try {
    if (!edgar.isConfigured()) {
      res.status(503).json({ error: 'SEC EDGAR not configured — set SEC_EDGAR_USER_AGENT' });
      return;
    }
    const symbol = req.params.symbol.toUpperCase();
    const data = await withCache(`fund:edgar:${symbol}`, TTL.fundamentals, () =>
      edgar.getFundamentalsSnapshot(symbol),
    );
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
