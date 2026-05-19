"""
Pseudonymization primitives for the V5 personalization layer.

Why this exists at PR1:
  Raw Firebase UIDs must NEVER appear in BigQuery. Every behavioral row,
  every profile snapshot, and every artifact stamps `user_id_hash =
  sha256(uid || PERSONALIZATION_USER_ID_SALT)`. Centralizing the hash here
  guarantees the gateway, the engine, and the briefing materializer all
  produce the same key.

GDPR / UK GDPR profiling notes (see deep-research-report §"Privacy and
compliance constraints"): profiling for relevance is legitimate when the
purpose is documented, the data is minimized, and users can inspect and
reverse it. The hash is one-way; reversing requires the salt, which is
held only in Secret Manager and never logged.
"""

from __future__ import annotations

import hashlib

from app.core.config import settings


class PersonalizationConfigError(RuntimeError):
    """Raised when personalization is asked to run with unsafe configuration."""


def require_salt() -> str:
    """
    Return the configured pseudonymization salt. In production an empty
    salt is a hard error — we refuse to write identifiable behavioral rows.
    In development the salt may be empty; a deterministic placeholder is
    used so local tests stay reproducible.
    """
    salt = settings.PERSONALIZATION_USER_ID_SALT
    if salt:
        return salt
    if settings.is_production:
        raise PersonalizationConfigError(
            "PERSONALIZATION_USER_ID_SALT is required in production. "
            "Configure via Secret Manager before enabling personalization."
        )
    return "dev-only-placeholder-salt"


def hash_user_id(uid: str) -> str:
    """
    Pseudonymize a Firebase UID. Returns the lowercase hex sha256 of
    f"{uid}|{salt}". The pipe delimiter prevents length-extension and salt
    smearing across UIDs. Never log the input UID alongside the output.
    """
    if not uid:
        raise ValueError("hash_user_id requires a non-empty uid")
    if not settings.PSEUDONYMIZE_USER_IDS:
        # The config surface allows audits to confirm pseudonymization is on,
        # but the engine refuses to honor a `False` value — defense in depth.
        raise PersonalizationConfigError(
            "PSEUDONYMIZE_USER_IDS=false is not permitted. "
            "Raw Firebase UIDs must not enter BigQuery."
        )
    salt = require_salt()
    payload = f"{uid}|{salt}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def is_personalization_enabled() -> bool:
    """Master switch used by ingest routes and materialization jobs."""
    return bool(settings.PERSONALIZATION_ENABLED)
