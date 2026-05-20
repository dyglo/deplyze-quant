"""
V5 Personalization BigQuery Schemas — event spine, profile, ranking, and
investigation memory tables.

Design constraints (deep-research-report §"Data, privacy, and evaluation"):
- All user identifiers are pseudonymous (`user_id_hash`). Raw Firebase UIDs
  never enter BigQuery. Hash is sha256(uid || PERSONALIZATION_USER_ID_SALT).
- BigQuery is the source of truth. Firestore mirrors only the low-latency
  subset (active profile, active investigations).
- Tables are DATE-partitioned and clustered for point-in-time joins and
  cost discipline. Partition fields exist on every event/snapshot table.
- Schemas are additive only — never destructive — to preserve lineage.
- No table here encodes "should the user trade." V5 personalizes research
  relevance, not pressure to act.
"""

from google.cloud import bigquery

S = bigquery.SchemaField


# ──────────────────────────────────────────────────────────────────────────────
# raw_app
# ──────────────────────────────────────────────────────────────────────────────

# raw_app.user_events — immutable behavioral event log.
# Event taxonomy (event_type values):
#   impression, open, expand, save, dismiss, pin, share, export,
#   scenario_run, copilot_query, copilot_followup, briefing_open,
#   briefing_section_open, alert_open, alert_dismiss, watchlist_add,
#   watchlist_remove, portfolio_view, portfolio_holding_open,
#   investigation_create, investigation_update, investigation_close,
#   investigation_pin, feedback_relevance, feedback_dismiss_category,
#   feedback_mute, session_start, session_end, page_view
# Event categories: briefing | feed | alert | copilot | portfolio |
#   watchlist | investigation | research_library | macro | instrument
USER_EVENTS = [
    S("event_id", "STRING", "REQUIRED"),
    S("user_id_hash", "STRING", "REQUIRED"),
    S("session_id", "STRING", "NULLABLE"),
    S("event_type", "STRING", "REQUIRED"),
    S("event_category", "STRING", "NULLABLE"),
    S("value_action", "BOOL", "NULLABLE"),
    S("entity_type", "STRING", "NULLABLE"),
    S("entity_id", "STRING", "NULLABLE"),
    S("artifact_id", "STRING", "NULLABLE"),
    S("symbol", "STRING", "NULLABLE"),
    S("portfolio_id", "STRING", "NULLABLE"),
    S("placement", "STRING", "NULLABLE"),
    S("channel", "STRING", "NULLABLE"),
    S("duration_ms", "INT64", "NULLABLE"),
    S("dwell_ms", "INT64", "NULLABLE"),
    S("properties", "JSON", "NULLABLE"),
    S("client_ts", "TIMESTAMP", "NULLABLE"),
    S("ingested_at", "TIMESTAMP", "REQUIRED"),
    S("event_date", "DATE", "REQUIRED"),
    S("app_version", "STRING", "NULLABLE"),
    S("user_agent_class", "STRING", "NULLABLE"),
    S("experiment_arm", "STRING", "NULLABLE"),
]


# ──────────────────────────────────────────────────────────────────────────────
# cleaned
# ──────────────────────────────────────────────────────────────────────────────

# cleaned.user_sessions — sessionized event spine.
# Sessions enriched with market-calendar context (session_window) so retention
# analytics can be measured against trading rhythms, not naive calendar days.
USER_SESSIONS = [
    S("session_id", "STRING", "REQUIRED"),
    S("user_id_hash", "STRING", "REQUIRED"),
    S("started_at", "TIMESTAMP", "REQUIRED"),
    S("ended_at", "TIMESTAMP", "NULLABLE"),
    S("duration_s", "INT64", "NULLABLE"),
    S("event_count", "INT64", "NULLABLE"),
    S("value_event_count", "INT64", "NULLABLE"),
    S("pages_visited", "STRING", "REPEATED"),
    S("market_day", "BOOL", "NULLABLE"),
    S("session_window", "STRING", "NULLABLE"),
    S("entry_surface", "STRING", "NULLABLE"),
    S("exit_surface", "STRING", "NULLABLE"),
    S("session_date", "DATE", "REQUIRED"),
    S("app_version", "STRING", "NULLABLE"),
    S("properties", "JSON", "NULLABLE"),
    S("created_at", "TIMESTAMP", "REQUIRED"),
]


