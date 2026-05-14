/**
 * Naive headline-sentiment proxy. NOT an ML model — explicitly a rule-based
 * keyword scorer so the UI can label it as such. Words are normalised, scored,
 * and aggregated; ties default to neutral.
 */

const POSITIVE = new Set([
  'rally','rallies','surge','surges','jump','jumps','soar','soars','beat','beats',
  'gain','gains','strong','strength','climb','climbs','optimism','upgrade','upgrades',
  'record','outperform','outperforms','bullish','bull','recover','recovery','recovers',
  'expand','expansion','growth','breakthrough','positive','accelerate','accelerates',
]);

const NEGATIVE = new Set([
  'plunge','plunges','crash','crashes','tumble','tumbles','fall','falls','slump',
  'slumps','drop','drops','warn','warning','miss','misses','weak','weakness',
  'decline','declines','recession','downgrade','downgrades','bearish','bear','fear',
  'fears','crisis','panic','sell-off','selloff','contraction','shrink','shrinks',
  'risk','risks','volatile','volatility','default','defaults','collapse','collapses',
  'inflation','tariff','sanctions','layoffs','layoff',
]);

export type SentimentLabel = 'positive' | 'negative' | 'neutral';

export interface SentimentScore {
  label: SentimentLabel;
  /** -1 (fully negative) … +1 (fully positive). */
  score: number;
  positiveHits: number;
  negativeHits: number;
}

const TOKEN_RE = /[a-zA-Z][a-zA-Z'-]*/g;

export function scoreText(text: string): SentimentScore {
  let pos = 0, neg = 0;
  for (const m of text.toLowerCase().matchAll(TOKEN_RE)) {
    const w = m[0];
    if (POSITIVE.has(w)) pos++;
    else if (NEGATIVE.has(w)) neg++;
  }
  const total = pos + neg;
  const score = total === 0 ? 0 : (pos - neg) / total;
  let label: SentimentLabel = 'neutral';
  if (score >= 0.2) label = 'positive';
  else if (score <= -0.2) label = 'negative';
  return { label, score, positiveHits: pos, negativeHits: neg };
}

export function aggregate(items: Array<{ text: string; source: string }>): {
  counts: Record<SentimentLabel, number>;
  bySource: Record<string, Record<SentimentLabel, number>>;
  avgScore: number;
} {
  const counts: Record<SentimentLabel, number> = { positive: 0, negative: 0, neutral: 0 };
  const bySource: Record<string, Record<SentimentLabel, number>> = {};
  let scoreSum = 0;
  let scored = 0;
  for (const it of items) {
    const s = scoreText(it.text);
    counts[s.label]++;
    const bs = bySource[it.source] ??= { positive: 0, negative: 0, neutral: 0 };
    bs[s.label]++;
    if (s.positiveHits + s.negativeHits > 0) {
      scoreSum += s.score;
      scored++;
    }
  }
  return { counts, bySource, avgScore: scored ? scoreSum / scored : 0 };
}
