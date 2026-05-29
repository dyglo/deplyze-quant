/**
 * researchPlanFallback.ts — deterministic ResearchPlan builder.
 *
 * The /historical-research/plan route is LLM-backed (Gemini). When Gemini is
 * unavailable (quota, key, model error, timeout) the route must NOT 500 and
 * blank the workspace — a planner that turns a query into assets + a window is
 * a SOLVED problem without an LLM for the common case. This builder extracts
 * tickers, asset-class keywords, and an explicit/implied timeframe from the raw
 * query so the investigation can still run in a degraded (but useful) mode.
 *
 * It is intentionally pure and dependency-free so it is cheap to unit-test and
 * safe to call on the hot path. The output matches the ResearchPlan schema the
 * frontend consumes (see historicalResearchService.ts).
 */

export type ResearchIntent =
  | 'compare' | 'regime_behavior' | 'relationship'
  | 'single_asset_history' | 'anomaly_search';

export type ResearchComparison =
  | 'normalized' | 'rolling_correlation' | 'relative_strength' | 'drawdown';

export type ResearchOverlay =
  | 'inflation_regime' | 'rate_cycle' | 'recession' | 'volatility_regime';

export interface ResearchPlan {
  intent: ResearchIntent;
  assets: string[];
  benchmark: string | null;
  timeframe: { start: string | null; end: string | null; lookbackYears: number };
  comparisons: ResearchComparison[];
  overlays: ResearchOverlay[];
  reasoning_focus: string;
  regimes: { label: string; start: string; end: string; hypothesis?: string }[];
}

// Asset-class / macro keyword → liquid US proxy ticker. Mirrors the conventions
// the LLM planner is instructed to use so degraded plans stay consistent.
const KEYWORD_TICKERS: Array<[RegExp, string]> = [
  [/\bgold\b/i, 'GLD'],
  [/\b(oil|crude|wti)\b/i, 'USO'],
  // Broad US equity market. Matches the many ways users name "the stock market"
  // (incl. flow/macro phrasings like "retail inflows in the US stock market"),
  // proxied by SPY since this tool charts price history, not fund flows.
  [/\b(s&?p\s?500|spx|stock market|equity market|equit(y|ies)|stocks?|the market|wall\s?street|us\s+(stock|equit|market)|dow(\s+jones)?)\b/i, 'SPY'],
  [/\b(nasdaq|tech stocks|qqq)\b/i, 'QQQ'],
  [/\b(treasur(y|ies)|bonds?|10[\s-]?year|10y)\b/i, 'IEF'],
  [/\b(long bonds?|20[\s-]?year|tlt)\b/i, 'TLT'],
  [/\b(dollar|usd|dxy|greenback)\b/i, 'UUP'],
  [/\b(volatility|vix)\b/i, 'VIX'],
  [/\b(bitcoin|btc|crypto)\b/i, 'BTC'],
  [/\b(silver)\b/i, 'SLV'],
];

// Common English words that match the [A-Z]{1,5} ticker regex once upper-cased
// but are clearly not tickers. Keeps "GOLD VS THE MARKET" from yielding "VS"/"THE".
const STOPWORDS = new Set([
  'A', 'AN', 'AND', 'OR', 'VS', 'THE', 'OF', 'TO', 'IN', 'ON', 'AT', 'BY', 'FOR',
  'IS', 'IT', 'AS', 'BE', 'DO', 'IF', 'SO', 'US', 'WE', 'HOW', 'WHY', 'WHAT',
  'WHEN', 'DID', 'DOES', 'HAS', 'HAD', 'ETF', 'ETFS', 'PER', 'YOY', 'CAGR',
  'EPS', 'GDP', 'CPI', 'PCE', 'FED', 'QE', 'QT', 'ZIRP', 'GFC', 'COVID',
]);