# cleaned.user_value_events — explicit value-event spine.
# Filtered subset of user_events that qualify as institutional value
# (evidence_expand, save, export, scenario_run, copilot_followup,
# investigation_continuation, watchlist_use, briefing_consume).
# This is the label source for return-aware ranking and retention metrics
# (briefing value rate, time-to-first-relevant-insight, D1/D5/D20).
USER_VALUE_EVENTS = [
    S("value_event_id", "STRING", "REQUIRED"),
    S("user_id_hash", "STRING", "REQUIRED"),
    S("session_id", "STRING", "NULLABLE"),
    S("value_type", "STRING", "REQUIRED"),
    S("source_event_id", "STRING", "NULLABLE"),
    S("evidence_artifact_ids", "STRING", "REPEATED"),
    S("portfolio_id", "STRING", "NULLABLE"),
    S("symbol", "STRING", "NULLABLE"),
    S("placement", "STRING", "NULLABLE"),
    S("event_ts", "TIMESTAMP", "REQUIRED"),
    S("event_date", "DATE", "REQUIRED"),
    S("properties", "JSON", "NULLABLE"),
]


# ──────────────────────────────────────────────────────────────────────────────
# features
# ──────────────────────────────────────────────────────────────────────────────

# features.user_profile_daily — daily institutional behavioral cognition
# snapshot. Built nightly from holdings, watchlists, value events, and agent
# interactions. Encodes BOTH the user's stable style (long-decay, 60-90d
# half-life) and current active attention (short-decay, 7-14d half-life).
USER_PROFILE_DAILY = [
    S("user_id_hash", "STRING", "REQUIRED"),
    S("snapshot_date", "DATE", "REQUIRED"),
    # ── identity ──
    S("portfolio_identity", "JSON", "NULLABLE"),
    S("macro_sensitivity", "JSON", "NULLABLE"),
    S("narrative_affinity", "JSON", "NULLABLE"),
    S("sector_focus", "STRING", "REPEATED"),
    S("regime_style", "STRING", "NULLABLE"),
    S("preferred_depth", "STRING", "NULLABLE"),
    S("risk_posture", "STRING", "NULLABLE"),
    # ── workflow ──
    S("workflow_signature", "JSON", "NULLABLE"),
    S("temporal_engagement", "JSON", "NULLABLE"),
    S("active_investigation_ids", "STRING", "REPEATED"),
    S("watchlist_symbols", "STRING", "REPEATED"),
    S("portfolio_symbols", "STRING", "REPEATED"),
    # ── decay features ──
    S("short_decay_features", "JSON", "NULLABLE"),
    S("long_decay_features", "JSON", "NULLABLE"),
    S("fatigue_signals", "JSON", "NULLABLE"),
    # ── lineage ──
    S("profile_version", "STRING", "NULLABLE"),
    S("builder_version", "STRING", "NULLABLE"),
    S("source_events_window_days", "INT64", "NULLABLE"),
    S("generated_at", "TIMESTAMP", "REQUIRED"),
]


