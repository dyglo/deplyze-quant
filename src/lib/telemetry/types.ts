/**
 * Canonical V5 event taxonomy — mirrors:
 *   - cloud-run/gateway/src/lib/personalization.ts (EVENT_TYPES, EVENT_CATEGORIES)
 *   - services/quant-engine/app/bigquery/v5_schemas.py (USER_EVENTS)
 *   - docs/v5-phase1-data-flow.md
 *
 * Keep all three in sync. Adding an event requires touching the gateway zod
 * enum, the docs, and (if it qualifies as a value action) the engine's
 * VALUE_EVENT_TYPES list in sessionizer.py.
 */

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

export interface BehavioralEvent {
  event_type: EventType;
  event_category?: EventCategory;
  session_id?: string;
  entity_type?: string;
  entity_id?: string;
  artifact_id?: string;
  symbol?: string;
  portfolio_id?: string;
  placement?: string;
  channel?: 'web' | 'email' | 'push';
  duration_ms?: number;
  dwell_ms?: number;
  properties?: Record<string, unknown>;
  client_ts?: string;
  app_version?: string;
  experiment_arm?: string;
}

export interface FeedbackEvent {
  kind: 'relevance' | 'dismiss_category' | 'mute';
  artifact_id?: string;
  category?: string;
  signal?: 'less_like_this' | 'more_like_this' | 'mute' | 'unmute';
  reason?: string;
  properties?: Record<string, unknown>;
}
