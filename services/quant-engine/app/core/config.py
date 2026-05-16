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
