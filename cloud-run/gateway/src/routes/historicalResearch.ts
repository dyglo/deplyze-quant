/**
 * /v1/historical-research — query understanding + grounded reasoning for the
 * Historical Research workspace. The frontend handles retrieval and chart
 * generation; this route is the LLM-backed brain that turns a natural-language
 * question into a structured ResearchPlan and, after retrieval, produces a
 * short evidence-grounded narrative.
 */

import { Router } from 'express';
import { z } from 'zod';
import { geminiGenerate } from '../services/gemini';
import { buildFallbackPlan } from '../lib/researchPlanFallback';
import { log, reqContext } from '../lib/logger';

const router = Router();

// ─── /plan ────────────────────────────────────────────────────────────────
// Resolve { query } -> structured ResearchPlan JSON.

const PlanBody = z.object({
  query: z.string().trim().min(2).max(4000),
});

const PLAN_SYSTEM = `
You are the Historical Research planner for an institutional quantitative research
terminal. You convert a user's natural-language question into a STRICT JSON
ResearchPlan object that downstream code can execute.

Output requirements:
- Reply with ONE JSON object only. No prose, no markdown fences, no commentary.
- All fields must be present even if empty arrays.
- Use uppercase US tickers ("SPY", "QQQ", "GLD", "TLT", "UUP" for DXY proxy, "USO" for oil,
  "IEF" for 10Y, "VIX") OR supported macro series IDs ("INFLATION", "GDP", "CPI",
  "FEDFUNDS", "UNRATE", "DGS10", "DGS2", "T10Y2Y"). Never invent tickers or macro IDs.

ResearchPlan schema:
{
  "intent": "compare" | "regime_behavior" | "relationship" | "single_asset_history" | "anomaly_search",
  "assets":        string[],            // 1..8 tickers or macro IDs, primary first
  "benchmark":     string | null,       // null unless the user EXPLICITLY asks to compare against a reference
  "timeframe": {
    "start":       "YYYY-MM-DD" | null, // null = use lookbackYears
    "end":         "YYYY-MM-DD" | null,
    "lookbackYears": number              // fallback when start/end null; 1..50
  },
  "comparisons":   ("normalized" | "rolling_correlation" | "relative_strength" | "drawdown")[],
  "overlays":      ("inflation_regime" | "rate_cycle" | "recession" | "volatility_regime")[],
  "reasoning_focus": string,            // one-line description of what to explain
  "regimes": [                          // 0..6 named windows the question targets
    {
      "label":       string,            // e.g. "2015–2018 gradual hikes"
      "start":       "YYYY-MM-DD",
      "end":         "YYYY-MM-DD",
      "hypothesis":  string             // one-line driver, e.g. "Fed lift-off cycle"
    }
  ]
}

Heuristics:
- "compare A and B" -> intent="compare", assets=[A,B], comparisons includes "normalized".
- "inflation", "CPI", "consumer prices" -> use "INFLATION" unless the user explicitly asks for CPI level.
- "GDP", "real GDP", "economic growth" -> use "GDP".
- Macro-only questions should use macro series IDs directly, not ETF proxies.
- ANY time assets.length >= 2 -> comparisons MUST include both "normalized" and "rolling_correlation".
- "behave" or "behavior" + multiple assets -> intent="compare", comparisons=["normalized","rolling_correlation"].
- "behave during inflation" -> overlays includes "inflation_regime".
- "correlation" / "relationship" -> intent="relationship", comparisons includes "rolling_correlation".
- Date ranges in the query ("between 1960 and 2025", "from 2000 to 2020") -> set timeframe.start and timeframe.end explicitly to "YYYY-01-01" / "YYYY-12-31".
- "decades" or wide horizon language -> lookbackYears>=20; "5 decades" -> lookbackYears=50.
- If user names no horizon -> lookbackYears=10.
- benchmark: set ONLY when the user explicitly asks to compare/benchmark against a specific reference
  (e.g. "relative to the S&P 500", "benchmarked against QQQ", "vs the market"). Otherwise benchmark=null.
  NEVER default to SPY or add a benchmark the user did not ask for — the investigation must use only the
  assets the user named.

Regime extraction (CRITICAL — most institutional questions name specific windows):
- A "regime" is a labeled sub-window the user wants the analysis sliced into. Examples:
    "2015–2018, 2022–2023"           -> two regimes: 2015-01-01..2018-12-31 and 2022-01-01..2023-12-31.
    "during COVID"                    -> one regime: 2020-02-01..2020-04-30 ("COVID crash").
    "ZIRP era"                        -> 2008-12-16..2015-12-15.
    "post-GFC recovery"               -> 2009-03-01..2013-12-31.
    "Volcker era"                     -> 1979-08-01..1987-08-01.
    "dot-com bust"                    -> 2000-03-01..2002-10-31.
    "Trump trade-war"                 -> 2018-03-01..2019-12-31.
    "Ukraine war"                     -> 2022-02-24..(end of timeframe or today).
    "rising rates" (no dates)         -> infer from named horizon (e.g. 2022-03-01..2023-07-31 for the most recent hiking cycle).
- Each regime: set start/end as concrete "YYYY-MM-DD" dates. Set a short human label and a one-line hypothesis explaining the driver.
- ALWAYS expand the outer timeframe.start/end to cover ALL regimes (start <= earliest regime start, end >= latest regime end).
- If the user names no specific regime, return regimes: [] — do NOT invent one.
- Cap at 6 regimes.

Provider note (do NOT include in output, just use it to set timeframe):
- US ETF history typically only extends ~20 years (GLD: 2004, UUP: 2007, TLT: 2002). If the user
  requests a longer window, still set the requested start/end honestly — downstream code will
  clamp and surface a data-window note. Do not invent shorter ranges to "fix" availability.
`.trim();