# features.user_candidate_features — point-in-time user × candidate features
# for ranking. Drives BaseScore (rules-first) today; later supervised models
# and LTR rerankers will consume the same rows.
#
# BaseScore (see deep-research-report §"Recommended retention algorithm"):
#   Gate × ( 0.30 PortfolioImpact + 0.20 WatchlistMatch
#         + 0.15 InvestigationContinuation + 0.10 RegimeUrgency
#         + 0.10 Confidence + 0.05 Novelty + 0.05 Recency
#         + 0.05 SourceQuality
#         - 0.10 FatiguePenalty - 0.10 DuplicationPenalty )
USER_CANDIDATE_FEATURES = [
    S("feature_id", "STRING", "REQUIRED"),
    S("user_id_hash", "STRING", "REQUIRED"),
    S("candidate_artifact_id", "STRING", "REQUIRED"),
    S("candidate_kind", "STRING", "REQUIRED"),
    # ── scoring inputs ──
    S("portfolio_impact_score", "FLOAT64", "NULLABLE"),
    S("watchlist_match_score", "FLOAT64", "NULLABLE"),
    S("investigation_continuation_score", "FLOAT64", "NULLABLE"),
    S("regime_urgency_score", "FLOAT64", "NULLABLE"),
    S("narrative_relevance_score", "FLOAT64", "NULLABLE"),
    S("macro_sensitivity_score", "FLOAT64", "NULLABLE"),
    S("behavioral_affinity_score", "FLOAT64", "NULLABLE"),
    S("temporal_relevance_score", "FLOAT64", "NULLABLE"),
    S("novelty_score", "FLOAT64", "NULLABLE"),
    S("confidence", "FLOAT64", "NULLABLE"),
    S("source_quality", "FLOAT64", "NULLABLE"),
    S("fatigue_penalty", "FLOAT64", "NULLABLE"),
    S("duplication_penalty", "FLOAT64", "NULLABLE"),
    # ── outputs ──
    S("base_score", "FLOAT64", "NULLABLE"),
    S("gate_passed", "BOOL", "NULLABLE"),
    S("gate_reasons", "STRING", "REPEATED"),
    S("reason_codes", "STRING", "REPEATED"),
    # ── lineage ──
    S("feature_vector", "JSON", "NULLABLE"),
    S("ranker_version", "STRING", "NULLABLE"),
    S("profile_version", "STRING", "NULLABLE"),
    S("generated_at", "TIMESTAMP", "REQUIRED"),
    S("snapshot_date", "DATE", "REQUIRED"),
]


# features.user_notification_features — timing / fatigue / channel features
# for the alert decision policy. Hard caps live here, not in product code.
USER_NOTIFICATION_FEATURES = [
    S("user_id_hash", "STRING", "REQUIRED"),
    S("snapshot_date", "DATE", "REQUIRED"),
    S("recent_alert_count_24h", "INT64", "NULLABLE"),
    S("recent_alert_count_7d", "INT64", "NULLABLE"),
    S("recent_dismiss_count_7d", "INT64", "NULLABLE"),
    S("muted_categories", "STRING", "REPEATED"),
    S("avg_open_rate_30d", "FLOAT64", "NULLABLE"),
    S("channel_preferences", "JSON", "NULLABLE"),
    S("time_of_day_open_dist", "JSON", "NULLABLE"),
    S("last_alert_at", "TIMESTAMP", "NULLABLE"),
    S("daily_alert_budget", "INT64", "NULLABLE"),
    S("fatigue_score", "FLOAT64", "NULLABLE"),
    S("policy_version", "STRING", "NULLABLE"),
    S("generated_at", "TIMESTAMP", "REQUIRED"),
]


# ──────────────────────────────────────────────────────────────────────────────
# artifacts
# ──────────────────────────────────────────────────────────────────────────────

