//! Deplyze Quant — backtesting engine HTTP service.
//!
//! Stateless Axum service that owns the entire backtest execution loop. Python
//! never touches execution; it only exports the wide parquet this service reads.
//!
//! Routes:
//!   * `GET  /health`            — liveness.
//!   * `GET  /backtest/signals`  — the signal catalog.
//!   * `POST /backtest/validate` — validate a [`StrategySpec`] without computing.
//!   * `POST /backtest/run`      — load data, fit the regime model, simulate.
//!
//! Data readiness: if the expected parquet object is missing/empty the run
//! endpoint returns HTTP 503 with `{"error":"PARQUET_NOT_READY"}`. We never
//! synthesize market data.

mod engine;
mod loader;
mod metrics;
mod models;
mod regime;
mod strategy;

#[cfg(test)]
mod e2e_tests;

use std::collections::HashMap;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use serde_json::json;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::engine::EngineInputs;
use crate::loader::{MarketData, LoaderError};
use crate::models::StrategySpec;
use crate::regime::{HmmConfig, RegimeModel};

#[derive(Clone)]
struct AppConfig {
    bucket: Option<String>,
    object: String,
    local_path: Option<String>,
}

impl AppConfig {
    fn from_env() -> Self {
        Self {
            bucket: env::var("BACKTEST_PARQUET_BUCKET").ok().filter(|s| !s.is_empty()),
            object: env::var("BACKTEST_PARQUET_OBJECT")
                .unwrap_or_else(|_| "backtest/wide_daily.parquet".to_string()),
            local_path: env::var("BACKTEST_PARQUET_LOCAL").ok().filter(|s| !s.is_empty()),
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .json()
        .init();

    let config = Arc::new(AppConfig::from_env());
    let app = Router::new()
        .route("/health", get(health))
        .route("/backtest/signals", get(signals))
        .route("/backtest/validate", post(validate_handler))
        .route("/backtest/run", post(run_handler))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(config);

    let port: u16 = env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "deplyze-backtest-engine listening");

    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("shutdown signal received");
}

// ─── Error handling ─────────────────────────────────────────────────────────────

enum ApiError {
    NotReady,
    BadRequest(String),
    Internal(String),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, msg) = match self {
            ApiError::NotReady => (
                StatusCode::SERVICE_UNAVAILABLE,
                "PARQUET_NOT_READY",
                "backtest dataset not yet exported".to_string(),
            ),
            ApiError::BadRequest(m) => (StatusCode::BAD_REQUEST, "BAD_REQUEST", m),
            ApiError::Internal(m) => (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", m),
        };
        (status, Json(json!({ "error": code, "message": msg }))).into_response()
    }
}

impl From<LoaderError> for ApiError {
    fn from(e: LoaderError) -> Self {
        match e {
            LoaderError::ParquetNotReady => ApiError::NotReady,
            other => ApiError::Internal(other.to_string()),
        }
    }
}

// ─── Handlers ───────────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct Health {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        service: "deplyze-backtest-engine",
        version: env!("CARGO_PKG_VERSION"),
    })
}

async fn signals() -> Json<models::SignalLibrary> {
    Json(strategy::signal_library())
}

async fn validate_handler(Json(spec): Json<StrategySpec>) -> Json<models::ValidationResult> {
    Json(strategy::validate(&spec))
}

async fn run_handler(
    State(cfg): State<Arc<AppConfig>>,
    Json(spec): Json<StrategySpec>,
) -> Result<Json<models::BacktestResults>, ApiError> {
    // 1) Validate before spending compute.
    let v = strategy::validate(&spec);
    if !v.valid {
        return Err(ApiError::BadRequest(format!("invalid strategy: {}", v.errors.join("; "))));
    }

    // 2) Load the wide parquet — per-instrument path if instrument is set.
    let md = load_market_data(&cfg, &spec.instrument).await?;

    // 3) Heavy compute off the async executor.
    let result = tokio::task::spawn_blocking(move || compute(spec, md))
        .await
        .map_err(|e| ApiError::Internal(format!("join error: {e}")))??;

    Ok(Json(result))
}