router.post('/plan', async (req, res) => {
  // Validate first. Natural-language research prompts can be long, but a bad
  // body should still be a clear 400 instead of falling into the global 500.
  const parsed = PlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Bad Request',
      code: 'VALIDATION_ERROR',
      issues: parsed.error.issues,
    });
    return;
  }
  const { query } = parsed.data;

  const t0 = Date.now();
  try {
    const raw = await geminiGenerate({
      systemInstruction: PLAN_SYSTEM,
      prompt: `User query: ${query}\n\nReturn the ResearchPlan JSON now.`,
      temperature: 0.1,
    });

    const plan = extractJson(raw);
    const llmAssets = planAssets(plan);

    if (!plan || llmAssets.length === 0) {
      // Either the model replied with unparseable JSON, or it parsed but
      // resolved no tradeable assets (common for flow/macro phrasings like
      // "retail inflows in the US stock market"). Rather than 502 / dead-end the
      // investigation, backfill assets from the deterministic keyword planner.
      const fallback = safeFallbackPlan(query);
      const reason = !plan ? 'planner_unparseable' : 'planner_no_assets';
      // If the LLM produced a usable plan body, keep its structure and only
      // graft the resolved assets onto it; otherwise use the fallback wholesale.
      const repaired = (plan && typeof plan === 'object' && fallback.assets.length > 0)
        ? { ...(plan as Record<string, unknown>), assets: fallback.assets, benchmark: (plan as Record<string, unknown>).benchmark ?? null }
        : fallback;
      log.warn({
        event: 'historical_research.plan.degraded', ...reqContext(req),
        freshness: 'degraded', reason, assets: fallback.assets, latencyMs: Date.now() - t0,
      });
      res.json({ plan: repaired, degraded: true, source: 'fallback', reason });
      return;
    }

    log.info({
      event: 'historical_research.plan.ok', ...reqContext(req),
      servedBy: 'gemini', freshness: 'live', latencyMs: Date.now() - t0,
    });
    res.json({ plan, degraded: false, source: 'llm' });
  } catch (err) {
    // Gemini unavailable (quota / key / model error / timeout). Degrade to the
    // deterministic planner so the workspace stays usable instead of 500ing.
    const reason = err instanceof Error ? err.message : String(err);
    const fallback = safeFallbackPlan(query);
    log.warn({
      event: 'historical_research.plan.degraded', ...reqContext(req),
      freshness: 'degraded', reason, assets: fallback.assets, latencyMs: Date.now() - t0,
    });
    res.json({ plan: fallback, degraded: true, source: 'fallback', reason: 'planner_unavailable' });
  }
});

