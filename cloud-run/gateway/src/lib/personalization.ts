/**
 * personalization.ts — gateway-side V5 primitives.
 *
 * Mirrors `services/quant-engine/app/personalization/identity.py` so the
 * gateway and the engine produce the same `user_id_hash` for the same UID.
 * If you change one side, change the other.
 */

import * as crypto from 'node:crypto';

// ─── Pseudonymization ─────────────────────────────────────────────────────────

const DEV_PLACEHOLDER_SALT = 'dev-only-placeholder-salt';

function getSalt(): string {
  const salt = process.env.PERSONALIZATION_USER_ID_SALT ?? '';
  if (salt) return salt;
  // In production an empty salt is unsafe — the ingest route refuses to write.
  // In development we use a deterministic placeholder so local tests stay
  // reproducible and the hash matches the engine's dev behavior.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'PERSONALIZATION_USER_ID_SALT is required in production. Configure via Secret Manager.',
    );
  }
  return DEV_PLACEHOLDER_SALT;
}

export function hashUserId(uid: string): string {
  if (!uid) throw new Error('hashUserId requires a non-empty uid');
  if (process.env.PSEUDONYMIZE_USER_IDS === 'false') {
    throw new Error(
      'PSEUDONYMIZE_USER_IDS=false is not permitted. Raw Firebase UIDs must not enter BigQuery.',
    );
  }
  const salt = getSalt();
  return crypto.createHash('sha256').update(`${uid}|${salt}`, 'utf8').digest('hex');
}

export function isPersonalizationEnabled(): boolean {
  return process.env.PERSONALIZATION_ENABLED === 'true';
}

// ─── Event taxonomy ───────────────────────────────────────────────────────────
// Keep in sync with docs/v5-phase1-data-flow.md.

export const EVENT_TYPES = [
  'impression',
  'open',
  'expand',
  'save',
  'dismiss',
  'pin',
  'share',
  'export',
  'scenario_run',
  'copilot_query',
  'copilot_followup',
  'briefing_open',
  'briefing_section_open',
  'alert_open',
  'alert_dismiss',
  'watchlist_add',
  'watchlist_remove',
  'portfolio_view',
  'portfolio_holding_open',
  'investigation_create',
  'investigation_update',
  'investigation_close',
  'investigation_pin',
  'feedback_relevance',
  'feedback_dismiss_category',
  'feedback_mute',
  'session_start',
  'session_end',
  'page_view',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_CATEGORIES = [
  'briefing',
  'feed',
  'alert',
  'copilot',
  'portfolio',
  'watchlist',
  'investigation',
  'research_library',
  'macro',
  'instrument',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

// Event types that always qualify as value actions, regardless of what the
// client claims in `value_action`. The server is the source of truth.
const ALWAYS_VALUE: ReadonlySet<EventType> = new Set([
  'expand',
  'save',
  'export',
  'scenario_run',
  'copilot_followup',
  'investigation_create',
  'investigation_update',
  'investigation_pin',
]);

const NEVER_VALUE: ReadonlySet<EventType> = new Set([
  'impression',
  'session_start',
  'session_end',
  'page_view',
]);

/** Server-side classifier. The client's claim is ignored. */
export function isValueAction(eventType: EventType): boolean {
  if (NEVER_VALUE.has(eventType)) return false;
  return ALWAYS_VALUE.has(eventType);
}

// ─── User agent class (no raw UA string captured) ────────────────────────────

export function uaClass(userAgent: string | undefined): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|iphone|android(?!.*tablet)/.test(ua)) return 'mobile';
  return 'desktop';
}