# artifacts.personalized_briefings — materialized morning terminal output.
# Each briefing answers the report's five briefing questions: what changed
# overnight, what changed in portfolio, what changed in watchlists, which
# narratives strengthened/weakened, what deserves attention first.
PERSONALIZED_BRIEFINGS = [
    S("briefing_id", "STRING", "REQUIRED"),
    S("user_id_hash", "STRING", "REQUIRED"),
    S("briefing_date", "DATE", "REQUIRED"),
    S("briefing_window", "STRING", "NULLABLE"),
    S("title", "STRING", "NULLABLE"),
    S("summary", "STRING", "NULLABLE"),
    S("sections", "JSON", "NULLABLE"),
    S("ranked_items", "JSON", "NULLABLE"),
    S("portfolio_id", "STRING", "NULLABLE"),
    S("candidate_set_size", "INT64", "NULLABLE"),
    S("ranker_version", "STRING", "NULLABLE"),
    S("profile_version", "STRING", "NULLABLE"),
    S("safety_gate_log", "JSON", "NULLABLE"),
    S("explainability", "JSON", "NULLABLE"),
    S("generated_at", "TIMESTAMP", "REQUIRED"),
    S("materialized_at", "TIMESTAMP", "NULLABLE"),
    S("lineage_id", "STRING", "NULLABLE"),
]


# artifacts.notification_decisions — alert decision log + outcomes.
# Logged for every send/suppress/defer decision so policies are auditable
# and counterfactual / off-policy evaluation remains feasible.
NOTIFICATION_DECISIONS = [
    S("decision_id", "STRING", "REQUIRED"),
    S("user_id_hash", "STRING", "REQUIRED"),
    S("decision_at", "TIMESTAMP", "REQUIRED"),
    S("decision_date", "DATE", "REQUIRED"),
    S("candidate_artifact_id", "STRING", "NULLABLE"),
    S("channel", "STRING", "NULLABLE"),
    S("decision", "STRING", "REQUIRED"),
    S("decision_reasons", "STRING", "REPEATED"),
    S("policy_version", "STRING", "NULLABLE"),
    S("severity", "STRING", "NULLABLE"),
    S("confidence", "FLOAT64", "NULLABLE"),
    S("expected_value", "FLOAT64", "NULLABLE"),
    S("fatigue_penalty", "FLOAT64", "NULLABLE"),
    S("outcome", "STRING", "NULLABLE"),
    S("outcome_at", "TIMESTAMP", "NULLABLE"),
    S("experiment_arm", "STRING", "NULLABLE"),
    S("properties", "JSON", "NULLABLE"),
]


# artifacts.investigation_memory — institutional workflow persistence.
# Investigations bundle symbols, themes, pinned cards, copilot threads,
# saved briefings, and unresolved questions into a single research thread
# that Deplyze remembers across sessions.
INVESTIGATION_MEMORY = [
    S("investigation_id", "STRING", "REQUIRED"),
    S("user_id_hash", "STRING", "REQUIRED"),
    S("title", "STRING", "NULLABLE"),
    S("thesis", "STRING", "NULLABLE"),
    S("status", "STRING", "REQUIRED"),
    S("created_at", "TIMESTAMP", "REQUIRED"),
    S("updated_at", "TIMESTAMP", "REQUIRED"),
    S("last_resurfaced_at", "TIMESTAMP", "NULLABLE"),
    S("created_date", "DATE", "REQUIRED"),
    S("symbols", "STRING", "REPEATED"),
    S("themes", "STRING", "REPEATED"),
    S("pinned_artifact_ids", "STRING", "REPEATED"),
    S("copilot_thread_ids", "STRING", "REPEATED"),
    S("saved_briefing_ids", "STRING", "REPEATED"),
    S("unresolved_questions", "STRING", "REPEATED"),
    S("related_macro_events", "STRING", "REPEATED"),
    S("related_analog_artifact_ids", "STRING", "REPEATED"),
    S("continuation_score", "FLOAT64", "NULLABLE"),
    S("evidence_overlap_count", "INT64", "NULLABLE"),
    S("tags", "STRING", "REPEATED"),
    S("properties", "JSON", "NULLABLE"),
    S("lineage_id", "STRING", "NULLABLE"),
]


# ──────────────────────────────────────────────────────────────────────────────
# research
# ──────────────────────────────────────────────────────────────────────────────