// ─── Orchestration ──────────────────────────────────────────────────────────────

async fn load_market_data(cfg: &AppConfig, instrument: &str) -> Result<MarketData, ApiError> {
    // Local path always takes priority (dev mode).
    if let Some(path) = &cfg.local_path {
        return Ok(loader::load_from_path(path)?);
    }
    let bucket = cfg
        .bucket
        .as_ref()
        .ok_or_else(|| ApiError::Internal("no BACKTEST_PARQUET_BUCKET or BACKTEST_PARQUET_LOCAL configured".into()))?;
    // Per-instrument parquet at instruments/{SYMBOL}.parquet; fall back to the
    // legacy single-asset object when the instrument path would be the same.
    let object = format!("instruments/{}.parquet", instrument.to_uppercase());
    let bytes = loader::fetch_gcs_bytes(bucket, &object).await;
    let bytes = match bytes {
        Ok(b) => b,
        Err(LoaderError::ParquetNotReady) => {
            // Fall back to legacy path if per-instrument file doesn't exist yet.
            loader::fetch_gcs_bytes(bucket, &cfg.object).await?
        }
        Err(e) => return Err(e.into()),
    };
    loader::parse_wide_parquet(bytes).map_err(Into::into)
}

/// The synchronous core: slice to the requested window, fit the regime model on
/// causal features, decode filtered labels, resolve signals, and simulate.
fn compute(spec: StrategySpec, md: MarketData) -> Result<models::BacktestResults, ApiError> {
    let md = slice_to_range(&md, &spec.date_range.start_date, &spec.date_range.end_date);
    if md.n < 60 {
        return Err(ApiError::BadRequest(format!(
            "insufficient data in window: {} bars (need >= 60)",
            md.n
        )));
    }

    // Causal HMM features → fit → decode (filtered = causal labels).
    let feats = loader::build_hmm_features(&md).map_err(ApiError::from)?;

    // Expose the engine's own causally-derived features (vol_zscore,
    // liquidity_composite, inflation_persistence, ...) into the signal
    // namespace so derived signals resolve from these no-look-ahead series
    // rather than from columns Python would have to recompute (and risk
    // leaking the future). Raw FRED columns from the parquet remain available.
    let mut md = md;
    for (j, name) in feats.feature_names.iter().enumerate() {
        let col: Vec<f64> = feats.features.iter().map(|v| v[j]).collect();
        md.columns.entry(name.clone()).or_insert(col);
    }

    let cfg = HmmConfig {
        risk_feature_index: feats.risk_feature_index,
        higher_is_risk_off: true,
        ..HmmConfig::default()
    };
    let model = RegimeModel::fit(&feats.features, &cfg);
    let regime = model.decode(&feats.features);

    // Resolve signal series and run.
    let returns = md.asset_returns().map_err(ApiError::from)?;
    let signal_series = strategy::resolve_signal_series(&spec, &md, &regime)
        .map_err(ApiError::BadRequest)?;

    let asset_close = md.asset_close();
    let inputs = EngineInputs {
        spec: &spec,
        dates: &md.dates,
        returns: &returns,
        regime: &regime,
        signal_series,
        asset_close,
    };
    Ok(engine::run(&inputs))
}

/// Filter rows to [start, end] inclusive (string compare works on YYYY-MM-DD).
fn slice_to_range(md: &MarketData, start: &str, end: &str) -> MarketData {
    let keep: Vec<usize> = md
        .dates
        .iter()
        .enumerate()
        .filter(|(_, d)| d.as_str() >= start && d.as_str() <= end)
        .map(|(i, _)| i)
        .collect();
    let dates: Vec<String> = keep.iter().map(|&i| md.dates[i].clone()).collect();
    let mut columns: HashMap<String, Vec<f64>> = HashMap::new();
    for (name, col) in &md.columns {
        columns.insert(name.clone(), keep.iter().map(|&i| col[i]).collect());
    }
    let n = dates.len();
    MarketData { dates, columns, n }
}
