/**
 * Dashboard summary adapters (Wave C).
 *
 * Each dashboard already has a `classify*` function in `dashboardService` that
 * returns an `IntelligenceSummary` (regime / headline / note / signals).
 * These adapters map that legacy shape onto the new typed `SummaryPayload`
 * expected by `SummarySection` + `SummaryStrip`, layering in:
 *   • a `tone` derived from the regime so the UI can colour consistently;
 *   • a `body` that prefers a data-grounded delta over the legacy `note`;
 *   • Country-region breadth (which had no classifier before).
 *
 * The aim is institutional summaries — concrete, tied to live metrics, not
 * generic AI fluff. We do not invent context that isn't in the data; if a
 * field is missing we omit it rather than fabricate.
 */
import type { SummaryPayload } from '../../components/intelligence-drawer';
import {
  classifyCommodities,
  classifyFX,
  classifySectors,
  classifyWorldEquity,
  classifyYieldCurve,
  type IntelligenceSummary,
  type DashboardQuote,
  type YieldCurveData,
  type RegimeClassification,
} from '../../services/dashboardService';

// ─── Regime → tone mapping ────────────────────────────────────────────────────

const POSITIVE_REGIMES = new Set<RegimeClassification>(['risk-on', 'bullish', 'weakening', 'steepening']);
const NEGATIVE_REGIMES = new Set<RegimeClassification>(['risk-off', 'bearish', 'strengthening', 'inverted', 'deflationary']);
const WARNING_REGIMES = new Set<RegimeClassification>(['flat', 'consolidating', 'inflationary']);

function regimeTone(regime: RegimeClassification): SummaryPayload['tone'] {
  if (POSITIVE_REGIMES.has(regime)) return 'positive';
  if (NEGATIVE_REGIMES.has(regime)) return 'negative';
  if (WARNING_REGIMES.has(regime)) return 'warning';
  return 'neutral';
}

function toPayload(summary: IntelligenceSummary, body?: string): SummaryPayload {
  return {
    headline: summary.headline,
    body: body ?? summary.note,
    signals: summary.signals,
    tone: regimeTone(summary.regime),
  };
}

// ─── World Equity ─────────────────────────────────────────────────────────────

export function worldEquitySummary(quotes: DashboardQuote[]): SummaryPayload {
  const summary = classifyWorldEquity(quotes);
  const ok = quotes.filter((q) => q.ok);
  if (!ok.length) return toPayload(summary);

  const adv = ok.filter((q) => q.changePercent > 0).length;
  const breadthPct = Math.round((adv / ok.length) * 100);
  const avg = ok.reduce((s, q) => s + q.changePercent, 0) / ok.length;

  const us = ok.filter((q) => ['SPY', 'QQQ', 'IWM', 'DIA'].includes(q.symbol));
  const usAvg = us.length ? us.reduce((s, q) => s + q.changePercent, 0) / us.length : null;
  const emAvg = (() => {
    const em = ok.filter((q) => ['EEM', 'VWO', 'FXI', 'EWZ', 'INDA'].includes(q.symbol));
    return em.length ? em.reduce((s, q) => s + q.changePercent, 0) / em.length : null;
  })();

  const body = [
    `Breadth ${breadthPct}% advancing across ${ok.length} indices · avg ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`,
    usAvg != null && emAvg != null
      ? `US ${usAvg >= 0 ? '+' : ''}${usAvg.toFixed(2)}% vs EM ${emAvg >= 0 ? '+' : ''}${emAvg.toFixed(2)}%`
      : null,
  ].filter(Boolean).join(' · ');

  return toPayload(summary, body);
}

// ─── US Sectors ───────────────────────────────────────────────────────────────