# research.user_context_snapshots — point-in-time grounding snapshot used by
# the Research Copilot (PR7). Lets Copilot answer with the user's preferred
# style, active investigations, and macro focus without rebuilding context
# every prompt.
USER_CONTEXT_SNAPSHOTS = [
    S("snapshot_id", "STRING", "REQUIRED"),
    S("user_id_hash", "STRING", "REQUIRED"),
    S("generated_at", "TIMESTAMP", "REQUIRED"),
    S("snapshot_date", "DATE", "REQUIRED"),
    S("profile_summary", "STRING", "NULLABLE"),
    S("active_investigations", "JSON", "NULLABLE"),
    S("portfolio_summary", "JSON", "NULLABLE"),
    S("watchlist_summary", "JSON", "NULLABLE"),
    S("macro_focus", "JSON", "NULLABLE"),
    S("recent_threads", "JSON", "NULLABLE"),
    S("copilot_grounding", "JSON", "NULLABLE"),
    S("snapshot_version", "STRING", "NULLABLE"),
]


# research.user_behavior_summaries — daily/weekly/monthly retention rollups.
# Drives the qualified-retention metrics: MDAU-Q, D1/D5/D20 market-day return,
# briefing value rate, time-to-first-relevant-insight, alert precision@k.
USER_BEHAVIOR_SUMMARIES = [
    S("user_id_hash", "STRING", "REQUIRED"),
    S("summary_period", "STRING", "REQUIRED"),
    S("period_start", "DATE", "REQUIRED"),
    S("period_end", "DATE", "NULLABLE"),
    S("session_count", "INT64", "NULLABLE"),
    S("value_event_count", "INT64", "NULLABLE"),
    S("briefing_open_count", "INT64", "NULLABLE"),
    S("briefing_value_rate", "FLOAT64", "NULLABLE"),
    S("investigation_continuation_count", "INT64", "NULLABLE"),
    S("copilot_followup_rate", "FLOAT64", "NULLABLE"),
    S("alert_open_rate", "FLOAT64", "NULLABLE"),
    S("alert_dismiss_rate", "FLOAT64", "NULLABLE"),
    S("alert_mute_rate", "FLOAT64", "NULLABLE"),
    S("time_to_first_relevant_insight_s", "FLOAT64", "NULLABLE"),
    S("d1_returned", "BOOL", "NULLABLE"),
    S("d5_returned", "BOOL", "NULLABLE"),
    S("d20_returned", "BOOL", "NULLABLE"),
    S("top_themes", "STRING", "REPEATED"),
    S("top_symbols", "STRING", "REPEATED"),
    S("generated_at", "TIMESTAMP", "REQUIRED"),
]


# ──────────────────────────────────────────────────────────────────────────────
# ops
# ──────────────────────────────────────────────────────────────────────────────

# ops.experiment_assignments — A/B and bandit arm assignments. Captured at
# decision time so off-policy evaluation and CUPED-adjusted analyses remain
# unbiased.
EXPERIMENT_ASSIGNMENTS = [
    S("assignment_id", "STRING", "REQUIRED"),
    S("user_id_hash", "STRING", "REQUIRED"),
    S("experiment_id", "STRING", "REQUIRED"),
    S("arm", "STRING", "REQUIRED"),
    S("assigned_at", "TIMESTAMP", "REQUIRED"),
    S("assigned_date", "DATE", "REQUIRED"),
    S("experiment_version", "STRING", "NULLABLE"),
    S("traffic_split", "FLOAT64", "NULLABLE"),
    S("policy_version", "STRING", "NULLABLE"),
    S("properties", "JSON", "NULLABLE"),
]


