"""
Configuration — reads from environment variables.
All secrets come from Cloud Run env vars / Secret Manager. Never hardcoded.
"""

import os
from typing import List
from pydantic_settings import BaseSettings
from pydantic import field_validator


class Settings(BaseSettings):
    # ─── GCP ────────────────────────────────────────────────────────────────
    GCP_PROJECT_ID: str = "deplyze-quant"
    BIGQUERY_LOCATION: str = "US"

    # ─── BigQuery cost / runtime guards ──────────────────────────────────────
    # Hard ceiling on bytes a single query may bill (cancels above this), and a
    # wall-clock job timeout. Applied via the client's default job config and
    # the run_query() helper so no query can run away. Defaults: 2 GiB, 60s.
    BQ_MAX_BYTES_BILLED: int = 2 * 1024 * 1024 * 1024
    BQ_JOB_TIMEOUT_MS: int = 60_000

    # ─── Service identity ────────────────────────────────────────────────────
    QUANT_ENGINE_ENV: str = "development"   # development | production

    # ─── CORS ────────────────────────────────────────────────────────────────
    ALLOWED_ORIGINS_RAW: str = ""           # comma-separated; empty = internal only

    # ─── Provider API keys (never logged) ───────────────────────────────────
    POLYGON_API_KEY: str = ""
    FMP_API_KEY: str = ""
    EODHD_API_KEY: str = ""
    FINNHUB_API_KEY: str = ""
    TWELVE_DATA_API_KEY: str = ""
    ALPHA_VANTAGE_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    # Overridable so a model rotation is a config change, not a redeploy.
    GEMINI_MODEL: str = "gemini-3-flash-preview"
    TAVILY_API_KEY: str = ""
    SERPER_API_KEY: str = ""

    # ─── BigQuery dataset names (configurable but have safe defaults) ────────
    BQ_DATASET_RAW_API: str = "raw_api"
    BQ_DATASET_RAW_PUBLIC: str = "raw_public"
    BQ_DATASET_RAW_DOCUMENTS: str = "raw_documents"
    BQ_DATASET_CLEANED: str = "cleaned"
    BQ_DATASET_FEATURES: str = "features"
    BQ_DATASET_RESEARCH: str = "research"
    BQ_DATASET_ARTIFACTS: str = "artifacts"
    BQ_DATASET_MODEL_OUTPUTS: str = "model_outputs"

    # ─── V5 Personalization · new datasets ───────────────────────────────────
    BQ_DATASET_RAW_APP: str = "raw_app"
    BQ_DATASET_OPS: str = "ops"

    # ─── V5 Personalization · feature flags and policy knobs ─────────────────
    # Master switch. When false the gateway short-circuits all /personalization
    # routes with 404 and the engine skips materialization jobs.
    PERSONALIZATION_ENABLED: bool = False
    # When true, ranking falls back to deterministic rule-based scoring only —
    # no supervised models, no bandits. This is the Phase 1 default and the
    # rollback target for later phases.
    PERSONALIZATION_RULES_ONLY: bool = True
    # Ranker / policy versions stamped onto every materialized artifact so
    # off-policy evaluation and rollbacks remain unambiguous.
    PERSONALIZATION_RANKER_VERSION: str = "rules-v1.0"
    PERSONALIZATION_POLICY_VERSION: str = "policy-v1.0"
    PERSONALIZATION_PROFILE_VERSION: str = "profile-v1.0"
    # Bandit exploration is OFF until Phase 3. Keep these knobs so the env
    # surface is forward-compatible without code churn.
    BANDIT_ENABLED: bool = False
    BANDIT_EXPLORATION_RATE: float = 0.0
    # Hard alert caps. Enforced in the notification decision policy, NOT in
    # product code, so the policy stays auditable.
    MAX_ALERTS_PER_DAY: int = 3
    MIN_ALERT_CONFIDENCE: float = 0.6
    # All user identifiers in BigQuery are sha256(uid || salt). The salt MUST
    # be set in production via Secret Manager. Empty salt is rejected when
    # the personalization writer initializes in production mode.
    PERSONALIZATION_USER_ID_SALT: str = ""
    # Always-on safety toggle. Setting to false is explicitly disallowed; it
    # exists as a config surface so audits can confirm pseudonymization is on.
    PSEUDONYMIZE_USER_IDS: bool = True

    # ─── V3 Phase 2 · public-source connectors ───────────────────────────────
    # SEC EDGAR requires a descriptive User-Agent with contact email.
    # Format suggestion: "Deplyze Quant ops@deplyze.io"
    EDGAR_USER_AGENT: str = ""
    EDGAR_DEFAULT_LOOKBACK_DAYS: int = 90
    # FRED + RSS + COT etc. extend here in later waves.
    FRED_API_KEY: str = ""

    # ─── Backtest engine · wide-parquet export ───────────────────────────────
    # The Rust backtest engine reads a wide, daily, forward-filled parquet from
    # this bucket/object. Empty bucket → engine returns PARQUET_NOT_READY.
    GCS_BACKTEST_BUCKET: str = ""
    BACKTEST_PARQUET_OBJECT: str = "backtest/wide_daily.parquet"
    # The instrument whose returns the backtest trades (must exist in
    # cleaned.ohlcv_cleaned / features.returns_features).
    BACKTEST_ASSET_SYMBOL: str = "SPY"
    # History window for the nightly legacy export.
    BACKTEST_LOOKBACK_DAYS: int = 365 * 15
    # History window for per-instrument on-demand exports.
    BACKTEST_INSTRUMENT_LOOKBACK_DAYS: int = 365 * 30

    @property
    def ALLOWED_ORIGINS(self) -> List[str]:
        if not self.ALLOWED_ORIGINS_RAW:
            return ["https://deplyze-quant.web.app", "https://deplyze-quant.firebaseapp.com"]
        return [o.strip() for o in self.ALLOWED_ORIGINS_RAW.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.QUANT_ENGINE_ENV == "production"

    @property
    def configured_providers(self) -> List[str]:
        """Return list of providers that have API keys configured."""
        providers = []
        if self.POLYGON_API_KEY:
            providers.append("polygon")
        if self.FMP_API_KEY:
            providers.append("fmp")
        if self.EODHD_API_KEY:
            providers.append("eodhd")
        if self.FINNHUB_API_KEY:
            providers.append("finnhub")
        if self.TWELVE_DATA_API_KEY:
            providers.append("twelve_data")
        if self.ALPHA_VANTAGE_API_KEY:
            providers.append("alpha_vantage")
        return providers

    class Config:
        env_file = ".env.local"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
