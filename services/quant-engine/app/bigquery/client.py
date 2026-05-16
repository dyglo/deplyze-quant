"""BigQuery client — singleton, thread-safe initialization."""

import threading
from typing import Optional

import structlog
from google.cloud import bigquery
from google.api_core.exceptions import GoogleAPICallError

from app.core.config import settings

log = structlog.get_logger("quant_engine.bigquery.client")

_client: Optional[bigquery.Client] = None
_lock = threading.Lock()


def get_bigquery_client() -> bigquery.Client:
    """Return the singleton BigQuery client. Uses ADC in Cloud Run."""
    global _client
    if _client is not None:
        return _client
    with _lock:
        if _client is not None:
            return _client
        _client = bigquery.Client(
            project=settings.GCP_PROJECT_ID,
            location=settings.BIGQUERY_LOCATION,
        )
        log.info("bigquery.client_initialized", project=settings.GCP_PROJECT_ID)
    return _client


def fully_qualified(dataset_id: str, table_id: str) -> str:
    return f"{settings.GCP_PROJECT_ID}.{dataset_id}.{table_id}"


def check_connectivity() -> dict:
    """Light connectivity check. Returns a status dict."""
    try:
        client = get_bigquery_client()
        datasets = list(client.list_datasets(project=settings.GCP_PROJECT_ID))
        dataset_ids = sorted(ds.dataset_id for ds in datasets)
        return {
            "connected": True,
            "project": settings.GCP_PROJECT_ID,
            "location": settings.BIGQUERY_LOCATION,
            "datasets": dataset_ids,
            "dataset_count": len(dataset_ids),
        }
    except GoogleAPICallError as e:
        return {"connected": False, "error": str(e)}
    except Exception as e:
        return {"connected": False, "error": str(e)}
