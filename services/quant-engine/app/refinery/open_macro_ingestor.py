"""
Open macro warehouse ingestion.

This module ingests World Bank, IMF DataMapper, and DBnomics observations into:
  raw_public.open_macro_raw
  cleaned.global_indicators_cleaned
  features.country_regime_features
  research.country_macro_observations
  artifacts.macro_artifacts

Writes are idempotent BigQuery load+MERGE jobs, not blind streaming inserts.
"""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any, Iterable, Optional

import structlog
from google.cloud import bigquery

from app.bigquery.client import fully_qualified, get_bigquery_client
from app.connectors.open_macro import (
    COUNTRY_ETF_MAP,
    COUNTRY_NAMES,
    DEFAULT_COUNTRIES,
    DEFAULT_DBNOMICS_SERIES,
    DEFAULT_IMF_INDICATORS,
    DEFAULT_WORLD_BANK_INDICATORS,
    DbnomicsClient,
    ImfDataMapperClient,
    MacroObservation,
    WorldBankClient,
)
from app.core.config import settings

log = structlog.get_logger("quant_engine.refinery.open_macro_ingestor")

OPEN_MACRO_SOURCES = {"world_bank", "imf_datamapper", "dbnomics"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _date_iso(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


def _stable_hash(*parts: object) -> str:
    key = "|".join("" if p is None else str(p) for p in parts)
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _jsonable(v: Any) -> Any:
    if isinstance(v, (dict, list)):
        return v
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    return str(v)


async def ingest_open_macro(
    run_id: str,
    *,
    sources: Optional[list[str]] = None,
    countries: Optional[list[str]] = None,
    start_year: Optional[int] = None,
    end_year: Optional[int] = None,
    world_bank_indicators: Optional[list[str]] = None,
    imf_indicators: Optional[list[str]] = None,
    dbnomics_series_ids: Optional[list[str]] = None,
) -> dict:
    try:
        from app.api.pipelines import _runs
    except Exception:
        _runs = {}

    now = _now()
    end = end_year or now.year
    start = start_year or max(1980, end - 10)
    chosen_sources = [s for s in (sources or sorted(OPEN_MACRO_SOURCES)) if s in OPEN_MACRO_SOURCES]
    chosen_countries = [c.upper() for c in (countries or DEFAULT_COUNTRIES)]

    summary = {
        "run_id": run_id,
        "pipeline_name": "open_macro_ingest",
        "status": "running",
        "started_at": _iso(now),
        "completed_at": None,
        "sources": chosen_sources,
        "countries": chosen_countries,
        "start_year": start,
        "end_year": end,
        "records_processed": 0,
        "raw_written": 0,
        "cleaned_written": 0,
        "features_written": 0,
        "research_written": 0,
        "artifacts_written": 0,
        "errors": [],
    }
    _runs[run_id] = summary

    observations: list[MacroObservation] = []

    if "world_bank" in chosen_sources:
        wb = WorldBankClient()
        indicator_map = {
            code: DEFAULT_WORLD_BANK_INDICATORS.get(code, (code, "macro"))
            for code in (world_bank_indicators or list(DEFAULT_WORLD_BANK_INDICATORS))
        }
        for code, (name, category) in indicator_map.items():
            try:
                async for obs in wb.iter_indicator(
                    code,
                    countries=chosen_countries,
                    start_year=start,
                    end_year=end,
                    indicator_name=name,
                    indicator_category=category,
                ):
                    observations.append(obs)
            except Exception as exc:
                log.warning("open_macro.world_bank_indicator_failed", indicator=code, error=str(exc))
                summary["errors"].append({"source": "world_bank", "indicator": code, "error": str(exc)})

    if "imf_datamapper" in chosen_sources:
        imf = ImfDataMapperClient(timeout_s=45.0, min_interval_s=0.5)
        indicator_map = {
            code: DEFAULT_IMF_INDICATORS.get(code, (code, "macro"))
            for code in (imf_indicators or list(DEFAULT_IMF_INDICATORS))
        }
        periods = list(range(start, end + 1))
        for code, (name, category) in indicator_map.items():
            try:
                async for obs in imf.iter_indicator(
                    code,
                    countries=chosen_countries,
                    periods=periods,
                    indicator_name=name,
                    indicator_category=category,
                ):
                    observations.append(obs)
            except Exception as exc:
                log.warning("open_macro.imf_indicator_failed", indicator=code, error=str(exc))
                summary["errors"].append({"source": "imf_datamapper", "indicator": code, "error": str(exc)})

    if "dbnomics" in chosen_sources:
        dbn = DbnomicsClient(timeout_s=45.0, min_interval_s=0.5)
        try:
            async for obs in dbn.iter_series(dbnomics_series_ids or DEFAULT_DBNOMICS_SERIES):
                obs_date = obs.observation_date
                if obs_date and start <= obs_date.year <= end:
                    observations.append(obs)
        except Exception as exc:
            log.warning("open_macro.dbnomics_failed", error=str(exc))
            summary["errors"].append({"source": "dbnomics", "error": str(exc)})

    raw_rows = _raw_rows(observations, now)
    cleaned_rows = _cleaned_rows(observations, now)
    feature_rows, research_rows, artifact_rows = _country_intelligence(cleaned_rows, now)

    bq = get_bigquery_client()
    write_plan = [
        ("raw", fully_qualified(settings.BQ_DATASET_RAW_PUBLIC, "open_macro_raw"), raw_rows, "id"),
        ("cleaned", fully_qualified(settings.BQ_DATASET_CLEANED, "global_indicators_cleaned"), cleaned_rows, "id"),
        ("features", fully_qualified(settings.BQ_DATASET_FEATURES, "country_regime_features"), feature_rows, "id"),
        ("research", fully_qualified(settings.BQ_DATASET_RESEARCH, "country_macro_observations"), research_rows, "id"),
        ("artifacts", fully_qualified(settings.BQ_DATASET_ARTIFACTS, "macro_artifacts"), artifact_rows, "artifact_id"),
    ]

    for label, table, rows, key in write_plan:
        if not rows:
            continue
        try:
            written = _merge_rows(bq, table, rows, key, run_id)
            summary[f"{label}_written"] = written
        except Exception as exc:
            log.error("open_macro.bq_write_failed", table=table, error=str(exc))
            summary["errors"].append({"table": table, "error": str(exc)})

    summary["records_processed"] = sum(
        int(summary[k])
        for k in ("raw_written", "cleaned_written", "features_written", "research_written", "artifacts_written")
    )
    summary["status"] = "completed" if not summary["errors"] else "completed_with_errors"
    summary["completed_at"] = _iso(_now())
    log.info(
        "open_macro.complete",
        run_id=run_id,
        raw=summary["raw_written"],
        cleaned=summary["cleaned_written"],
        features=summary["features_written"],
        errors=len(summary["errors"]),
    )
    return summary


def _raw_rows(observations: Iterable[MacroObservation], now: datetime) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    now_iso = _iso(now)
    for obs in observations:
        obs_date = obs.observation_date
        rows.append({
            "id": obs.deterministic_id,
            "provider": obs.provider,
            "source_dataset": obs.source_dataset,
            "source_series_id": obs.source_series_id,
            "indicator_code": obs.indicator_code,
            "indicator_name": obs.indicator_name,
            "indicator_category": obs.indicator_category,
            "country_code": obs.country_iso3 or obs.country_iso2,
            "country_iso2": obs.country_iso2,
            "country_iso3": obs.country_iso3,
            "country_name": obs.country_name or COUNTRY_NAMES.get(obs.country_iso3 or ""),
            "region": obs.region,
            "frequency": obs.frequency,
            "unit": obs.unit,
            "period": obs.period,
            "period_start": _date_iso(obs_date),
            "period_end": _date_iso(obs_date),
            "value": obs.value,
            "value_text": obs.value_text,
            "vintage_date": obs.vintage_date,
            "is_forecast": obs.is_forecast,
            "source_url": obs.source_url,
            "request_url": obs.request_url,
            "raw_payload": _jsonable(obs.raw_payload),
            "metadata": _jsonable(obs.metadata),
            "ingestion_time": now_iso,
            "observation_time": f"{obs_date.isoformat()}T00:00:00+00:00" if obs_date else None,
            "data_quality_score": 1.0 if obs.value is not None else 0.4,
            "lineage_id": f"open_macro:{obs.provider}:{obs.deterministic_id[:16]}",
            "created_at": now_iso,
            "updated_at": now_iso,
        })
    return rows


def _cleaned_rows(observations: Iterable[MacroObservation], now: datetime) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str], list[MacroObservation]] = defaultdict(list)
    for obs in observations:
        grouped[(obs.provider, obs.indicator_code, obs.country_iso3 or obs.country_iso2 or "GLOBAL")].append(obs)

    rows: list[dict[str, Any]] = []
    now_iso = _iso(now)
    for (_provider, _indicator, _country), items in grouped.items():
        items_sorted = sorted(items, key=lambda o: o.observation_date or date.min)
        prev_by_year: dict[int, float] = {}
        prev_value: Optional[float] = None
        for obs in items_sorted:
            obs_date = obs.observation_date
            year = obs_date.year if obs_date else None
            yoy = None
            period_change = None
            if obs.value is not None:
                if year is not None and (year - 1) in prev_by_year and prev_by_year[year - 1] != 0:
                    yoy = (obs.value - prev_by_year[year - 1]) / prev_by_year[year - 1]
                if prev_value not in (None, 0):
                    period_change = (obs.value - prev_value) / prev_value
                if year is not None:
                    prev_by_year[year] = obs.value
                prev_value = obs.value
            dedup_hash = _stable_hash(obs.provider, obs.indicator_code, obs.country_iso3, obs.period)
            rows.append({
                "id": dedup_hash,
                "provider": obs.provider,
                "source_dataset": obs.source_dataset,
                "source_series_id": obs.source_series_id,
                "indicator_code": obs.indicator_code,
                "indicator_name": obs.indicator_name,
                "indicator_category": obs.indicator_category,
                "country_iso2": obs.country_iso2,
                "country_iso3": obs.country_iso3,
                "country_name": obs.country_name or COUNTRY_NAMES.get(obs.country_iso3 or ""),
                "region": obs.region,
                "frequency": obs.frequency,
                "unit": obs.unit,
                "period": obs.period,
                "period_start": _date_iso(obs_date),
                "period_end": _date_iso(obs_date),
                "observation_time": f"{obs_date.isoformat()}T00:00:00+00:00" if obs_date else None,
                "value": obs.value,
                "yoy_change": yoy,
                "period_change": period_change,
                "is_forecast": obs.is_forecast,
                "data_quality_score": 1.0 if obs.value is not None else 0.4,
                "lineage_id": f"open_macro:{obs.provider}:{dedup_hash[:16]}",
                "dedup_hash": dedup_hash,
                "metadata": _jsonable(obs.metadata),
                "created_at": now_iso,
                "updated_at": now_iso,
            })
    return rows