// ─── /reason ──────────────────────────────────────────────────────────────
// Given the plan + observed data summary, produce 2–4 sentence grounded
// reasoning. The frontend computes observations (correlations, drawdowns,
// regime tags) and passes them in — the model NEVER invents numbers.

const ReasonBody = z.object({
  query: z.string().min(2).max(4000),
  plan: z.unknown(),
  observations: z.array(z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()]),
    period: z.string().optional(),
  })).max(300),
});

const REASON_SYSTEM = `
You produce a short institutional commentary on retrieved historical evidence.

Hard rules:
- 3 to 6 sentences. No headings, no bullets, no markdown.
- Reference ONLY the observations you are given. Never introduce a number, ticker,
  or date that is not in the observations array.
- Tone: calm, evidence-oriented, probabilistic. No "buy/sell" language. No
  guarantees. Prefer "tended to", "historically", "during", "the rolling X-month
  correlation".
- If the observations include per-regime rows (labels containing "[<regime label>]"),
  you MUST address each named regime explicitly and compare them. Lead with the
  regime-by-regime story; only then summarise the full window.
- When regimes correspond to macro drivers (rate cycles, recessions, crises),
  briefly name the channel the evidence is consistent with (e.g. higher discount
  rates compressing growth-equity multiples, net interest margin vs credit
  stress for banks, dollar / real-rate channel for gold). Stay grounded — every
  number you cite must appear in the observations.
- If observations are too sparse to interpret, say so plainly in one sentence.
`.trim();

router.post('/reason', async (req, res, next) => {
  try {
    const body = ReasonBody.parse(req.body);
    const evidenceLines = body.observations.map((o) =>
      `- ${o.label}: ${o.value}${o.period ? ` [${o.period}]` : ''}`,
    ).join('\n');

    const prompt = [
      `User question: ${body.query}`,
      `Plan: ${JSON.stringify(body.plan)}`,
      'Observations:',
      evidenceLines || '(none)',
      '',
      'Write the commentary now.',
    ].join('\n');

    let narrative: string;
    try {
      narrative = await geminiGenerate({ systemInstruction: REASON_SYSTEM, prompt, temperature: 0.2 });
      res.json({ narrative, degraded: false });
    } catch (e) {
      // Numbers come from the frontend, not the model — so a reasoning outage
      // is non-fatal. Return a neutral, grounded note instead of a 500.
      const reason = e instanceof Error ? e.message : String(e);
      log.warn({ event: 'historical_research.reason.degraded', ...reqContext(req), freshness: 'degraded', reason });
      res.json({
        narrative: 'Automated commentary is temporarily unavailable. The computed metrics below are accurate — review the observations directly.',
        degraded: true,
      });
    }
  } catch (err) { next(err); }
});

// ─── /followup-ask ────────────────────────────────────────────────────────
// Q&A against an already-completed investigation. Grounding contract is the
// same as /reason: only the observation list may be cited.

const FollowupAskBody = z.object({
  question: z.string().min(2).max(4000),
  query: z.string().min(2).max(4000),
  plan: z.unknown(),
  observations: z.array(z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()]),
    period: z.string().optional(),
  })).max(300),
  narrative: z.string().max(8000).optional(),
  priorTurns: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })).max(8).optional(),
});

