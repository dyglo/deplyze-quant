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
  "reasoning_focus": string             // one-line description of what to explain
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
- 2 to 4 sentences. No headings, no bullets, no markdown.
- Reference ONLY the observations you are given. Never introduce a number, ticker,
  or date that is not in the observations array.
- Tone: calm, evidence-oriented, probabilistic. No "buy/sell" language. No
  guarantees. Prefer "tended to", "historically", "during", "the rolling X-month
  correlation".
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