def _country_intelligence(
    cleaned_rows: list[dict[str, Any]],
    now: datetime,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    latest: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for row in cleaned_rows:
        country = row.get("country_iso3")
        category = row.get("indicator_category") or "macro"
        if not country or row.get("value") is None:
            continue
        current = latest[country].get(category)
        if current is None or str(row.get("period") or "") > str(current.get("period") or ""):
            latest[country][category] = row

    feature_rows: list[dict[str, Any]] = []
    research_rows: list[dict[str, Any]] = []
    artifact_rows: list[dict[str, Any]] = []
    now_iso = _iso(now)
    as_of = now.date().isoformat()

    for country, by_category in latest.items():
        country_name = COUNTRY_NAMES.get(country) or by_category[next(iter(by_category))].get("country_name") or country
        evidence = {
            category: {
                "indicator_code": row.get("indicator_code"),
                "indicator_name": row.get("indicator_name"),
                "period": row.get("period"),
                "value": row.get("value"),
                "unit": row.get("unit"),
                "provider": row.get("provider"),
            }
            for category, row in by_category.items()
        }
        growth_state = _growth_state(_value(by_category.get("growth")))
        inflation_state = _inflation_state(_value(by_category.get("inflation")))
        debt_state = _debt_state(_value(by_category.get("debt")))
        external_state = _external_state(_value(by_category.get("external")))
        employment_state = _employment_state(_value(by_category.get("employment")))
        risk_score = _risk_score(growth_state, inflation_state, debt_state, external_state, employment_state)
        coverage = min(1.0, len(by_category) / 5)
        providers = sorted({str(row.get("provider")) for row in by_category.values() if row.get("provider")})
        severity = "high" if risk_score >= 0.7 else "medium" if risk_score >= 0.45 else "low"
        state = _dominant_state(growth_state, inflation_state, debt_state, external_state, employment_state)
        related_symbols = COUNTRY_ETF_MAP.get(country, [])
        periods = [str(row.get("period")) for row in by_category.values() if row.get("period")]
        latest_period = max(periods) if periods else None
        row_id = _stable_hash("country_regime", country, as_of)

        feature_rows.append({
            "id": row_id,
            "country_iso3": country,
            "country_name": country_name,
            "as_of_date": as_of,
            "latest_period": latest_period,
            "growth_state": growth_state,
            "inflation_state": inflation_state,
            "debt_state": debt_state,
            "external_state": external_state,
            "employment_state": employment_state,
            "composite_risk_score": risk_score,
            "data_coverage": coverage,
            "indicator_count": len(by_category),
            "evidence": evidence,
            "source_providers": providers,
            "created_at": now_iso,
            "updated_at": now_iso,
        })

        title = f"{country_name} Macro Regime: {state.replace('_', ' ').title()}"
        summary = (
            f"{country_name} screens {growth_state or 'unknown'} growth, "
            f"{inflation_state or 'unknown'} inflation, and {debt_state or 'unknown'} debt. "
            f"Composite sovereign macro risk score {risk_score:.2f}."
        )
        body = "\n".join(
            f"- {category}: {data['indicator_name']} = {data['value']} {data.get('unit') or ''} ({data['period']}, {data['provider']})"
            for category, data in sorted(evidence.items())
        )

        research_rows.append({
            "id": _stable_hash("country_macro_observation", country, as_of),
            "country_iso3": country,
            "country_name": country_name,
            "observation_type": "country_macro_regime",
            "regime_state": state,
            "title": title,
            "summary": summary,
            "body": body,
            "related_indicators": sorted({str(row.get("indicator_code")) for row in by_category.values()}),
            "related_symbols": related_symbols,
            "tags": ["macro", "sovereign", "country", severity],
            "severity": severity,
            "confidence": coverage,
            "observation_time": now_iso,
            "lineage_id": f"open_macro:country_regime:{country}:{as_of}",
            "created_at": now_iso,
            "updated_at": now_iso,
        })

        artifact_rows.append({
            "artifact_id": _stable_hash("open_macro_artifact", country, as_of),
            "artifact_type": "country_macro_regime",
            "title": title,
            "summary": summary,
            "symbol": related_symbols[0] if related_symbols else None,
            "related_symbols": related_symbols,
            "evidence": evidence,
            "metrics": {"composite_risk_score": risk_score, "data_coverage": coverage},
            "confidence": coverage,
            "severity": severity,
            "source_tables": [
                fully_qualified(settings.BQ_DATASET_CLEANED, "global_indicators_cleaned"),
                fully_qualified(settings.BQ_DATASET_FEATURES, "country_regime_features"),
            ],
            "lineage_id": f"open_macro:artifact:{country}:{as_of}",
            "is_test": False,
            "created_at": now_iso,
            "updated_at": now_iso,
        })

    return feature_rows, research_rows, artifact_rows


def _merge_rows(
    bq: bigquery.Client,
    target_table: str,
    rows: list[dict[str, Any]],
    key_field: str,
    run_id: str,
) -> int:
    if not rows:
        return 0
    target = bq.get_table(target_table)
    safe_run = "".join(ch if ch.isalnum() else "_" for ch in run_id)[:32]
    temp_table = f"{settings.GCP_PROJECT_ID}.{settings.BQ_DATASET_OPS}._stage_{target.table_id}_{safe_run}"
    job_config = bigquery.LoadJobConfig(
        schema=target.schema,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
    )
    load_job = bq.load_table_from_json(rows, temp_table, job_config=job_config)
    load_job.result()
    field_names = [field.name for field in target.schema]
    update_fields = [name for name in field_names if name != key_field]
    set_clause = ", ".join(f"T.`{name}` = S.`{name}`" for name in update_fields)
    insert_cols = ", ".join(f"`{name}`" for name in field_names)
    insert_vals = ", ".join(f"S.`{name}`" for name in field_names)
    merge_sql = f"""
        MERGE `{target_table}` T
        USING `{temp_table}` S
        ON T.`{key_field}` = S.`{key_field}`
        WHEN MATCHED THEN UPDATE SET {set_clause}
        WHEN NOT MATCHED THEN INSERT ({insert_cols}) VALUES ({insert_vals})
    """
    bq.query(merge_sql).result()
    bq.delete_table(temp_table, not_found_ok=True)
    return len(rows)


def _value(row: Optional[dict[str, Any]]) -> Optional[float]:
    if not row:
        return None
    try:
        return float(row["value"]) if row.get("value") is not None else None
    except (TypeError, ValueError):
        return None


def _growth_state(value: Optional[float]) -> Optional[str]:
    if value is None:
        return None
    if value < 0:
        return "contraction"
    if value < 1:
        return "stall_speed"
    if value < 3:
        return "steady"
    return "expansion"


def _inflation_state(value: Optional[float]) -> Optional[str]:
    if value is None:
        return None
    if value < 0:
        return "deflation"
    if value < 3:
        return "contained"
    if value < 8:
        return "elevated"
    return "high"


def _debt_state(value: Optional[float]) -> Optional[str]:
    if value is None:
        return None
    if value < 60:
        return "contained"
    if value < 100:
        return "watch"
    return "stressed"


def _external_state(value: Optional[float]) -> Optional[str]:
    if value is None:
        return None
    if value <= -3:
        return "deficit_pressure"
    if value >= 2:
        return "surplus_buffer"
    return "balanced"


def _employment_state(value: Optional[float]) -> Optional[str]:
    if value is None:
        return None
    if value < 4:
        return "tight"
    if value < 8:
        return "balanced"
    return "slack"


def _risk_score(*states: Optional[str]) -> float:
    weights = {
        "contraction": 0.9,
        "stall_speed": 0.55,
        "high": 0.85,
        "elevated": 0.55,
        "stressed": 0.8,
        "watch": 0.5,
        "deficit_pressure": 0.6,
        "slack": 0.45,
        "deflation": 0.55,
    }
    vals = [weights.get(s, 0.2) for s in states if s]
    return round(sum(vals) / len(vals), 4) if vals else 0.0


def _dominant_state(*states: Optional[str]) -> str:
    for state in states:
        if state in {"contraction", "high", "stressed", "deficit_pressure"}:
            return state
    for state in states:
        if state in {"stall_speed", "elevated", "watch", "slack"}:
            return state
    return "stable"