# ops.ranking_metrics — daily ranker performance rollups by version /
# placement / arm. Drives calibration reports and rollback decisions.
RANKING_METRICS = [
    S("metric_id", "STRING", "REQUIRED"),
    S("ranker_version", "STRING", "REQUIRED"),
    S("metric_date", "DATE", "REQUIRED"),
    S("placement", "STRING", "NULLABLE"),
    S("experiment_id", "STRING", "NULLABLE"),
    S("arm", "STRING", "NULLABLE"),
    S("impressions", "INT64", "NULLABLE"),
    S("opens", "INT64", "NULLABLE"),
    S("expands", "INT64", "NULLABLE"),
    S("saves", "INT64", "NULLABLE"),
    S("dismisses", "INT64", "NULLABLE"),
    S("value_events", "INT64", "NULLABLE"),
    S("ndcg_at_5", "FLOAT64", "NULLABLE"),
    S("ndcg_at_10", "FLOAT64", "NULLABLE"),
    S("map_score", "FLOAT64", "NULLABLE"),
    S("precision_at_5", "FLOAT64", "NULLABLE"),
    S("fatigue_rate", "FLOAT64", "NULLABLE"),
    S("calibration_brier", "FLOAT64", "NULLABLE"),
    S("dismiss_rate", "FLOAT64", "NULLABLE"),
    S("mute_rate", "FLOAT64", "NULLABLE"),
    S("properties", "JSON", "NULLABLE"),
    S("generated_at", "TIMESTAMP", "REQUIRED"),
]


# ──────────────────────────────────────────────────────────────────────────────
# Public registry tuples — consumed by provisioner.TABLE_REGISTRY
# Format: (dataset_attr_name, table_name, schema, partition_field, cluster_fields)
# ──────────────────────────────────────────────────────────────────────────────

V5_PERSONALIZATION_TABLES = [
    # raw_app
    ("BQ_DATASET_RAW_APP", "user_events", USER_EVENTS, "event_date",
        ["user_id_hash", "event_type", "event_category", "portfolio_id"]),
    # cleaned
    ("BQ_DATASET_CLEANED", "user_sessions", USER_SESSIONS, "session_date",
        ["user_id_hash", "session_window"]),
    ("BQ_DATASET_CLEANED", "user_value_events", USER_VALUE_EVENTS, "event_date",
        ["user_id_hash", "value_type"]),
    # features
    ("BQ_DATASET_FEATURES", "user_profile_daily", USER_PROFILE_DAILY, "snapshot_date",
        ["user_id_hash", "regime_style"]),
    ("BQ_DATASET_FEATURES", "user_candidate_features", USER_CANDIDATE_FEATURES, "snapshot_date",
        ["user_id_hash", "candidate_kind"]),
    ("BQ_DATASET_FEATURES", "user_notification_features", USER_NOTIFICATION_FEATURES, "snapshot_date",
        ["user_id_hash"]),
    # artifacts
    ("BQ_DATASET_ARTIFACTS", "personalized_briefings", PERSONALIZED_BRIEFINGS, "briefing_date",
        ["user_id_hash", "briefing_window"]),
    ("BQ_DATASET_ARTIFACTS", "notification_decisions", NOTIFICATION_DECISIONS, "decision_date",
        ["user_id_hash", "channel", "decision"]),
    ("BQ_DATASET_ARTIFACTS", "investigation_memory", INVESTIGATION_MEMORY, "created_date",
        ["user_id_hash", "status"]),
    # research
    ("BQ_DATASET_RESEARCH", "user_context_snapshots", USER_CONTEXT_SNAPSHOTS, "snapshot_date",
        ["user_id_hash"]),
    ("BQ_DATASET_RESEARCH", "user_behavior_summaries", USER_BEHAVIOR_SUMMARIES, "period_start",
        ["user_id_hash", "summary_period"]),
    # ops
    ("BQ_DATASET_OPS", "experiment_assignments", EXPERIMENT_ASSIGNMENTS, "assigned_date",
        ["experiment_id", "arm"]),
    ("BQ_DATASET_OPS", "ranking_metrics", RANKING_METRICS, "metric_date",
        ["ranker_version", "placement"]),
]


# Datasets that V5 introduces and the provisioner must ensure exist.
V5_NEW_DATASETS = ["BQ_DATASET_RAW_APP", "BQ_DATASET_OPS"]
