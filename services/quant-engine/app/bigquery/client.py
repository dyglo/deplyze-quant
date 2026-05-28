"""BigQuery client — singleton, thread-safe initialization."""

import threading
from typing import Optional, Sequence, Any

import structlog
from google.cloud import bigquery
from google.api_core.exceptions import GoogleAPICallError

from app.core.config import settings

log = structlog.get_logger("quant_engine.bigquery.client")

_client: Optional[bigquery.Client] = None
_lock = threading.Lock()


def get_bigquery_client() -> bigquery.Client:
    """Return the singleton BigQuery client. Uses ADC in Cloud Run.

    A default query job config caps `maximum_bytes_billed` on every query so a
    runaway scan can never bill the project unbounded. Callers that pass their
    own `job_config` override this entirely — use `query_job_config()` (or the
    `run_query` helper) so those callers keep the same cost ceiling.
    """
    global _client
    if _client is not None:
        return _client
    with _lock:
        if _client is not None:
            return _client
        client = bigquery.Client(
            project=settings.GCP_PROJECT_ID,
            location=settings.BIGQUERY_LOCATION,
        )
        client.default_query_job_config = bigquery.QueryJobConfig(
            maximum_bytes_billed=settings.BQ_MAX_BYTES_BILLED,
        )
        _client = client
        log.info(
            "bigquery.client_initialized",
            project=settings.GCP_PROJECT_ID,
            max_bytes_billed=settings.BQ_MAX_BYTES_BILLED,
        )
    return _client


def fully_qualified(dataset_id: str, table_id: str) -> str:
    return f"{settings.GCP_PROJECT_ID}.{dataset_id}.{table_id}"


def query_job_config(
    query_parameters: Optional[Sequence[Any]] = None,
    **kwargs: Any,
) -> bigquery.QueryJobConfig:
    """Build a QueryJobConfig that always carries the cost ceiling.

    Use this for any query that needs an explicit job config (parameters, write
    dispositions, etc.) so it doesn't silently drop the `maximum_bytes_billed`
    cap that the default job config provides.
    """
    return bigquery.QueryJobConfig(
        maximum_bytes_billed=settings.BQ_MAX_BYTES_BILLED,
        query_parameters=list(query_parameters) if query_parameters else [],
        **kwargs,
    )


def run_query(
    sql: str,
    query_parameters: Optional[Sequence[Any]] = None,
    timeout_ms: Optional[int] = None,
):
    """Run a parameterized query with cost + runtime guards and return rows.

    `query_parameters` is a sequence of ``bigquery.ScalarQueryParameter`` /
    ``bigquery.ArrayQueryParameter``. Never interpolate user input into `sql` —
    pass it as a parameter. Enforces both `maximum_bytes_billed` (cost) and a
    wall-clock job timeout (cancels the job server-side on expiry).
    """
    client = get_bigquery_client()
    timeout_ms = timeout_ms if timeout_ms is not None else settings.BQ_JOB_TIMEOUT_MS
    job_config = query_job_config(query_parameters=query_parameters)
    job_config.job_timeout_ms = timeout_ms
    job = client.query(sql, job_config=job_config)
    return list(job.result(timeout=timeout_ms / 1000.0))


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
