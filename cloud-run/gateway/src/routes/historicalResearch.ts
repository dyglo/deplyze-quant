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

const router = Router();

// ─── /plan ────────────────────────────────────────────────────────────────
// Resolve { query } -> structured ResearchPlan JSON.

const PlanBody = z.object({
  query: z.string().min(2).max(500),
});

const PLAN_SYSTEM = `
You are the Historical Research planner for an institutional quantitative research
terminal. You convert a user's natural-language question into a STRICT JSON
ResearchPlan object that downstream code can execute.

Output requirements:
- Reply with ONE JSON object only. No prose, no markdown fences, no commentary.
- All fields must be present even if empty arrays.
- Use uppercase US tickers ("SPY", "QQQ", "GLD", "TLT", "UUP" for DXY proxy, "USO" for oil,
  "IEF" for 10Y, "VIX"). Never invent tickers.

ResearchPlan schema:
{
  "intent": "compare" | "regime_behavior" | "relationship" | "single_asset_history" | "anomaly_search",
  "assets":        string[],            // 1..5 tickers, primary first
  "benchmark":     string | null,       // optional reference (e.g. "SPY")
  "timeframe": {
    "start":       "YYYY-MM-DD" | null, // null = use lookbackYears
    "end":         "YYYY-MM-DD" | null,
    "lookbackYears": number              // fallback when start/end null; 1..30
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
- ANY time assets.length >= 2 -> comparisons MUST include both "normalized" and "rolling_correlation".
- "behave" or "behavior" + multiple assets -> intent="compare", comparisons=["normalized","rolling_correlation"].
- "behave during inflation" -> overlays includes "inflation_regime".
- "correlation" / "relationship" -> intent="relationship", comparisons includes "rolling_correlation".
- Date ranges in the query ("between 1960 and 2025", "from 2000 to 2020") -> set timeframe.start and timeframe.end explicitly to "YYYY-01-01" / "YYYY-12-31".
- "decades" or wide horizon language -> lookbackYears>=20.
- If user names no horizon -> lookbackYears=10.

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

router.post('/plan', async (req, res, next) => {
  try {
    const { query } = PlanBody.parse(req.body);
    const raw = await geminiGenerate({
      systemInstruction: PLAN_SYSTEM,
      prompt: `User query: ${query}\n\nReturn the ResearchPlan JSON now.`,
      temperature: 0.1,
    });

    const plan = extractJson(raw);
    if (!plan) {
      res.status(502).json({ error: 'Planner returned unparseable output', raw });
      return;
    }
    res.json({ plan });
  } catch (err) { next(err); }
});

// ─── /reason ──────────────────────────────────────────────────────────────
// Given the plan + observed data summary, produce 2–4 sentence grounded
// reasoning. The frontend computes observations (correlations, drawdowns,
// regime tags) and passes them in — the model NEVER invents numbers.

const ReasonBody = z.object({
  query: z.string().min(2).max(500),
  plan: z.unknown(),
  observations: z.array(z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()]),
    period: z.string().optional(),
  })).max(40),
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

    const narrative = await geminiGenerate({
      systemInstruction: REASON_SYSTEM,
      prompt,
      temperature: 0.2,
    });
    res.json({ narrative });
  } catch (err) { next(err); }
});

// ─── /followup-ask ────────────────────────────────────────────────────────
// Q&A against an already-completed investigation. Grounding contract is the
// same as /reason: only the observation list may be cited.

const FollowupAskBody = z.object({
  question: z.string().min(2).max(500),
  query: z.string().min(2).max(500),
  plan: z.unknown(),
  observations: z.array(z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()]),
    period: z.string().optional(),
  })).max(80),
  priorTurns: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })).max(8).optional(),
});

const FOLLOWUP_ASK_SYSTEM = `
You answer follow-up questions about a completed historical-research investigation.

Hard rules:
- 1 to 4 sentences. No headings, no bullets, no markdown.
- You may ONLY cite numbers, tickers, dates and labels that appear in the
  observations array. If the answer requires data that isn't there, say so
  plainly: "The current investigation doesn't include <thing> — re-run with
  <suggested change> to answer that."
- Tone: institutional, evidence-oriented, probabilistic. No buy/sell language.
- If the user asks "why" about a regime-conditioned result, reference the
  macro channel the evidence is consistent with (rates, credit, dollar,
  liquidity) but never invent specifics not present in the observations.
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
      `Original question: ${body.query}`,
      `Plan: ${JSON.stringify(body.plan)}`,
      'Observations:',
      evidenceLines || '(none)',
      turns ? `\nPrior follow-ups:\n${turns}` : '',
      '',
      `New follow-up question: ${body.question}`,
      '',
      'Answer now, using only the observations above.',
    ].filter(Boolean).join('\n');

    const answer = await geminiGenerate({
      systemInstruction: FOLLOWUP_ASK_SYSTEM,
      prompt,
      temperature: 0.2,
    });
    res.json({ answer });
  } catch (err) { next(err); }
});

// ─── /followup-refine ─────────────────────────────────────────────────────
// When a follow-up needs fresh data ("now add TLT", "extend to 2000"), the
// frontend asks the planner to re-derive a ResearchPlan that combines the
// existing plan with the new ask. The frontend then re-runs the pipeline.

const FollowupRefineBody = z.object({
  question: z.string().min(2).max(500),
  query: z.string().min(2).max(500),
  plan: z.unknown(),
});

const FOLLOWUP_REFINE_SYSTEM = `
You revise an existing ResearchPlan based on a follow-up ask. Output the FULL
revised plan (same JSON schema as /plan) — not a diff. Keep anything the user
didn't change. Add or swap assets / extend the timeframe / add regimes as the
follow-up requests. Same heuristics as the initial planner apply.
`.trim();

router.post('/followup-refine', async (req, res, next) => {
  try {
    const body = FollowupRefineBody.parse(req.body);
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
      res.status(502).json({ error: 'Refiner returned unparseable output', raw });
      return;
    }
    res.json({ plan });
  } catch (err) { next(err); }
});

// ─── helpers ──────────────────────────────────────────────────────────────

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
