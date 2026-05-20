"""
V5 Personalization package.

This package will host the personalization engine in PR3:
  - sessionizer:        user_events -> user_sessions / user_value_events
  - profile_builder:    nightly user_profile_daily snapshots
  - candidate_generator: pulls candidates from V4 agent_outputs +
                        vulnerability + analog + narrative + watchlist events
  - ranker:             rules-first BaseScore (deep-research-report §5)
  - briefing_builder:   materializes artifacts.personalized_briefings
  - investigation_memory: CRUD over artifacts.investigation_memory
  - notification_policy: alert send/suppress/defer decisions with hard caps

PR1 (this PR) ships only the privacy primitive used everywhere downstream.
"""

from app.personalization.identity import (
    hash_user_id,
    require_salt,
    is_personalization_enabled,
)

__all__ = ["hash_user_id", "require_salt", "is_personalization_enabled"]
