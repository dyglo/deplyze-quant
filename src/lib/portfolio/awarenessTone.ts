/**
 * Awareness tone — derives a per-user narration shape from the V5
 * personalization profile and applies it to narrative line arrays.
 *
 * Two axes:
 *
 *   depth    — how many sentences the narrative should emit per section.
 *               'concise'  → first emphasis line only (1).
 *               'standard' → up to 2 lines.
 *               'deep'     → up to 3 lines (the natural narrate*() output).
 *
 *   posture  — preferred framing when the data is ambiguous.
 *               'defensive' → keep risk / drawdown / concentration lines first.
 *               'neutral'   → preserve narrate*() ordering.
 *               'aggressive'→ keep momentum / contribution lines first.
 *
 * Resolution order for the depth axis:
 *   1. `?awareness_depth=concise|standard|deep` URL param (persists to LS).
 *   2. localStorage `deplyze.awareness.depth`.
 *   3. profile.preferred_depth ("summary"|"deep") → concise/deep.
 *   4. Default: 'standard'.
 *
 * Posture comes from profile.risk_posture
 *   ("defensive"|"balanced"|"aggressive") → defensive/neutral/aggressive.
 *
 * Tone is reflective polish: it never changes which numbers are shown,
 * only which sentences accompany them. Forbidden-verb guard still
 * applies downstream.
 */

import type { UserProfile } from '../../services/personalizationService';

export type AwarenessDepth = 'concise' | 'standard' | 'deep';
export type AwarenessPosture = 'defensive' | 'neutral' | 'aggressive';

export interface AwarenessTone {
  depth: AwarenessDepth;
  posture: AwarenessPosture;
}

export const DEFAULT_TONE: AwarenessTone = { depth: 'standard', posture: 'neutral' };

const LS_DEPTH_KEY = 'deplyze.awareness.depth';

function readDepthOverride(): AwarenessDepth | null {
  if (typeof window === 'undefined') return null;
  try {
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get('awareness_depth');
    if (v === 'concise' || v === 'standard' || v === 'deep') {
      try { window.localStorage.setItem(LS_DEPTH_KEY, v); } catch { /* ignore */ }
      return v;
    }
    const ls = window.localStorage.getItem(LS_DEPTH_KEY);
    if (ls === 'concise' || ls === 'standard' || ls === 'deep') return ls;
  } catch { /* ignore */ }
  return null;
}

function depthFromProfile(profile: UserProfile | null | undefined): AwarenessDepth | null {
  const p = profile?.preferred_depth;
  if (!p) return null;
  const v = String(p).toLowerCase();
  if (v === 'summary' || v === 'brief' || v === 'concise') return 'concise';
  if (v === 'deep' || v === 'detailed' || v === 'verbose') return 'deep';
  if (v === 'standard' || v === 'medium') return 'standard';
  return null;
}

function postureFromProfile(profile: UserProfile | null | undefined): AwarenessPosture {
  const p = profile?.risk_posture;
  if (!p) return 'neutral';
  const v = String(p).toLowerCase();
  if (v === 'defensive' || v === 'conservative' || v === 'cautious') return 'defensive';
  if (v === 'aggressive' || v === 'opportunistic' || v === 'growth')  return 'aggressive';
  return 'neutral';
}

/**
 * Derive the effective tone. URL/localStorage override beats profile.
 * Stable result for the same input — safe to memoise.
 */
export function deriveTone(profile: UserProfile | null | undefined): AwarenessTone {
  const override = readDepthOverride();
  return {
    depth: override ?? depthFromProfile(profile) ?? DEFAULT_TONE.depth,
    posture: postureFromProfile(profile),
  };
}

/** Compact line shape — matches SectionNarrative + sectionNarratives output. */
export interface ToneLine { emphasis?: boolean; text: string }

function asLineArray(input: Array<string | ToneLine>): ToneLine[] {
  return input.map(l => (typeof l === 'string' ? { text: l } : l));
}

/**
 * Apply depth + posture to a narrative line array.
 *
 * Depth gates the visible count (1 / 2 / 3). Posture only reorders the
 * tail when both a risk-flavoured and a momentum-flavoured line are
 * present — it never injects or rewrites text.
 */
export function applyTone(
  input: Array<string | ToneLine>,
  tone: AwarenessTone,
): ToneLine[] {
  const lines = asLineArray(input);
  if (lines.length === 0) return lines;

  // Posture reorder — only beyond the first (emphasis-carrying) line.
  if (tone.posture !== 'neutral' && lines.length > 2) {
    const head = lines[0];
    const tail = lines.slice(1);
    const score = (t: string): number => {
      const s = t.toLowerCase();
      const riskHit     = /(drawdown|volatility|concentrat|stress|risk|hhi|sector)/.test(s);
      const momentumHit = /(contribut|gain|led|ahead|breadth|positive|momentum)/.test(s);
      if (tone.posture === 'defensive')   return (riskHit ? -1 : 0) + (momentumHit ? 1 : 0);
      if (tone.posture === 'aggressive')  return (momentumHit ? -1 : 0) + (riskHit ? 1 : 0);
      return 0;
    };
    tail.sort((a, b) => score(a.text) - score(b.text));
    lines.splice(0, lines.length, head, ...tail);
  }

  const cap = tone.depth === 'concise' ? 1 : tone.depth === 'standard' ? 2 : 3;
  return lines.slice(0, cap);
}