export function sectorSummary(quotes: DashboardQuote[]): SummaryPayload {
  const summary = classifySectors(quotes);
  const ok = quotes.filter((q) => q.symbol !== 'SPY' && q.ok);
  if (!ok.length) return toPayload(summary);

  const off = ok.filter((q) => ['XLK', 'XLY', 'XLC', 'XLF'].includes(q.symbol));
  const def = ok.filter((q) => ['XLU', 'XLP', 'XLV'].includes(q.symbol));
  const offAvg = off.length ? off.reduce((s, q) => s + q.changePercent, 0) / off.length : 0;
  const defAvg = def.length ? def.reduce((s, q) => s + q.changePercent, 0) / def.length : 0;
  const gap = offAvg - defAvg;

  const sorted = [...ok].sort((a, b) => b.changePercent - a.changePercent);
  const leader = sorted[0];
  const laggard = sorted[sorted.length - 1];

  const body = [
    `Offensive ${offAvg >= 0 ? '+' : ''}${offAvg.toFixed(2)}% vs defensive ${defAvg >= 0 ? '+' : ''}${defAvg.toFixed(2)}% (gap ${gap >= 0 ? '+' : ''}${gap.toFixed(2)}pts)`,
    leader && laggard ? `Leader ${leader.symbol} ${leader.changePercent >= 0 ? '+' : ''}${leader.changePercent.toFixed(2)}% · laggard ${laggard.symbol} ${laggard.changePercent.toFixed(2)}%` : null,
  ].filter(Boolean).join(' · ');

  return toPayload(summary, body);
}

// ─── Global Yields ────────────────────────────────────────────────────────────

export function yieldsSummary(data: YieldCurveData): SummaryPayload {
  const summary = classifyYieldCurve(data);
  const ten = data.points.find((p) => p.term === '10Y')?.value ?? null;
  const two = data.points.find((p) => p.term === '2Y')?.value ?? null;
  const spread = data.points.find((p) => p.term === 'Spread')?.value ?? null;
  const bei = data.points.find((p) => p.term === 'BEI5Y')?.value ?? null;

  const realRate = ten != null && bei != null ? ten - bei : null;

  const body = [
    ten != null && two != null ? `10Y ${ten.toFixed(2)}% · 2Y ${two.toFixed(2)}%` : null,
    spread != null ? `Spread ${spread >= 0 ? '+' : ''}${spread.toFixed(2)}%` : null,
    bei != null ? `5Y BEI ${bei.toFixed(2)}%` : null,
    realRate != null ? `Real 10Y ${realRate >= 0 ? '+' : ''}${realRate.toFixed(2)}%` : null,
  ].filter(Boolean).join(' · ');

  return toPayload(summary, body);
}

// ─── FX & Liquidity ───────────────────────────────────────────────────────────

export function fxSummary(quotes: DashboardQuote[]): SummaryPayload {
  const summary = classifyFX(quotes);
  const dxy = quotes.find((q) => q.symbol === 'UUP' && q.ok);
  const eurusd = quotes.find((q) => q.symbol === 'EUR/USD' && q.ok);
  const usdjpy = quotes.find((q) => q.symbol === 'USD/JPY' && q.ok);
  const g10 = quotes.filter((q) => q.ok && q.symbol !== 'UUP');
  const g10Adv = g10.filter((q) => q.changePercent > 0).length;

  const body = [
    dxy ? `DXY ${dxy.changePercent >= 0 ? '+' : ''}${dxy.changePercent.toFixed(2)}%` : null,
    eurusd ? `EUR/USD ${eurusd.changePercent >= 0 ? '+' : ''}${eurusd.changePercent.toFixed(2)}%` : null,
    usdjpy ? `USD/JPY ${usdjpy.changePercent >= 0 ? '+' : ''}${usdjpy.changePercent.toFixed(2)}%` : null,
    g10.length ? `${g10Adv}/${g10.length} G10 pairs advancing` : null,
  ].filter(Boolean).join(' · ');

  return toPayload(summary, body);
}

// ─── Commodities ──────────────────────────────────────────────────────────────

