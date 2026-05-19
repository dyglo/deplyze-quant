# V5 Phase 1 — Data Flow & Privacy Model

This document defines the data spine for the V5 Personalized Institutional
Intelligence Infrastructure. It is the contract for PR1 of the V5 Phase 1
rollout and the reference for every later PR.

V5 does **not** rebuild V4. The agentic layer (`artifacts.agent_outputs`,
vulnerability, historical analog, narrative exposure, reasoning) continues
to produce candidate intelligence. V5 adds the **personalization layer
on top**: behavioral spine, user cognitive profile, investigation memory,
return-aware rule-based ranking, and a personalized morning terminal.

## Datasets introduced in PR1

| Dataset | Purpose | New in V5? |
|---|---|---|
| `raw_app` | Immutable behavioral event log | yes |
| `cleaned` | Sessionized + value-event spine | extended |
| `features` | User profile, candidate, and notification features | extended |
| `artifacts` | Personalized briefings, notification decisions, investigation memory | extended |
| `research` | User context snapshots + retention rollups | extended |
| `ops` | Experiment assignments and ranking metrics | yes |

## Tables created by `provisioner.provision_all_tables()`

All tables are DATE-partitioned on the field shown and clustered for
point-in-time joins.

| FQN | Partition | Cluster |
|---|---|---|
| `raw_app.user_events` | `event_date` | `user_id_hash, event_type, event_category, portfolio_id` |
| `cleaned.user_sessions` | `session_date` | `user_id_hash, session_window` |
| `cleaned.user_value_events` | `event_date` | `user_id_hash, value_type` |
| `features.user_profile_daily` | `snapshot_date` | `user_id_hash, regime_style` |
| `features.user_candidate_features` | `snapshot_date` | `user_id_hash, candidate_kind` |
| `features.user_notification_features` | `snapshot_date` | `user_id_hash` |
| `artifacts.personalized_briefings` | `briefing_date` | `user_id_hash, briefing_window` |
| `artifacts.notification_decisions` | `decision_date` | `user_id_hash, channel, decision` |
| `artifacts.investigation_memory` | `created_date` | `user_id_hash, status` |
| `research.user_context_snapshots` | `snapshot_date` | `user_id_hash` |
| `research.user_behavior_summaries` | `period_start` | `user_id_hash, summary_period` |
| `ops.experiment_assignments` | `assigned_date` | `experiment_id, arm` |
| `ops.ranking_metrics` | `metric_date` | `ranker_version, placement` |

Schemas are defined in `services/quant-engine/app/bigquery/v5_schemas.py`
and registered in `services/quant-engine/app/bigquery/provisioner.py`.

## Event taxonomy (raw_app.user_events)

```
event_type ∈ {
  impression, open, expand, save, dismiss, pin, share, export,
  scenario_run, copilot_query, copilot_followup,
  briefing_open, briefing_section_open,
  alert_open, alert_dismiss,
  watchlist_add, watchlist_remove,
  portfolio_view, portfolio_holding_open,
  investigation_create, investigation_update, investigation_close,
  investigation_pin,
  feedback_relevance, feedback_dismiss_category, feedback_mute,
  session_start, session_end, page_view
}

event_category ∈ {
  briefing | feed | alert | copilot | portfolio
  | watchlist | investigation | research_library
  | macro | instrument
}

value_action = true ⇔ event_type ∈ {
  expand, save, export, scenario_run, copilot_followup,
  investigation_continuation, watchlist_use, briefing_consume
}
```

Sessionization (PR3) collapses raw events into `cleaned.user_sessions`,
enriched with the trading-calendar window (`premarket | open | midday |
close | afterhours | weekend`). The value-event subset is filtered into
`cleaned.user_value_events` and is the **label source** for return-aware
ranking, briefing value rate, and D1/D5/D20 market-day retention.

## Identity & pseudonymization

```
user_id_hash = sha256( firebase_uid || "|" || PERSONALIZATION_USER_ID_SALT )
```

Implementation: `app/personalization/identity.py` (`hash_user_id`).

Rules:

- Raw Firebase UIDs **never** enter BigQuery. The gateway hashes before
  forwarding any event.
