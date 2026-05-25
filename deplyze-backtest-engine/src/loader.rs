//! Parquet loading and causal feature construction.
//!
//! The Python export pipeline (Part B) writes a **wide, daily, forward-filled**
//! parquet to GCS keyed by `date` (YYYY-MM-DD). Each row carries:
//!   * the backtest instrument's `asset_close` / `asset_return` (from
//!     `ohlcv_cleaned` / `returns_features`), and
//!   * raw FRED macro series columns (pivoted from the long `macro_cleaned`
//!     table — e.g. `DGS10`, `DGS2`, `WALCL`, `RRPONTSYD`, `M2SL`, `DTWEXBGS`,
//!     `CPILFESL`, `PCEPILFE`, `T10YIE`).
//!
//! This module is deliberately the *only* place feature engineering happens for
//! the HMM. We construct regime features here — not in Python — so the
//! no-look-ahead guarantee lives next to the execution core. All standardization
//! is **causal** (expanding mean/std using only observations up to and including
//! the current bar); nothing peeks at the future.
//!
//! If the expected object is absent or empty the loader returns
//! [`LoaderError::ParquetNotReady`], which the API surfaces as `PARQUET_NOT_READY`
//! — we never fabricate market data.

use std::collections::HashMap;
use std::sync::Arc;

use arrow::array::{Array, Date32Array, Float64Array, Int64Array, StringArray, TimestampMicrosecondArray, TimestampMillisecondArray};
use arrow::datatypes::{DataType, TimeUnit};
use bytes::Bytes;
use chrono::{Datelike, NaiveDate};
use nalgebra::DVector;
use object_store::{path::Path as ObjPath, ObjectStore};
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;

const EPOCH_DAYS_OFFSET: i64 = 719_163; // days from 0000-12-31 proleptic? use chrono instead

#[derive(Debug, thiserror::Error)]
pub enum LoaderError {
    #[error("PARQUET_NOT_READY")]
    ParquetNotReady,
    #[error("parquet decode error: {0}")]
    Decode(String),
    #[error("missing required column: {0}")]
    MissingColumn(String),
    #[error("object store error: {0}")]
    Store(String),
    #[error("empty or malformed dataset")]
    Empty,
}

/// A wide, date-indexed table of f64 feature columns. Missing/null cells are
/// stored as `f64::NAN`; downstream code must treat NaN as "no observation".
#[derive(Debug, Clone)]
pub struct MarketData {
    pub dates: Vec<String>, // YYYY-MM-DD, ascending
    pub columns: HashMap<String, Vec<f64>>,
    pub n: usize,
}

impl MarketData {
    pub fn column(&self, name: &str) -> Option<&[f64]> {
        self.columns.get(name).map(|v| v.as_slice())
    }

    pub fn has(&self, name: &str) -> bool {
        self.columns.contains_key(name)
    }

    /// Daily simple returns for the traded instrument. Prefers a precomputed
    /// `asset_return` column; otherwise derives from `asset_close`.
    pub fn asset_returns(&self) -> Result<Vec<f64>, LoaderError> {
        if let Some(r) = self.column("asset_return") {
            return Ok(r.to_vec());
        }
        let close = self
            .column("asset_close")
            .ok_or_else(|| LoaderError::MissingColumn("asset_close|asset_return".into()))?;
        let mut out = vec![0.0; self.n];
        for t in 1..self.n {
            let p0 = close[t - 1];
            let p1 = close[t];
            out[t] = if p0.is_finite() && p1.is_finite() && p0 != 0.0 {
                p1 / p0 - 1.0
            } else {
                0.0
            };
        }
        Ok(out)
    }

    /// Adjusted close for momentum-baseline construction.
    pub fn asset_close(&self) -> Option<&[f64]> {
        self.column("asset_close")
    }
}

// ─── Object loading ─────────────────────────────────────────────────────────────

