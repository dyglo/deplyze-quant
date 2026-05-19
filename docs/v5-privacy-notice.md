# V5 Personalization — Privacy Notice (Internal Reference)

This document captures the privacy posture Deplyze publishes externally and
enforces internally for the V5 Personalized Institutional Intelligence
Infrastructure. It is the canonical reference for security review and for
the user-facing copy in the Settings → Personalization screen.

## What we collect for personalization

| Data | Where it lives | Why we collect it |
|---|---|---|
| Behavioral events (impressions, opens, expands, saves, dismisses, copilot interactions) | `raw_app.user_events` (BigQuery) | Briefing ranking, alert prioritization, workflow continuity, Copilot grounding |
| Sessionized events + trading-day session windows | `cleaned.user_sessions` | Retention analytics (MDAU-Q, D5/D20) |
| Value events (qualifying institutional actions) | `cleaned.user_value_events` | Return-aware ranking label source |
| Behavioral profile (style, depth, decay-weighted attention) | `features.user_profile_daily` | Personalize briefing + Copilot |
| Candidate features (per-user × candidate scoring inputs) | `features.user_candidate_features` | Rule-based BaseScore + reason codes |
| Investigations (titles, theses, symbols, questions) | `artifacts.investigation_memory` | Persistent workflow memory |
| Personalized briefings | `artifacts.personalized_briefings` | Morning Terminal homepage surface |
| Notification decisions + outcomes | `artifacts.notification_decisions` | Off-policy evaluation, audit |

## What we do NOT collect

- Raw Firebase UIDs in BigQuery. Every row stamps `user_id_hash =
  sha256(uid || "|" || PERSONALIZATION_USER_ID_SALT)`. The salt lives in
  Secret Manager.
- Raw User-Agent strings. Only bucketed class (`desktop | mobile | tablet`).
- Raw IP addresses (rate limiting uses ephemeral hashing).
- Free-text user queries beyond what the user explicitly types into
  Copilot — no shadow indexing of input strings into BigQuery beyond the
  Copilot service's own audit log.
- Cross-user behavior. No collaborative-filtering signal in Phase 1; if
  introduced later, it is k-anonymized and aggregated.

## What users can do

- **Dismiss any observation** — feeds fatigue suppression; the same item
  is suppressed in future ranking.
- **"Less like this"** — `feedback_relevance` event reduces relevance for
  similar items.
- **Mute a category or kind** — `feedback_mute` suppresses that kind on
  the user's surfaces.
- **Inspect "why was this shown"** — every Morning Terminal item exposes
  reason codes, per-component score bars, and the base score.
- **Pause an investigation** — stops `investigation_continuation_score`
  from boosting related candidates.
- **Disable telemetry** — `setTelemetryEnabled(false)` (Settings UI
  surface in PR8+); events stop being queued and the personalization
  layer degrades to V4-only intelligence for that user.
- **Reset profile** — clear `features.user_profile_daily` rows for the
  user (Admin SDK operation; UI surface lands later).

## Personalization vs. investment advice

Deplyze V5 personalizes **research relevance**, not pressure to act.
The ranker contains a deterministic safety gate that drops any candidate
containing trade-pressure language ("buy now", "you should sell", etc.).
The product surface does not include trading execution, allocation
suggestions, or position sizing prompts.

This is a strict line. SEC guidance on digital engagement practices is
explicit: notifications, prompts, gamification, and predictive systems
that influence investor behavior are scrutinized. We position
personalization on the research-relevance side of that line by
construction.

## Lawful basis (GDPR / UK GDPR)

- **Processing basis**: Legitimate interest (research relevance
  optimization) with documented purpose limitation and data minimization.
- **Profiling notice**: The Settings → Personalization screen documents
  what data is used, why, and how the user can inspect or reverse it.
- **Automated decisions**: V5 Phase 1 makes only **research-prioritization**
  decisions. No solely-automated decisions that produce legal or
  significantly similar effects on the user are made. Notification
  send/suppress/defer decisions are auditable, reversible, and never
  block the user from accessing any product surface.

## Firestore mirror security

- `users/{uid}/personalizationProfile/*` — read-only by user; gateway
  writes via Admin SDK.
- `users/{uid}/investigations/*` — read+write by owner only.
- `users/{uid}/savedBriefings/*` — read+write by owner only.
- `users/{uid}/workflowMemory/*` — read+write by owner only.
- `users/{uid}/personalizationControls/*` — read+write by owner only;
  this is where mute/category preferences live.

Rules enforced in `firestore.rules`. No path allows cross-user access
under any branch. `request.auth.uid == userId` is required on every
match.

## Auditability

Every materialized briefing, notification decision, and ranker run is
stamped with:
- `ranker_version` / `policy_version` / `profile_version`
- `lineage_id`
- `safety_gate_log` (dropped candidates + reasons)
- `decision_reasons` (notification path)

That makes the system reviewable end-to-end, including by the user via
the "why was this shown" affordance.