- `PERSONALIZATION_USER_ID_SALT` is required in production and held in
  Secret Manager. The engine refuses to start in production without it.
- `PSEUDONYMIZE_USER_IDS=false` is a configuration surface for audit
  visibility only — the code rejects the value.
- `user_id_hash` is one-way. Reversing requires the salt.
- Cross-user signals (later phases, collaborative features) are
  k-anonymized and aggregated; no individual portfolio or research trail
  is ever surfaced to another user.

## Feature flags (Phase 1)

Defined in `app/core/config.py`:

| Flag | Default | Effect |
|---|---|---|
| `PERSONALIZATION_ENABLED` | `false` | Master switch; gates routes + jobs |
| `PERSONALIZATION_RULES_ONLY` | `true` | Phase 1: deterministic ranking only |
| `PERSONALIZATION_RANKER_VERSION` | `rules-v1.0` | Stamped on every ranked artifact |
| `PERSONALIZATION_POLICY_VERSION` | `policy-v1.0` | Stamped on every notification decision |
| `PERSONALIZATION_PROFILE_VERSION` | `profile-v1.0` | Stamped on every profile snapshot |
| `BANDIT_ENABLED` | `false` | Phase 3 only; off in Phase 1 |
| `BANDIT_EXPLORATION_RATE` | `0.0` | Phase 3 knob |
| `MAX_ALERTS_PER_DAY` | `3` | Hard alert cap, enforced in policy |
| `MIN_ALERT_CONFIDENCE` | `0.6` | Confidence floor for any alert |
| `PERSONALIZATION_USER_ID_SALT` | `""` | Required in production |
| `PSEUDONYMIZE_USER_IDS` | `true` | Audit surface; cannot be disabled |

## Privacy & compliance posture (Phase 1)

- **Lawful basis**: profiling for research relevance, not for individualized
  investment advice. Documented per GDPR Art. 22 / UK GDPR profiling
  guidance.
- **Purpose limitation**: behavioral events power briefing ranking, alert
  prioritization, workflow continuity, and Copilot grounding. Any new
  purpose requires a separate decision and a privacy notice update.
- **Data minimization**: only the fields in `USER_EVENTS` are logged.
  Raw user-agent strings, IP addresses, and free-text search payloads are
  NOT captured.
- **Reversibility**: every personalized observation must expose a
  "why was this shown" trail (`ranked_items[].reason_codes`,
  `safety_gate_log`), be dismissable, and contribute to fatigue suppression.
- **Auditability**: every materialized ranking, briefing, and notification
  decision is stamped with `ranker_version`, `policy_version`,
  `profile_version`, and `lineage_id`.
- **Rollback**: setting `PERSONALIZATION_ENABLED=false` short-circuits all
  routes and jobs; setting `PERSONALIZATION_RULES_ONLY=true` (Phase 2+
  rollback target) forces deterministic ranking even when models exist.

## What PR1 does NOT include

- Event ingest API (PR2)
- Engine modules (PR3) — sessionizer, profile builder, candidate generator,
  ranker, briefing builder, investigation memory CRUD
- Personalization routes (PR4)
- Frontend telemetry + Morning Terminal page (PR5–PR6)
- Copilot grounding extension (PR7)
- Firestore rules + indexes (PR8)

## Deployment checklist for PR1

This PR is **schema-only**. To verify after merge:

1. Confirm the quant-engine container picks up the new env-var surface:
   `PERSONALIZATION_USER_ID_SALT` must be set via Secret Manager before
   `PERSONALIZATION_ENABLED` is flipped to `true`.
2. Run `POST /warehouse/init` (or call `provisioner.provision_all_tables()`
   directly) to materialize the new tables. Idempotent — safe to re-run.
3. Verify the 13 new tables exist in BigQuery with the expected
   partition/cluster keys (see table above).
4. Verify the two new datasets (`raw_app`, `ops`) were created in the
   project's BigQuery location.
5. Leave `PERSONALIZATION_ENABLED=false`. PR2 will turn the ingest route
   on; PR3 will turn the jobs on.