/// Load wide parquet bytes from a GCS bucket. Returns `ParquetNotReady` if the
/// object does not exist or is empty.
pub async fn fetch_gcs_bytes(bucket: &str, object: &str) -> Result<Bytes, LoaderError> {
    let store = object_store::gcp::GoogleCloudStorageBuilder::from_env()
        .with_bucket_name(bucket)
        .build()
        .map_err(|e| LoaderError::Store(e.to_string()))?;
    let path = ObjPath::from(object);
    match store.get(&path).await {
        Ok(res) => {
            let bytes = res
                .bytes()
                .await
                .map_err(|e| LoaderError::Store(e.to_string()))?;
            if bytes.is_empty() {
                Err(LoaderError::ParquetNotReady)
            } else {
                Ok(bytes)
            }
        }
        Err(object_store::Error::NotFound { .. }) => Err(LoaderError::ParquetNotReady),
        Err(e) => Err(LoaderError::Store(e.to_string())),
    }
}

/// Read a parquet file from local disk (dev / test path).
pub fn load_from_path(path: &str) -> Result<MarketData, LoaderError> {
    let bytes = std::fs::read(path).map_err(|e| LoaderError::Store(e.to_string()))?;
    if bytes.is_empty() {
        return Err(LoaderError::ParquetNotReady);
    }
    parse_wide_parquet(Bytes::from(bytes))
}

/// Decode wide parquet bytes into a date-indexed [`MarketData`].
pub fn parse_wide_parquet(bytes: Bytes) -> Result<MarketData, LoaderError> {
    let builder = ParquetRecordBatchReaderBuilder::try_new(bytes)
        .map_err(|e| LoaderError::Decode(e.to_string()))?;
    let schema = builder.schema().clone();
    let reader = builder.build().map_err(|e| LoaderError::Decode(e.to_string()))?;

    let mut dates: Vec<String> = Vec::new();
    let mut columns: HashMap<String, Vec<f64>> = HashMap::new();

    // Identify the date column once.
    let date_field = schema
        .fields()
        .iter()
        .find(|f| {
            let n = f.name().to_lowercase();
            n == "date" || n == "observation_date" || n == "ts" || n == "observation_time"
        })
        .map(|f| f.name().clone())
        .ok_or_else(|| LoaderError::MissingColumn("date".into()))?;

    for batch in reader {
        let batch = batch.map_err(|e| LoaderError::Decode(e.to_string()))?;
        let schema = batch.schema();

        // Date column → Vec<String>.
        let col_idx = schema
            .index_of(&date_field)
            .map_err(|e| LoaderError::Decode(e.to_string()))?;
        let date_col = batch.column(col_idx);
        append_dates(date_col, &mut dates)?;

        // All numeric columns → f64.
        for (i, field) in schema.fields().iter().enumerate() {
            if field.name() == &date_field {
                continue;
            }
            let arr = batch.column(i);
            if let Some(vals) = array_to_f64(arr) {
                columns.entry(field.name().clone()).or_default().extend(vals);
            }
        }
    }

    let n = dates.len();
    if n == 0 {
        return Err(LoaderError::Empty);
    }
    // Guard ragged columns (shouldn't happen with well-formed parquet).
    columns.retain(|_, v| v.len() == n);
    Ok(MarketData { dates, columns, n })
}

