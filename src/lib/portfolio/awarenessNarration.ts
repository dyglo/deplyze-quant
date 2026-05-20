/**
 * Awareness narration helpers.
 *
 * Centralized so the Portfolio Awareness Workspace speaks in one consistent
 * institutional second-person voice ("Your portfolio…", "Your exposure to…").
 *
 * Hard guardrail: this module rejects any phrase that resembles a trade
 * instruction. Awareness narration is reflective — never directive.
 */

import type { CompositeRegime, RiskEnvironment } from '../../types/agents';

// ─── Forbidden-verb guard ────────────────────────────────────────────────────

/**
 * Verbs that imply a trade or position recommendation. The awareness layer
 * must never instruct the user to act — only to observe, reflect, and monitor.
 *
 * The list is intentionally narrow: it matches whole words, case-insensitive.
 * Inflections covered explicitly (buy/buying, sell/selling, etc.).
 */
const FORBIDDEN_VERBS = [
  'buy', 'buys', 'buying', 'bought',
  'sell', 'sells', 'selling', 'sold',
  'trim', 'trims', 'trimming', 'trimmed',
  'exit', 'exits', 'exiting', 'exited',
  'enter', 'entering', 'entered',
  'short', 'shorting', 'shorted',
  'long', 'longing',
  'hedge', 'hedging', 'hedged',
  'rebalance', 'rebalancing', 'rebalanced',
  'allocate', 'allocating', 'allocated',
  'reduce', 'reducing', 'reduced',
  'increase', 'increasing', 'increased',
  'target', 'targets', 'targeting',
  'stop', 'stops', 'stop-loss',
  'take-profit', 'profit-target',
  'recommend', 'recommends', 'recommended', 'recommendation',
  'suggest', 'suggests', 'suggested',
  'should', 'must', 'need to',
];

const FORBIDDEN_RE = new RegExp(
  `\\b(${FORBIDDEN_VERBS.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i',
);

export interface ForbiddenMatch {
  matched: string;
  index: number;
}

export function findForbiddenVerb(text: string): ForbiddenMatch | null {
  if (!text) return null;
  const m = FORBIDDEN_RE.exec(text);
  if (!m) return null;
  return { matched: m[1], index: m.index };
}

/** Returns the original text or throws in development when a forbidden verb is present. */
export function assertAwarenessSafe(text: string, ctx = 'awareness narration'): string {
  const hit = findForbiddenVerb(text);
  if (hit) {
    const err = new Error(
      `[awareness] forbidden verb "${hit.matched}" in ${ctx}. Awareness narration must be reflective, not directive.`,
    );
    // In production, fail soft to a neutral string rather than crash the page.
    if (typeof process !== 'undefined' && (process as { env?: { NODE_ENV?: string } }).env?.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.warn(err.message);
      return '';
    }
    throw err;
  }
  return text;
}

// ─── Second-person institutional voice helpers ───────────────────────────────

export interface AwarenessVoiceContext {
  portfolioName?: string;
  holdingsCount?: number;
  benchmarkId?: string;
}

/** "Your portfolio" / "Your <name>" — preferring the personal possessive. */
export function possessivePortfolio(ctx: AwarenessVoiceContext): string {
  return 'Your portfolio';
}

/**
 * Compose a calm institutional hero sub-narrative from the available
 * composite-regime + risk-environment context. Never directive.
 */
export function composeHeroSubNarrative(opts: {
  regime: CompositeRegime | null;
  risk: RiskEnvironment | null;
  ctx: AwarenessVoiceContext;
}): string {
  const { regime, risk, ctx } = opts;
  const segments: string[] = [];

  if (regime?.regime) {
    const label = regime.regime.replace(/-/g, ' ');
    const conf = regime.confidence != null ? ` (${Math.round((regime.confidence ?? 0) * 100)}% confidence)` : '';
    segments.push(
      `Today's regime reads as ${label}${conf}.`,
    );
  }

  if (risk?.risk_level) {
    const lvl = risk.risk_level;
    const highDomains = (risk.high_domains ?? []).slice(0, 3);
    if (highDomains.length > 0) {
      segments.push(
        `Composite risk environment is ${lvl}, with elevated readings across ${highDomains.join(', ')}.`,
      );
    } else {
      segments.push(`Composite risk environment is ${lvl}.`);
    }
  }

  if (segments.length === 0) {
    segments.push(
      `${possessivePortfolio(ctx)} is being observed against the day's prevailing regime and risk conditions.`,
    );
  } else {
    segments.unshift(
      `${possessivePortfolio(ctx)} is observed within today's macro context.`,
    );
  }

  const text = segments.join(' ');
  return assertAwarenessSafe(text, 'composeHeroSubNarrative');
}

/** A one-line headline. Reflective; never imperative. */
export function composeHeroHeadline(opts: {
  regime: CompositeRegime | null;
  risk: RiskEnvironment | null;
  ctx: AwarenessVoiceContext;
}): string {
  const { regime, risk, ctx } = opts;
  const pName = ctx.portfolioName ? `"${ctx.portfolioName}"` : 'your portfolio';

  if (risk?.risk_level === 'elevated') {
    return assertAwarenessSafe(
      `Observing ${pName} under an elevated risk environment.`,
      'composeHeroHeadline',
    );
  }
  if (regime?.regime?.includes('risk-off')) {
    return assertAwarenessSafe(
      `${pName.charAt(0).toUpperCase()}${pName.slice(1)} is sitting inside a risk-off regime.`,
      'composeHeroHeadline',
    );
  }
  if (regime?.regime === 'transition') {
    return assertAwarenessSafe(
      `${pName.charAt(0).toUpperCase()}${pName.slice(1)} is observed across a regime transition.`,
      'composeHeroHeadline',
    );
  }
  return assertAwarenessSafe(
    `Awareness view for ${pName}, synthesized against today's market context.`,
    'composeHeroHeadline',
  );
}