export function commoditiesSummary(quotes: DashboardQuote[]): SummaryPayload {
  const summary = classifyCommodities(quotes);
  const ok = quotes.filter((q) => q.ok);
  if (!ok.length) return toPayload(summary);

  const gold = ok.find((q) => q.symbol === 'XAU/USD');
  const wti = ok.find((q) => q.symbol === 'WTI/USD');
  const copper = ok.find((q) => q.symbol === 'HG/USD');

  // Gold/silver ratio is a classic risk gauge.
  const silver = ok.find((q) => q.symbol === 'XAG/USD');
  const goldSilverRatio = gold && silver && silver.price > 0 ? gold.price / silver.price : null;

  const body = [
    gold ? `Gold ${gold.changePercent >= 0 ? '+' : ''}${gold.changePercent.toFixed(2)}%` : null,
    wti ? `WTI ${wti.changePercent >= 0 ? '+' : ''}${wti.changePercent.toFixed(2)}%` : null,
    copper ? `Copper ${copper.changePercent >= 0 ? '+' : ''}${copper.changePercent.toFixed(2)}%` : null,
    goldSilverRatio != null ? `Gold/Silver ${goldSilverRatio.toFixed(1)}` : null,
  ].filter(Boolean).join(' · ');

  return toPayload(summary, body);
}

// ─── Countries (no legacy classifier) ─────────────────────────────────────────

export interface CountryBreadthInput {
  /** Live quotes keyed by ETF symbol. */
  liveQuotes: Array<{ symbol: string; changePercent: number; ok: boolean }>;
  /** Total country count in the database. */
  totalCountries: number;
  /** Optional region tag for each ETF symbol — used for DM/EM breadth split. */
  symbolRegion?: Record<string, 'developed' | 'emerging' | 'frontier'>;
}

export function countriesSummary(input: CountryBreadthInput): SummaryPayload {
  const ok = input.liveQuotes.filter((q) => q.ok);
  if (!ok.length) {
    return {
      headline: 'Awaiting Country Market Data',
      body: `${input.totalCountries} countries tracked · live data loading.`,
      tone: 'neutral',
    };
  }

  const adv = ok.filter((q) => q.changePercent > 0).length;
  const breadth = Math.round((adv / ok.length) * 100);
  const avg = ok.reduce((s, q) => s + q.changePercent, 0) / ok.length;

  let dmAdv = 0, dmTotal = 0, emAdv = 0, emTotal = 0;
  let dmSum = 0, emSum = 0;
  if (input.symbolRegion) {
    for (const q of ok) {
      const region = input.symbolRegion[q.symbol];
      if (region === 'developed') {
        dmTotal++;
        dmSum += q.changePercent;
        if (q.changePercent > 0) dmAdv++;
      } else if (region === 'emerging') {
        emTotal++;
        emSum += q.changePercent;
        if (q.changePercent > 0) emAdv++;
      }
    }
  }

  let tone: SummaryPayload['tone'] = 'neutral';
  if (avg > 0.4) tone = 'positive';
  else if (avg < -0.4) tone = 'negative';

  const headline = tone === 'positive'
    ? 'Global Country Markets — Broad Advance'
    : tone === 'negative'
    ? 'Global Country Markets — Broad Decline'
    : 'Global Country Markets — Mixed Leadership';

  const bodyParts = [
    `${ok.length}/${input.totalCountries} live · ${breadth}% advancing · avg ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`,
  ];
  if (dmTotal > 0 && emTotal > 0) {
    const dmAvg = dmSum / dmTotal;
    const emAvg = emSum / emTotal;
    bodyParts.push(`DM ${dmAvg >= 0 ? '+' : ''}${dmAvg.toFixed(2)}% (${dmAdv}/${dmTotal}) vs EM ${emAvg >= 0 ? '+' : ''}${emAvg.toFixed(2)}% (${emAdv}/${emTotal})`);
  }

  const signals: string[] = [];
  if (dmTotal > 0 && emTotal > 0) {
    const dmAvg = dmSum / dmTotal;
    const emAvg = emSum / emTotal;
    if (dmAvg - emAvg > 0.5) signals.push('Developed markets outperforming — risk-off rotation');
    else if (emAvg - dmAvg > 0.5) signals.push('Emerging markets outperforming — risk-on rotation');
  }
  if (breadth >= 75) signals.push('Strong breadth — broad-based participation');
  else if (breadth <= 25) signals.push('Weak breadth — narrow leadership / risk-off');

  return {
    headline,
    body: bodyParts.join(' · '),
    signals,
    tone,
  };
}