fn append_dates(arr: &Arc<dyn Array>, out: &mut Vec<String>) -> Result<(), LoaderError> {
    match arr.data_type() {
        DataType::Utf8 => {
            let a = arr.as_any().downcast_ref::<StringArray>().unwrap();
            for i in 0..a.len() {
                out.push(if a.is_null(i) { String::new() } else { a.value(i).to_string() });
            }
        }
        DataType::Date32 => {
            let a = arr.as_any().downcast_ref::<Date32Array>().unwrap();
            for i in 0..a.len() {
                out.push(date32_to_string(a.value(i)));
            }
        }
        DataType::Timestamp(TimeUnit::Millisecond, _) => {
            let a = arr.as_any().downcast_ref::<TimestampMillisecondArray>().unwrap();
            for i in 0..a.len() {
                out.push(epoch_ms_to_date(a.value(i)));
            }
        }
        DataType::Timestamp(TimeUnit::Microsecond, _) => {
            let a = arr.as_any().downcast_ref::<TimestampMicrosecondArray>().unwrap();
            for i in 0..a.len() {
                out.push(epoch_ms_to_date(a.value(i) / 1000));
            }
        }
        DataType::Int64 => {
            // Treat as epoch days fallback.
            let a = arr.as_any().downcast_ref::<Int64Array>().unwrap();
            for i in 0..a.len() {
                out.push(date32_to_string(a.value(i) as i32));
            }
        }
        other => return Err(LoaderError::Decode(format!("unsupported date type {other:?}"))),
    }
    Ok(())
}

fn date32_to_string(days_since_epoch: i32) -> String {
    let _ = EPOCH_DAYS_OFFSET;
    NaiveDate::from_num_days_from_ce_opt(days_since_epoch + 719_163)
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_default()
}

fn epoch_ms_to_date(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    chrono::DateTime::from_timestamp(secs, 0)
        .map(|dt| dt.date_naive().format("%Y-%m-%d").to_string())
        .unwrap_or_default()
}

/// Convert any numeric Arrow array to `Vec<f64>` (nulls → NaN). Non-numeric
/// columns return `None` and are dropped.
fn array_to_f64(arr: &Arc<dyn Array>) -> Option<Vec<f64>> {
    match arr.data_type() {
        DataType::Float64 => {
            let a = arr.as_any().downcast_ref::<Float64Array>().unwrap();
            Some((0..a.len()).map(|i| if a.is_null(i) { f64::NAN } else { a.value(i) }).collect())
        }
        DataType::Int64 => {
            let a = arr.as_any().downcast_ref::<Int64Array>().unwrap();
            Some((0..a.len()).map(|i| if a.is_null(i) { f64::NAN } else { a.value(i) as f64 }).collect())
        }
        _ => None,
    }
}

// ─── Causal HMM feature construction ─────────────────────────────────────────────

/// The regime feature vector layout. Index 0 is the canonical *risk-off proxy*
/// (realized-vol z-score, higher = more risk-off), which drives canonical state
/// ordering in [`crate::regime`].
#[derive(Debug, Clone)]
pub struct HmmFeatures {
    pub features: Vec<DVector<f64>>,
    pub feature_names: Vec<String>,
    /// Index of the canonical risk-off proxy feature (passed to `HmmConfig`).
    pub risk_feature_index: usize,
}

/// Minimum warmup before a causal z-score is considered meaningful.
const WARMUP: usize = 21;
/// Realized-vol lookback for the risk proxy (trading days).
const VOL_WINDOW: usize = 21;

