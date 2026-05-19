/**
 * V5 Telemetry — small fire-and-forget event logger.
 *
 * Design:
 *   - Events are queued in memory and flushed in batches (≤50) to the
 *     gateway POST /v1/personalization/events route every FLUSH_INTERVAL_MS
 *     or whenever the queue reaches BATCH_SIZE.
 *   - On `visibilitychange=hidden` we flush immediately via fetch keepalive
 *     so the user closing the tab does not drop the tail of the session.
 *   - Logger never throws. Telemetry must not break product code.
 *   - Feature-flagged via TELEMETRY_ENABLED (env or runtime). When off the
 *     functions are no-ops — safe to leave call sites in place during
 *     rollout.
 *
 * Public API:
 *   logEvent(event)       — queue one behavioral event
 *   logImpression(...)    — convenience for the most common case
 *   logFeedback(payload)  — explicit feedback (relevance / mute)
 *   flush()               — force a flush; awaited by signOut handlers
 */

import { gatewayBeacon } from '../../services/gatewayClient';
import { getSessionId } from './sessionId';
import type { BehavioralEvent, EventType, EventCategory, FeedbackEvent } from './types';

const BATCH_SIZE = 25;
const FLUSH_INTERVAL_MS = 5_000;

let queue: BehavioralEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let isEnabled = true;

function appVersion(): string | undefined {
  // Vite injects __APP_VERSION__ at build time when configured. We don't
  // assume it does — undefined is acceptable.
  // @ts-expect-error - optional global
  return (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined) as string | undefined;
}

function scheduleFlush(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

async function postBatch(events: BehavioralEvent[]): Promise<void> {
  if (events.length === 0) return;
  await gatewayBeacon('/personalization/events', { events });
}

/** Force a flush. Safe to call frequently — no-op when queue empty. */
export async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, BATCH_SIZE);
  await postBatch(batch);
  if (queue.length > 0) scheduleFlush();
}

function ensureLifecycleHooks(): void {
  if (started) return;
  started = true;
  if (typeof document !== 'undefined' && 'addEventListener' in document) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        void flush();
      }
    });
  }
  if (typeof window !== 'undefined' && 'addEventListener' in window) {
    window.addEventListener('beforeunload', () => {
      void flush();
    });
  }
}

/** Enable/disable telemetry at runtime (consent gates, settings page, tests). */
export function setTelemetryEnabled(enabled: boolean): void {
  isEnabled = enabled;
  if (!enabled) {
    queue = [];
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
}

export function isTelemetryEnabled(): boolean {
  return isEnabled;
}

/** Queue one behavioral event. Never throws. */
export function logEvent(ev: BehavioralEvent): void {
  try {
    if (!isEnabled) return;
    ensureLifecycleHooks();
    const enriched: BehavioralEvent = {
      ...ev,
      session_id: ev.session_id ?? getSessionId(),
      client_ts: ev.client_ts ?? new Date().toISOString(),
      app_version: ev.app_version ?? appVersion(),
    };
    queue.push(enriched);
    if (queue.length >= BATCH_SIZE) {
      void flush();
    } else {
      scheduleFlush();
    }
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) console.warn('[telemetry] logEvent error', err);
  }
}

export function logImpression(opts: {
  category: EventCategory;
  placement: string;
  artifact_id?: string;
  symbol?: string;
  portfolio_id?: string;
  properties?: Record<string, unknown>;
}): void {
  logEvent({
    event_type: 'impression',
    event_category: opts.category,
    placement: opts.placement,
    artifact_id: opts.artifact_id,
    symbol: opts.symbol,
    portfolio_id: opts.portfolio_id,
    properties: opts.properties,
  });
}

export function logPageView(placement: string, properties?: Record<string, unknown>): void {
  logEvent({
    event_type: 'page_view',
    placement,
    properties,
  });
}

export function logOpen(opts: {
  category: EventCategory;
  placement: string;
  artifact_id?: string;
  entity_id?: string;
  symbol?: string;
  properties?: Record<string, unknown>;
}): void {
  logEvent({
    event_type: 'open',
    event_category: opts.category,
    placement: opts.placement,
    artifact_id: opts.artifact_id,
    entity_id: opts.entity_id,
    symbol: opts.symbol,
    properties: opts.properties,
  });
}

export function logValueAction(
  type: Extract<EventType, 'expand' | 'save' | 'export' | 'scenario_run' | 'copilot_followup'>,
  opts: {
    category: EventCategory;
    placement?: string;
    artifact_id?: string;
    symbol?: string;
    portfolio_id?: string;
    properties?: Record<string, unknown>;
  },
): void {
  logEvent({
    event_type: type,
    event_category: opts.category,
    placement: opts.placement,
    artifact_id: opts.artifact_id,
    symbol: opts.symbol,
    portfolio_id: opts.portfolio_id,
    properties: opts.properties,
  });
}

export function logDismiss(opts: {
  category: EventCategory;
  placement?: string;
  artifact_id?: string;
  reason?: string;
}): void {
  logEvent({
    event_type: 'dismiss',
    event_category: opts.category,
    placement: opts.placement,
    artifact_id: opts.artifact_id,
    properties: opts.reason ? { reason: opts.reason } : undefined,
  });
}

/**
 * Post a feedback event via the dedicated /personalization/feedback route.
 * Persisted as feedback_* event_types so retention analytics can treat them
 * as first-class signal.
 */
export async function logFeedback(payload: FeedbackEvent): Promise<void> {
  try {
    if (!isEnabled) return;
    await gatewayBeacon('/personalization/feedback', payload);
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) console.warn('[telemetry] logFeedback error', err);
  }
}

export { getSessionId } from './sessionId';
export type { BehavioralEvent, EventType, EventCategory, FeedbackEvent };