const FOLLOWUP_ASK_SYSTEM = `
You are an institutional research analyst answering follow-up questions about a completed quantitative investigation.

Rules:
- Answer in 2 to 5 sentences. No headings, no bullets, no markdown formatting.
- Use the observations and prior analysis as your primary evidence. Cite specific numbers, dates, and tickers that appear in them.
- If the question touches something not directly in the data, reason from what IS available — magnitude, timing, asset class behavior, macro context — and clearly flag it as an inference ("this is consistent with…", "the data suggests…").
- Never refuse to answer. Always give the most useful response possible given the evidence at hand.
- Tone: institutional, evidence-oriented, probabilistic. No buy/sell recommendations.
- For "why" questions, reason from macro channels consistent with the evidence (rates, credit, dollar, liquidity, risk sentiment) without inventing facts.
`.trim();

router.post('/followup-ask', async (req, res, next) => {
  try {
    const body = FollowupAskBody.parse(req.body);
    const evidenceLines = body.observations.map((o) =>
      `- ${o.label}: ${o.value}${o.period ? ` [${o.period}]` : ''}`,
    ).join('\n');
    const turns = (body.priorTurns ?? [])
      .map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`)
      .join('\n\n');

    const prompt = [
      `Original research question: ${body.query}`,
      `Research plan: ${JSON.stringify(body.plan)}`,
      body.narrative ? `Prior analysis:\n${body.narrative}` : '',
      'Observations (metrics computed for this investigation):',
      evidenceLines || '(none)',
      turns ? `Prior follow-ups:\n${turns}` : '',
      `New follow-up question: ${body.question}`,
      'Answer directly and substantively, grounded in the observations and prior analysis above.',
    ].filter(Boolean).join('\n\n');

    try {
      const answer = await geminiGenerate({ systemInstruction: FOLLOWUP_ASK_SYSTEM, prompt, temperature: 0.3 });
      res.json({ answer, degraded: false });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      log.warn({ event: 'historical_research.followup_ask.degraded', ...reqContext(req), freshness: 'degraded', reason });
      res.json({
        answer: 'The research assistant is temporarily unavailable. The investigation metrics remain accurate — try your follow-up again shortly.',
        degraded: true,
      });
    }
  } catch (err) { next(err); }
});

// ─── /followup-refine ─────────────────────────────────────────────────────
// When a follow-up needs fresh data ("now add TLT", "extend to 2000"), the
// frontend asks the planner to re-derive a ResearchPlan that combines the
// existing plan with the new ask. The frontend then re-runs the pipeline.

const FollowupRefineBody = z.object({
  question: z.string().min(2).max(4000),
  query: z.string().min(2).max(4000),
  plan: z.unknown(),
});

const FOLLOWUP_REFINE_SYSTEM = `
You revise an existing ResearchPlan based on a follow-up ask. Output the FULL
revised plan (same JSON schema as /plan) — not a diff. Keep anything the user
didn't change. Add or swap assets / extend the timeframe / add regimes as the
follow-up requests. Same heuristics as the initial planner apply.
`.trim();

router.post('/followup-refine', async (req, res, next) => {
  let body: z.infer<typeof FollowupRefineBody>;
  try {
    body = FollowupRefineBody.parse(req.body);
  } catch (err) { next(err); return; }

  // Degraded refiner: keep the existing plan and fold in any assets the
  // follow-up names. Never invent regimes. Used whenever the LLM path fails.
  const degradedRefine = () => {
    const prior = (body.plan ?? {}) as Partial<ReturnType<typeof buildFallbackPlan>>;
    const fromQuestion = buildFallbackPlan(body.question);
    const assets = Array.from(new Set([...(prior.assets ?? []), ...fromQuestion.assets])).slice(0, 5);
    return {
      ...buildFallbackPlan(body.query),
      ...prior,
      assets: assets.length ? assets : fromQuestion.assets,
      reasoning_focus: 'Degraded refine — merged locally without the LLM planner.',
    };
  };

  try {
    const raw = await geminiGenerate({
      systemInstruction: `${PLAN_SYSTEM}\n\n${FOLLOWUP_REFINE_SYSTEM}`,
      prompt: [
        `Original question: ${body.query}`,
        `Existing plan: ${JSON.stringify(body.plan)}`,
        `Follow-up ask: ${body.question}`,
        '',
        'Return the revised ResearchPlan JSON now.',
      ].join('\n'),
      temperature: 0.1,
    });
    const plan = extractJson(raw);
    if (!plan) {
      log.warn({ event: 'historical_research.refine.unparseable', ...reqContext(req), freshness: 'degraded', reason: 'refiner returned unparseable output' });
      res.json({ plan: degradedRefine(), degraded: true, source: 'fallback', reason: 'refiner_unparseable' });
      return;
    }
    res.json({ plan, degraded: false, source: 'llm' });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.warn({ event: 'historical_research.refine.degraded', ...reqContext(req), freshness: 'degraded', reason });
    res.json({ plan: degradedRefine(), degraded: true, source: 'fallback', reason: 'refiner_unavailable' });
  }
});

// ─── helpers ──────────────────────────────────────────────────────────────

/** Safely read a non-empty assets array off an untyped LLM plan object. */
function planAssets(plan: unknown): string[] {
  if (!plan || typeof plan !== 'object') return [];
  const a = (plan as Record<string, unknown>).assets;
  if (!Array.isArray(a)) return [];
  return a.map(normalizeAssetId).filter(Boolean);
}

function normalizeAssetId(raw: unknown): string {
  const s = String(raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    REAL_GDP: 'GDP',
    REALGDP: 'GDP',
    GDPC1: 'GDP',
    GDP_GROWTH: 'GDP',
    INFLATION_RATE: 'INFLATION',
    CPI_YOY: 'INFLATION',
    CPIAUCSL: 'CPI',
    UNEMPLOYMENT: 'UNRATE',
    UNEMPLOYMENT_RATE: 'UNRATE',
    FEDERAL_FUNDS_RATE: 'FEDFUNDS',
    FED_FUNDS_RATE: 'FEDFUNDS',
    FFR: 'FEDFUNDS',
    FEDFUNDSRATE: 'FEDFUNDS',
    US_DOLLAR: 'UUP',
    DXY: 'UUP',
    USD: 'UUP',
    LONG_TERM_TREASURIES: 'TLT',
    LONG_TERM_TREASURY: 'TLT',
    LONG_TREASURIES: 'TLT',
    LONG_BONDS: 'TLT',
    TREASURY_BONDS: 'TLT',
    OIL: 'USO',
    WTI: 'USO',
    GOLD: 'GLD',
  };
  return aliases[s] ?? s;
}

function safeFallbackPlan(query: string): ReturnType<typeof buildFallbackPlan> {
  try {
    return buildFallbackPlan(query);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.error({
      event: 'historical_research.plan.fallback_failed',
      freshness: 'degraded',
      reason,
    });
    return {
      intent: 'single_asset_history',
      assets: [],
      benchmark: null,
      timeframe: { start: null, end: null, lookbackYears: 10 },
      comparisons: ['normalized'],
      overlays: [],
      reasoning_focus: 'Planner fallback failed; ask for one or more concrete assets, ETFs, or macro indicators.',
      regimes: [],
    };
  }
}

function extractJson(s: string): unknown | null {
  const trimmed = s.trim();
  // Strip ```json fences if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : trimmed;
  try { return JSON.parse(candidate); } catch { /* fall through */ }
  // Last-ditch: first { ... last }
  const a = candidate.indexOf('{');
  const b = candidate.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(candidate.slice(a, b + 1)); } catch { return null; }
  }
  return null;
}

export default router;