/// Build regime features from raw warehouse columns, fully causally.
///
/// Sub-features are included only when their source columns are present — we
/// never fabricate a series. The vol z-score (from the asset's own returns) is
/// mandatory; everything else degrades gracefully.
pub fn build_hmm_features(md: &MarketData) -> Result<HmmFeatures, LoaderError> {
    let n = md.n;
    let returns = md.asset_returns()?;

    let mut feature_names: Vec<String> = Vec::new();
    // Each entry is a per-bar series (length n) already in causal form.
    let mut series: Vec<Vec<f64>> = Vec::new();

    // 0) Realized-vol z-score (risk-off proxy) — MANDATORY, index 0.
    let rvol = rolling_realized_vol(&returns, VOL_WINDOW);
    series.push(causal_zscore(&rvol));
    feature_names.push("vol_zscore".into());
    let risk_feature_index = 0;

    // 1) Yield-curve slope (lower/negative = risk-off). Prefer the FRED spread
    //    column; else construct from DGS10 - DGS2.
    if let Some(slope) = md.column("T10Y2Y") {
        series.push(causal_zscore(slope));
        feature_names.push("yield_slope".into());
    } else if let (Some(d10), Some(d2)) = (md.column("DGS10"), md.column("DGS2")) {
        let slope: Vec<f64> = (0..n).map(|i| diff(d10[i], d2[i])).collect();
        series.push(causal_zscore(&slope));
        feature_names.push("yield_slope".into());
    }

    // 2) Liquidity composite (higher = risk-on): z(WALCL) - z(RRPONTSYD)
    //    + z(M2SL) - z(DTWEXBGS). Each leg is causally standardized first so the
    //    composite is unit-free and not dominated by the largest-magnitude series.
    let liq_legs: [(&str, f64); 4] = [
        ("WALCL", 1.0),
        ("RRPONTSYD", -1.0),
        ("M2SL", 1.0),
        ("DTWEXBGS", -1.0),
    ];
    let mut liq = vec![0.0f64; n];
    let mut liq_present = 0;
    for (col, sign) in liq_legs {
        if let Some(raw) = md.column(col) {
            let z = causal_zscore(raw);
            for i in 0..n {
                if z[i].is_finite() {
                    liq[i] += sign * z[i];
                }
            }
            liq_present += 1;
        }
    }
    if liq_present > 0 {
        series.push(causal_zscore(&liq));
        feature_names.push("liquidity_composite".into());
    }

    // 3) Inflation persistence (higher = inflationary/risk-off-ish): mean of
    //    causal z-scores of core CPI, core PCE, and 10y breakeven.
    let infl_cols = ["CPILFESL", "PCEPILFE", "T10YIE"];
    let mut infl = vec![0.0f64; n];
    let mut infl_present = 0;
    for col in infl_cols {
        if let Some(raw) = md.column(col) {
            let z = causal_zscore(raw);
            for i in 0..n {
                if z[i].is_finite() {
                    infl[i] += z[i];
                }
            }
            infl_present += 1;
        }
    }
    if infl_present > 0 {
        for v in infl.iter_mut() {
            *v /= infl_present as f64;
        }
        series.push(causal_zscore(&infl));
        feature_names.push("inflation_persistence".into());
    }

    // 4) Short-rate level / policy stance (higher = tighter): DGS2 or FEDFUNDS.
    if let Some(r) = md.column("DGS2").or_else(|| md.column("FEDFUNDS")).or_else(|| md.column("DFF")) {
        series.push(causal_zscore(r));
        feature_names.push("short_rate_z".into());
    }

    let d = series.len();
    if d < 2 {
        return Err(LoaderError::MissingColumn(
            "insufficient macro feature columns for regime model".into(),
        ));
    }

    // Assemble per-bar vectors, replacing non-finite cells (warmup/missing) with 0
    // (the causal-z mean), which is the neutral value under standardization.
    let features: Vec<DVector<f64>> = (0..n)
        .map(|i| {
            let v: Vec<f64> = series
                .iter()
                .map(|s| if s[i].is_finite() { s[i] } else { 0.0 })
                .collect();
            DVector::from_vec(v)
        })
        .collect();

    Ok(HmmFeatures { features, feature_names, risk_feature_index })
}

fn diff(a: f64, b: f64) -> f64 {
    if a.is_finite() && b.is_finite() {
        a - b
    } else {
        f64::NAN
    }
}

/// Rolling realized volatility (sample std of returns over `window`), causal.
fn rolling_realized_vol(returns: &[f64], window: usize) -> Vec<f64> {
    let n = returns.len();
    let mut out = vec![f64::NAN; n];
    for t in 0..n {
        if t + 1 < window {
            continue;
        }
        let lo = t + 1 - window;
        let slice = &returns[lo..=t];
        let m: f64 = slice.iter().filter(|x| x.is_finite()).sum::<f64>() / window as f64;
        let var: f64 = slice
            .iter()
            .filter(|x| x.is_finite())
            .map(|x| (x - m).powi(2))
            .sum::<f64>()
            / (window as f64 - 1.0);
        out[t] = var.sqrt();
    }
    out
}

