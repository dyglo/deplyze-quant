/**
 * Contextual historical analog engine (V3 Phase 2 · Wave J).
 *
 * Extends the price-structure analog engine in `./analog.ts` with macro and
 * narrative context, so similarity reflects not just the *shape* of past
 * returns but the *environment* in which they occurred.
 *
 * The price-based analog engine answers:
 *   "What past windows had a similar vol/momentum/skew fingerprint?"
 *
 * This module answers a stricter question:
 *   "What past windows had a similar fingerprint *under similar macro/
 *    narrative conditions* — same liquidity regime, comparable inflation
 *    state, overlapping dominant themes?"
 *
 * Strict-data policy: a window without `MacroSnapshot` or with an unknown
 * regime label is *not* discarded; we degrade gracefully by falling back to
 * pure-structure similarity. Engines must surface that fallback in
 * `ContextualMatch.fallback` so the UI can flag it.
 */

import type { AnalogMatch } from './analog';

export type LiquidityRegime = 'expanding' | 'neutral' | 'contracting' | 'stressed';
export type InflationRegime = 'disinflating' | 'stable' | 'sticky' | 'accelerating' | 'deflationary';
export type GrowthRegime = 'expansion' | 'recovery' | 'slowdown' | 'contraction';

/** Macro state attached to a historical window. */
export interface MacroSnapshot {
  liquidity?: LiquidityRegime;
  inflation?: InflationRegime;
  growth?: GrowthRegime;
  /** Composite rates state — combines hike/cut bias with curve shape. */
  rates?: string;          // e.g. "hiking/inverted", "cutting/normal"
  /** Currently active narrative theme IDs (`THM_*` from ontology.py). */
  themes?: string[];
}

/** Score weights for the blended similarity. Sum should be 1.0 (we don't
 *  normalise — callers can tune to taste). Defaults skew structural so
 *  the engine doesn't regress vs. pure-price analogs when macro is sparse. */
export interface ContextWeights {
  structure: number;   // similarity from analog.ts
  macro: number;       // regime-vector cosine
  narrative: number;   // Jaccard over theme sets
}

export const DEFAULT_WEIGHTS: ContextWeights = {
  structure: 0.55,
  macro: 0.30,
  narrative: 0.15,
};

export interface ContextualMatch extends AnalogMatch {
  contextualSimilarity: number;   // 0..1, blended score
  componentScores: {
    structure: number;
    macro: number | null;
    narrative: number | null;
  };
  /** True when context inputs were too sparse to score; falls back to
   *  structure-only. Surface this in UI so users don't over-trust the match. */
  fallback: boolean;
}

/** Encode a regime tuple as a one-hot vector. Unknown labels become zero. */
function encodeRegime(snap: MacroSnapshot): number[] {
  const liquidity: LiquidityRegime[] = ['expanding', 'neutral', 'contracting', 'stressed'];
  const inflation: InflationRegime[] = ['disinflating', 'stable', 'sticky', 'accelerating', 'deflationary'];
  const growth: GrowthRegime[] = ['expansion', 'recovery', 'slowdown', 'contraction'];

  const vec: number[] = [];
  for (const r of liquidity) vec.push(snap.liquidity === r ? 1 : 0);
  for (const r of inflation) vec.push(snap.inflation === r ? 1 : 0);
  for (const r of growth) vec.push(snap.growth === r ? 1 : 0);
  // rates: include hike/cut bias and curve shape as soft features
  const rates = (snap.rates ?? '').toLowerCase();
  vec.push(rates.includes('hiking') ? 1 : 0);
  vec.push(rates.includes('cutting') ? 1 : 0);
  vec.push(rates.includes('restrictive') ? 1 : 0);
  vec.push(rates.includes('inverted') ? 1 : 0);
  vec.push(rates.includes('flat') ? 1 : 0);
  vec.push(rates.includes('normal') ? 1 : 0);
  return vec;
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

function jaccard(a: string[] | undefined, b: string[] | undefined): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const uni = sa.size + sb.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

function hasMacro(snap: MacroSnapshot | undefined): boolean {
  return !!snap && !!(snap.liquidity || snap.inflation || snap.growth || snap.rates);
}

function hasThemes(snap: MacroSnapshot | undefined): boolean {
  return !!snap?.themes && snap.themes.length > 0;
}

/**
 * Re-score price-based analog matches against a `nowSnap` of the current
 * macro/narrative state. Each match must carry a `historicalSnap` (the macro
 * state at the time of that historical window) — if missing we degrade to
 * structure-only and mark `fallback: true`.
 */
export function scoreContextualMatches(
  matches: AnalogMatch[],
  nowSnap: MacroSnapshot,
  historicalSnaps: Record<string, MacroSnapshot>,
  weights: ContextWeights = DEFAULT_WEIGHTS,
): ContextualMatch[] {
  const out: ContextualMatch[] = [];
  const haveMacroNow = hasMacro(nowSnap);
  const haveThemesNow = hasThemes(nowSnap);
  const nowVec = haveMacroNow ? encodeRegime(nowSnap) : null;

  for (const m of matches) {
    const snap = historicalSnaps[m.label];
    const haveMacroHist = hasMacro(snap);
    const haveThemesHist = hasThemes(snap);

    let macroScore: number | null = null;
    let narrativeScore: number | null = null;
    let fallback = false;

    if (haveMacroNow && haveMacroHist && nowVec) {
      macroScore = cosine(nowVec, encodeRegime(snap!));
    } else {
      fallback = true;
    }
    if (haveThemesNow && haveThemesHist) {
      narrativeScore = jaccard(nowSnap.themes, snap!.themes);
    } else {
      // narrative sparse is common — only treat as fallback if both are missing
      if (!haveThemesNow && !haveThemesHist) {
        // no narrative weight contribution — silent
      } else {
        fallback = fallback || false;
      }
    }

    const wSum =
      weights.structure +
      (macroScore !== null ? weights.macro : 0) +
      (narrativeScore !== null ? weights.narrative : 0);

    const blended =
      (weights.structure * m.similarity +
        (macroScore !== null ? weights.macro * macroScore : 0) +
        (narrativeScore !== null ? weights.narrative * narrativeScore : 0)) /
      (wSum || 1);

    out.push({
      ...m,
      contextualSimilarity: clamp(blended, 0, 1),
      componentScores: {
        structure: m.similarity,
        macro: macroScore,
        narrative: narrativeScore,
      },
      fallback,
    });
  }

  return out.sort((a, b) => b.contextualSimilarity - a.contextualSimilarity);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