function extractExplicitTickers(query: string): string[] {
  const out: string[] = [];
  // Uppercase tokens 1–5 chars that the user typed in caps — most likely tickers.
  const matches = query.match(/\b[A-Z]{1,5}\b/g) ?? [];
  for (const m of matches) {
    if (STOPWORDS.has(m)) continue;
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

function extractKeywordTickers(query: string): string[] {
  const out: string[] = [];
  for (const [re, ticker] of KEYWORD_TICKERS) {
    if (re.test(query) && !out.includes(ticker)) out.push(ticker);
  }
  return out;
}

/** Pull "between 1990 and 2010" / "from 2000 to 2020" / bare 4-digit years. */
function extractTimeframe(query: string): { start: string | null; end: string | null } {
  const years = (query.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number).sort((a, b) => a - b);
  if (years.length >= 2) {
    const lo = years[0];
    const hi = years[years.length - 1];
    if (hi > lo) return { start: `${lo}-01-01`, end: `${hi}-12-31` };
  }
  if (years.length === 1) {
    // A single year usually anchors the start ("since 2008", "after 2020").
    return { start: `${years[0]}-01-01`, end: null };
  }
  return { start: null, end: null };
}

function inferLookbackYears(query: string): number {
  if (/\bdecades?\b/i.test(query)) return 20;
  if (/\b(century|long[\s-]?run|all history|ever)\b/i.test(query)) return 30;
  if (/\b(last|past)\s+(\d{1,2})\s*years?\b/i.test(query)) {
    const m = query.match(/\b(last|past)\s+(\d{1,2})\s*years?\b/i);
    const n = m ? Number(m[2]) : NaN;
    if (Number.isFinite(n) && n >= 1 && n <= 30) return n;
  }
  return 10;
}

/**
 * Build a best-effort ResearchPlan from the raw query without an LLM.
 * Always returns a schema-valid plan; assets may be empty if nothing parses,
 * in which case the caller should surface "name a ticker" guidance.
 */
export function buildFallbackPlan(query: string): ResearchPlan {
  const q = query.trim();

  // Prefer explicitly typed tickers; fold in keyword proxies; cap at 5.
  const explicit = extractExplicitTickers(q);
  const keyword = extractKeywordTickers(q);
  const assets = Array.from(new Set([...explicit, ...keyword])).slice(0, 5);

  const { start, end } = extractTimeframe(q);
  const lookbackYears = inferLookbackYears(q);

  const multi = assets.length >= 2;
  const wantsCorrelation = /\b(correlat|relationship|move together|co[\s-]?move|hedge|diversif)/i.test(q);
  const wantsDrawdown = /\b(drawdown|crash|sell[\s-]?off|bear market|fell|drop)/i.test(q);

  let intent: ResearchIntent;
  if (wantsCorrelation) intent = 'relationship';
  else if (multi) intent = 'compare';
  else if (/\b(regime|during|inflation|recession|hiking|rate cycle)/i.test(q)) intent = 'regime_behavior';
  else intent = 'single_asset_history';

  const comparisons: ResearchComparison[] = [];
  comparisons.push('normalized');
  if (multi || wantsCorrelation) comparisons.push('rolling_correlation');
  if (wantsDrawdown) comparisons.push('drawdown');

  const overlays: ResearchOverlay[] = [];
  if (/\binflation\b/i.test(q)) overlays.push('inflation_regime');
  if (/\b(rate|hiking|fed|tightening|cuts?)\b/i.test(q)) overlays.push('rate_cycle');
  if (/\brecession\b/i.test(q)) overlays.push('recession');
  if (/\b(volatility|vix)\b/i.test(q)) overlays.push('volatility_regime');

  return {
    intent,
    assets,
    // Never auto-inject a benchmark. An investigation uses only the assets the
    // user actually named; a benchmark is set only when the query explicitly
    // asks to compare against one (the LLM planner handles that case).
    benchmark: null,
    timeframe: { start, end, lookbackYears },
    comparisons: Array.from(new Set(comparisons)),
    overlays: Array.from(new Set(overlays)),
    reasoning_focus: 'Degraded plan — derived locally from the query without the LLM planner.',
    regimes: [],
  };
}