/// Expanding (causal) z-score: at bar t, standardize using mean/std of x[0..=t].
/// Returns NaN until `WARMUP` finite observations have accumulated.
fn causal_zscore(x: &[f64]) -> Vec<f64> {
    let n = x.len();
    let mut out = vec![f64::NAN; n];
    let mut count = 0usize;
    let mut mean = 0.0f64;
    let mut m2 = 0.0f64; // Welford
    for t in 0..n {
        let v = x[t];
        if v.is_finite() {
            count += 1;
            let delta = v - mean;
            mean += delta / count as f64;
            m2 += delta * (v - mean);
        }
        if count >= WARMUP && v.is_finite() {
            let var = m2 / (count as f64 - 1.0);
            let sd = var.sqrt();
            out[t] = if sd > 1e-12 { (v - mean) / sd } else { 0.0 };
        }
    }
    out
}

#[allow(dead_code)]
fn year_of(date: &str) -> i32 {
    NaiveDate::parse_from_str(date, "%Y-%m-%d").map(|d| d.year()).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn synth_md(n: usize) -> MarketData {
        let mut columns = HashMap::new();
        let mut close = Vec::with_capacity(n);
        let mut walcl = Vec::with_capacity(n);
        let mut dgs10 = Vec::with_capacity(n);
        let mut dgs2 = Vec::with_capacity(n);
        let mut dates = Vec::with_capacity(n);
        let mut p = 100.0;
        for i in 0..n {
            p *= 1.0 + 0.0003 + 0.01 * ((i as f64 * 0.3).sin());
            close.push(p);
            walcl.push(8_000_000.0 + (i as f64) * 10.0);
            dgs10.push(3.5 + 0.5 * ((i as f64 * 0.05).sin()));
            dgs2.push(3.0 + 0.4 * ((i as f64 * 0.07).cos()));
            dates.push(format!("2020-01-{:02}", (i % 28) + 1));
        }
        columns.insert("asset_close".to_string(), close);
        columns.insert("WALCL".to_string(), walcl);
        columns.insert("DGS10".to_string(), dgs10);
        columns.insert("DGS2".to_string(), dgs2);
        MarketData { dates, columns, n }
    }

    #[test]
    fn causal_zscore_uses_no_future() {
        let x: Vec<f64> = (0..100).map(|i| (i as f64).sin()).collect();
        let full = causal_zscore(&x);
        for t in [30usize, 50, 80, 99] {
            let trunc = causal_zscore(&x[..=t]);
            assert!(
                (full[t] - trunc[t]).abs() < 1e-12 || (full[t].is_nan() && trunc[t].is_nan()),
                "causal z at t={t} leaked future"
            );
        }
    }

    #[test]
    fn realized_vol_is_nan_before_warmup() {
        let r = vec![0.01; 50];
        let v = rolling_realized_vol(&r, VOL_WINDOW);
        assert!(v[VOL_WINDOW - 2].is_nan());
        assert!(v[VOL_WINDOW - 1].is_finite());
    }

    #[test]
    fn builds_features_from_raw_columns() {
        let md = synth_md(200);
        let f = build_hmm_features(&md).unwrap();
        assert_eq!(f.features.len(), 200);
        assert_eq!(f.risk_feature_index, 0);
        assert_eq!(f.feature_names[0], "vol_zscore");
        // vol_zscore + yield_slope + liquidity_composite present.
        assert!(f.feature_names.len() >= 3, "{:?}", f.feature_names);
        // Every vector has uniform dimension.
        let d = f.features[0].len();
        assert!(f.features.iter().all(|v| v.len() == d));
    }

    #[test]
    fn asset_returns_derive_from_close() {
        let md = synth_md(10);
        let r = md.asset_returns().unwrap();
        assert_eq!(r.len(), 10);
        assert_eq!(r[0], 0.0);
        assert!(r[1].is_finite());
    }
}
