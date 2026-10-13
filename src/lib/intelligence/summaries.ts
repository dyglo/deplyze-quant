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
