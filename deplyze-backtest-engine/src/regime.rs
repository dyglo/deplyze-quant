//! Regime partitioning via a full-covariance Gaussian Hidden Markov Model.
//!
//! Three latent states are mapped to the canonical macro regimes
//! `[risk_on, transitional, risk_off]`. The model is trained with Baum-Welch
//! (EM) entirely in log-space (log-sum-exp) for numerical stability, with
//! full-covariance Gaussian emissions, ridge-regularized covariances, and
//! k-means++ multi-restart initialization that keeps the run with the best
//! data log-likelihood.
//!
//! Two posterior products are exposed and they are deliberately different:
//!   * [`RegimeModel::filtered_posteriors`] — **causal** P(state_t | obs_1..t),
//!     computed by forward filtering only. These are the labels the backtest is
//!     allowed to trade on; they contain no look-ahead.
//!   * [`RegimeModel::viterbi_path`] — the smoothed most-likely path, which uses
//!     the whole series and is for post-hoc analysis / display only.
//!
//! Determinism: the RNG is a seeded SplitMix64 and the final states are sorted
//! into canonical order, so repeated fits on identical data are bit-identical.

use nalgebra::{Cholesky, DMatrix, DVector};

const LN_2PI: f64 = 1.837_877_066_409_345_5; // ln(2π)
const NEG_INF: f64 = f64::NEG_INFINITY;

// ─── Configuration ────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct HmmConfig {
    pub n_states: usize,
    pub max_iters: usize,
    pub tol: f64,
    pub n_restarts: usize,
    /// Diagonal loading added to every covariance each M-step. Guards against
    /// singular emissions when a state collapses onto near-collinear features.
    pub cov_ridge: f64,
    pub seed: u64,
    /// Feature index used to order states into canonical regimes.
    pub risk_feature_index: usize,
    /// If true, a *higher* value of `risk_feature_index` denotes more risk-off
    /// (e.g. realized vol, credit spread). If false, higher = more risk-on
    /// (e.g. liquidity composite). Drives canonical ordering only.
    pub higher_is_risk_off: bool,
}

impl Default for HmmConfig {
    fn default() -> Self {
        Self {
            n_states: 3,
            max_iters: 200,
            tol: 1e-6,
            n_restarts: 8,
            cov_ridge: 1e-6,
            seed: 0x5DEE_CE66_D1CE_4B9D,
            risk_feature_index: 0,
            higher_is_risk_off: true,
        }
    }
}

// ─── Deterministic RNG (SplitMix64) ─────────────────────────────────────────────

struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    fn new(seed: u64) -> Self {
        Self { state: seed }
    }
    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    /// Uniform in [0, 1).
    fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }
}

// ─── Gaussian emission component ───────────────────────────────────────────────

#[derive(Debug, Clone)]
struct Gaussian {
    mean: DVector<f64>,
    cov: DMatrix<f64>,
    chol: Cholesky<f64, nalgebra::Dyn>,
    log_norm_const: f64, // -0.5*(d*ln(2π) + ln|Σ|)
}

impl Gaussian {
    fn new(mean: DVector<f64>, mut cov: DMatrix<f64>, ridge: f64) -> Self {
        let d = mean.len();
        // Ridge-regularize then Cholesky; escalate ridge if not PD.
        let mut load = ridge;
        let chol = loop {
            let mut c = cov.clone();
            for i in 0..d {
                c[(i, i)] += load;
            }
            if let Some(ch) = Cholesky::new(c.clone()) {
                cov = c;
                break ch;
            }
            load = if load <= 0.0 { 1e-8 } else { load * 10.0 };
            if load > 1e3 {
                // Degenerate; fall back to scaled identity to keep the model alive.
                cov = DMatrix::identity(d, d);
                break Cholesky::new(cov.clone()).expect("identity is PD");
            }
        };
        // ln|Σ| = 2·Σ ln(L_ii)
        let log_det: f64 = chol.l().diagonal().iter().map(|v| v.ln()).sum::<f64>() * 2.0;
        let log_norm_const = -0.5 * (d as f64 * LN_2PI + log_det);
        Self { mean, cov, chol, log_norm_const }
    }

    /// log N(x | μ, Σ).
    fn logpdf(&self, x: &DVector<f64>) -> f64 {
        let diff = x - &self.mean;
        // Solve Σ z = diff via Cholesky, then Mahalanobis = diffᵀ z.
        let z = self.chol.solve(&diff);
        let maha = diff.dot(&z);
        self.log_norm_const - 0.5 * maha
    }
}

// ─── Fitted model ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct RegimeModel {
    n_states: usize,
    log_init: Vec<f64>,           // log π
    log_trans: Vec<Vec<f64>>,     // log A[i][j]
    emissions: Vec<Gaussian>,
    /// Maps the fitted (arbitrary) state index → canonical regime index
    /// (0 = risk_on, 1 = transitional, 2 = risk_off).
    pub log_likelihood: f64,
}

/// Result of decoding a series with a fitted [`RegimeModel`].
#[derive(Debug, Clone)]
pub struct RegimeLabels {
    /// Causal P(state_t | obs_1..t), already in canonical regime order.
    pub filtered: Vec<Vec<f64>>,
    /// Causal argmax label per bar (the value the backtest trades on).
    pub filtered_state: Vec<u8>,
    /// Smoothed Viterbi path (analysis only — uses the full series).
    pub viterbi: Vec<u8>,
}

// ─── log-sum-exp ────────────────────────────────────────────────────────────────

fn logsumexp(xs: &[f64]) -> f64 {
    let m = xs.iter().cloned().fold(NEG_INF, f64::max);
    if m == NEG_INF {
        return NEG_INF;
    }
    let s: f64 = xs.iter().map(|&x| (x - m).exp()).sum();
    m + s.ln()
}

// ─── Public entry point ─────────────────────────────────────────────────────────

impl RegimeModel {
    /// Fit a Gaussian HMM to `obs` (one `DVector` per bar) with multi-restart
    /// Baum-Welch, keeping the restart with the highest data log-likelihood.
    pub fn fit(obs: &[DVector<f64>], cfg: &HmmConfig) -> Self {
        assert!(!obs.is_empty(), "cannot fit HMM on empty observation series");
        let k = cfg.n_states;
        let mut rng = SplitMix64::new(cfg.seed);

        let mut best: Option<RegimeModel> = None;
        for _ in 0..cfg.n_restarts.max(1) {
            let init = kmeanspp_init(obs, k, cfg.cov_ridge, &mut rng);
            let model = baum_welch(obs, init, cfg);
            let better = match &best {
                None => true,
                Some(b) => model.log_likelihood > b.log_likelihood,
            };
            if better {
                best = Some(model);
            }
        }
        let mut model = best.expect("at least one restart");
        model.reorder_canonical(cfg);
        model
    }

    /// Decode a (possibly out-of-sample) series: causal filtered posteriors plus
    /// the smoothed Viterbi path. Filtered labels carry no look-ahead.
    pub fn decode(&self, obs: &[DVector<f64>]) -> RegimeLabels {
        let log_b = self.log_emissions(obs);
        let filtered = self.forward_filter(&log_b);
        let filtered_state = filtered
            .iter()
            .map(|p| argmax(p) as u8)
            .collect::<Vec<_>>();
        let viterbi = self.viterbi(&log_b).into_iter().map(|s| s as u8).collect();
        RegimeLabels { filtered, filtered_state, viterbi }
    }

    /// Causal P(state_t | obs_1..t) using scaled forward filtering only.
    pub fn filtered_posteriors(&self, obs: &[DVector<f64>]) -> Vec<Vec<f64>> {
        let log_b = self.log_emissions(obs);
        self.forward_filter(&log_b)
    }

    /// Smoothed most-likely state path (analysis only).
    pub fn viterbi_path(&self, obs: &[DVector<f64>]) -> Vec<u8> {
        let log_b = self.log_emissions(obs);
        self.viterbi(&log_b).into_iter().map(|s| s as u8).collect()
    }

    // ── internals ──

    fn log_emissions(&self, obs: &[DVector<f64>]) -> Vec<Vec<f64>> {
        obs.iter()
            .map(|x| self.emissions.iter().map(|g| g.logpdf(x)).collect())
            .collect()
    }

    /// Normalized forward filter: returns P(state_t | obs_1..t) per bar.
    fn forward_filter(&self, log_b: &[Vec<f64>]) -> Vec<Vec<f64>> {
        let k = self.n_states;
        let t_len = log_b.len();
        let mut out = Vec::with_capacity(t_len);
        // log α̃_t (unnormalized in log-space), renormalized each step for posterior.
        let mut log_alpha = vec![NEG_INF; k];
        for t in 0..t_len {
            if t == 0 {
                for j in 0..k {
                    log_alpha[j] = self.log_init[j] + log_b[0][j];
                }
            } else {
                let prev = log_alpha.clone();
                for j in 0..k {
                    let mut terms = vec![NEG_INF; k];
                    for i in 0..k {
                        terms[i] = prev[i] + self.log_trans[i][j];
                    }
                    log_alpha[j] = logsumexp(&terms) + log_b[t][j];
                }
            }
            let norm = logsumexp(&log_alpha);
            let post: Vec<f64> = (0..k).map(|j| (log_alpha[j] - norm).exp()).collect();
            out.push(post);
            // Keep log_alpha normalized to avoid underflow over long series.
            for j in 0..k {
                log_alpha[j] -= norm;
            }
        }
        out
    }

    fn viterbi(&self, log_b: &[Vec<f64>]) -> Vec<usize> {
        let k = self.n_states;
        let t_len = log_b.len();
        if t_len == 0 {
            return vec![];
        }
        let mut delta = vec![vec![NEG_INF; k]; t_len];
        let mut psi = vec![vec![0usize; k]; t_len];
        for j in 0..k {
            delta[0][j] = self.log_init[j] + log_b[0][j];
        }
        for t in 1..t_len {
            for j in 0..k {
                let mut best_val = NEG_INF;
                let mut best_i = 0;
                for i in 0..k {
                    let v = delta[t - 1][i] + self.log_trans[i][j];
                    if v > best_val {
                        best_val = v;
                        best_i = i;
                    }
                }
                delta[t][j] = best_val + log_b[t][j];
                psi[t][j] = best_i;
            }
        }
        let mut path = vec![0usize; t_len];
        path[t_len - 1] = argmax(&delta[t_len - 1]);
        for t in (0..t_len - 1).rev() {
            path[t] = psi[t + 1][path[t + 1]];
        }
        path
    }

    /// Sort fitted states into canonical regime order and rewrite all params.
    fn reorder_canonical(&mut self, cfg: &HmmConfig) {
        let k = self.n_states;
        let idx = cfg.risk_feature_index.min(self.emissions[0].mean.len() - 1);
        // Ascending risk-off-ness: index 0 = most risk-on, last = most risk-off.
        let mut order: Vec<usize> = (0..k).collect();
        order.sort_by(|&a, &b| {
            let va = self.emissions[a].mean[idx];
            let vb = self.emissions[b].mean[idx];
            // If higher feature => risk_off, ascending feature value = risk_on→risk_off.
            let (ka, kb) = if cfg.higher_is_risk_off { (va, vb) } else { (vb, va) };
            ka.partial_cmp(&kb).unwrap_or(std::cmp::Ordering::Equal)
        });
        // order[new] = old
        let mut inv = vec![0usize; k]; // inv[old] = new
        for (new, &old) in order.iter().enumerate() {
            inv[old] = new;
        }
        let new_emissions: Vec<Gaussian> = order.iter().map(|&o| self.emissions[o].clone()).collect();
        let new_init: Vec<f64> = order.iter().map(|&o| self.log_init[o]).collect();
        let mut new_trans = vec![vec![NEG_INF; k]; k];
        for i in 0..k {
            for j in 0..k {
                new_trans[inv[i]][inv[j]] = self.log_trans[i][j];
            }
        }
        self.emissions = new_emissions;
        self.log_init = new_init;
        self.log_trans = new_trans;
    }

    #[cfg(test)]
    fn state_mean(&self, s: usize) -> &DVector<f64> {
        &self.emissions[s].mean
    }
}

// ─── Initialization (k-means++) ─────────────────────────────────────────────────

struct InitParams {
    means: Vec<DVector<f64>>,
    covs: Vec<DMatrix<f64>>,
    weights: Vec<f64>,
}

fn kmeanspp_init(obs: &[DVector<f64>], k: usize, ridge: f64, rng: &mut SplitMix64) -> InitParams {
    let n = obs.len();
    let d = obs[0].len();

    // k-means++ seed selection.
    let mut centers: Vec<DVector<f64>> = Vec::with_capacity(k);
    let first = (rng.next_f64() * n as f64) as usize % n;
    centers.push(obs[first].clone());
    while centers.len() < k {
        let d2: Vec<f64> = obs
            .iter()
            .map(|x| {
                centers
                    .iter()
                    .map(|c| (x - c).norm_squared())
                    .fold(f64::INFINITY, f64::min)
            })
            .collect();
        let total: f64 = d2.iter().sum();
        if total <= 0.0 {
            // All points coincident with chosen centers; jitter pick.
            let pick = (rng.next_f64() * n as f64) as usize % n;
            centers.push(obs[pick].clone());
            continue;
        }
        let mut target = rng.next_f64() * total;
        let mut chosen = n - 1;
        for (i, &w) in d2.iter().enumerate() {
            target -= w;
            if target <= 0.0 {
                chosen = i;
                break;
            }
        }
        centers.push(obs[chosen].clone());
    }

    // A few Lloyd iterations to settle the partition before EM takes over.
    let mut assign = vec![0usize; n];
    for _ in 0..10 {
        let mut changed = false;
        for (i, x) in obs.iter().enumerate() {
            let mut best = 0;
            let mut best_d = f64::INFINITY;
            for (c, ctr) in centers.iter().enumerate() {
                let dd = (x - ctr).norm_squared();
                if dd < best_d {
                    best_d = dd;
                    best = c;
                }
            }
            if assign[i] != best {
                assign[i] = best;
                changed = true;
            }
        }
        for c in 0..k {
            let mut sum = DVector::zeros(d);
            let mut cnt = 0usize;
            for (i, x) in obs.iter().enumerate() {
                if assign[i] == c {
                    sum += x;
                    cnt += 1;
                }
            }
            if cnt > 0 {
                centers[c] = sum / cnt as f64;
            }
        }
        if !changed {
            break;
        }
    }

    // Cluster statistics → initial Gaussian params.
    let mut means = vec![DVector::zeros(d); k];
    let mut covs = vec![DMatrix::<f64>::zeros(d, d); k];
    let mut counts = vec![0usize; k];
    for (i, x) in obs.iter().enumerate() {
        counts[assign[i]] += 1;
        means[assign[i]] += x;
    }
    for c in 0..k {
        if counts[c] > 0 {
            means[c] /= counts[c] as f64;
        } else {
            means[c] = centers[c].clone();
        }
    }
    for (i, x) in obs.iter().enumerate() {
        let c = assign[i];
        let diff = x - &means[c];
        covs[c] += &diff * diff.transpose();
    }
    let mut weights = vec![0.0; k];
    let global_cov = global_covariance(obs);
    for c in 0..k {
        if counts[c] > 1 {
            covs[c] /= counts[c] as f64;
        } else {
            covs[c] = global_cov.clone();
        }
        for i in 0..d {
            covs[c][(i, i)] += ridge;
        }
        weights[c] = (counts[c] as f64 + 1.0) / (n as f64 + k as f64);
    }
    InitParams { means, covs, weights }
}

fn global_covariance(obs: &[DVector<f64>]) -> DMatrix<f64> {
    let n = obs.len();
    let d = obs[0].len();
    let mut mean = DVector::zeros(d);
    for x in obs {
        mean += x;
    }
    mean /= n as f64;
    let mut cov = DMatrix::<f64>::zeros(d, d);
    for x in obs {
        let diff = x - &mean;
        cov += &diff * diff.transpose();
    }
    cov / n.max(1) as f64
}

// ─── Baum-Welch (log-space EM) ──────────────────────────────────────────────────

fn baum_welch(obs: &[DVector<f64>], init: InitParams, cfg: &HmmConfig) -> RegimeModel {
    let k = cfg.n_states;
    let t_len = obs.len();

    let mut emissions: Vec<Gaussian> = (0..k)
        .map(|c| Gaussian::new(init.means[c].clone(), init.covs[c].clone(), cfg.cov_ridge))
        .collect();
    let mut log_init: Vec<f64> = init.weights.iter().map(|w| w.max(1e-12).ln()).collect();
    // Diffuse, slightly self-persistent initial transition matrix.
    let mut log_trans = vec![vec![0.0f64; k]; k];
    for i in 0..k {
        for j in 0..k {
            log_trans[i][j] = if i == j { 0.8 } else { 0.2 / (k as f64 - 1.0) };
        }
        let s: f64 = log_trans[i].iter().sum();
        for j in 0..k {
            log_trans[i][j] = (log_trans[i][j] / s).ln();
        }
    }

    let mut prev_ll = NEG_INF;
    let mut last_ll = NEG_INF;

    for _iter in 0..cfg.max_iters {
        // E-step: emissions, forward, backward.
        let log_b: Vec<Vec<f64>> = obs
            .iter()
            .map(|x| emissions.iter().map(|g| g.logpdf(x)).collect())
            .collect();

        let (log_alpha, ll) = forward(&log_init, &log_trans, &log_b);
        let log_beta = backward(&log_trans, &log_b);
        last_ll = ll;

        // γ_t(i) = α_t(i)·β_t(i) / P(O)
        let mut gamma = vec![vec![0.0f64; k]; t_len];
        for t in 0..t_len {
            let mut row = vec![NEG_INF; k];
            for i in 0..k {
                row[i] = log_alpha[t][i] + log_beta[t][i];
            }
            let norm = logsumexp(&row);
            for i in 0..k {
                gamma[t][i] = (row[i] - norm).exp();
            }
        }

        // ξ_t(i,j) accumulation in log-space, summed over t.
        let mut log_xi_sum = vec![vec![NEG_INF; k]; k];
        for t in 0..t_len - 1 {
            let mut terms = vec![vec![NEG_INF; k]; k];
            let mut all = Vec::with_capacity(k * k);
            for i in 0..k {
                for j in 0..k {
                    let v = log_alpha[t][i]
                        + log_trans[i][j]
                        + log_b[t + 1][j]
                        + log_beta[t + 1][j];
                    terms[i][j] = v;
                    all.push(v);
                }
            }
            let norm = logsumexp(&all);
            for i in 0..k {
                for j in 0..k {
                    let lx = terms[i][j] - norm;
                    log_xi_sum[i][j] = logsumexp(&[log_xi_sum[i][j], lx]);
                }
            }
        }

        // M-step.
        // π
        for i in 0..k {
            log_init[i] = gamma[0][i].max(1e-300).ln();
        }
        // A
        for i in 0..k {
            // Σ_t γ_t(i) over t=0..T-2 (denominator for transitions).
            let mut gsum = vec![NEG_INF; t_len.saturating_sub(1).max(1)];
            let mut gi_terms: Vec<f64> = (0..t_len - 1).map(|t| gamma[t][i].max(1e-300).ln()).collect();
            if gi_terms.is_empty() {
                gi_terms.push(NEG_INF);
            }
            let _ = &mut gsum;
            let denom = logsumexp(&gi_terms);
            for j in 0..k {
                log_trans[i][j] = log_xi_sum[i][j] - denom;
            }
            // Renormalize row defensively.
            let row_norm = logsumexp(&log_trans[i]);
            for j in 0..k {
                log_trans[i][j] -= row_norm;
            }
        }
        // Emissions: weighted mean & covariance.
        let d = obs[0].len();
        for c in 0..k {
            let mut wsum = 0.0;
            let mut mean = DVector::zeros(d);
            for t in 0..t_len {
                wsum += gamma[t][c];
                mean += gamma[t][c] * &obs[t];
            }
            if wsum < 1e-12 {
                continue; // keep previous emission for an unused state
            }
            mean /= wsum;
            let mut cov = DMatrix::<f64>::zeros(d, d);
            for t in 0..t_len {
                let diff = &obs[t] - &mean;
                cov += gamma[t][c] * (&diff * diff.transpose());
            }
            cov /= wsum;
            emissions[c] = Gaussian::new(mean, cov, cfg.cov_ridge);
        }

        // Convergence on data log-likelihood.
        if (ll - prev_ll).abs() < cfg.tol * (1.0 + prev_ll.abs()) && prev_ll != NEG_INF {
            break;
        }
        prev_ll = ll;
    }

    RegimeModel {
        n_states: k,
        log_init,
        log_trans,
        emissions,
        log_likelihood: last_ll,
    }
}

/// Log-space forward pass. Returns (log α, data log-likelihood).
fn forward(log_init: &[f64], log_trans: &[Vec<f64>], log_b: &[Vec<f64>]) -> (Vec<Vec<f64>>, f64) {
    let k = log_init.len();
    let t_len = log_b.len();
    let mut log_alpha = vec![vec![NEG_INF; k]; t_len];
    for j in 0..k {
        log_alpha[0][j] = log_init[j] + log_b[0][j];
    }
    for t in 1..t_len {
        for j in 0..k {
            let mut terms = vec![NEG_INF; k];
            for i in 0..k {
                terms[i] = log_alpha[t - 1][i] + log_trans[i][j];
            }
            log_alpha[t][j] = logsumexp(&terms) + log_b[t][j];
        }
    }
    let ll = logsumexp(&log_alpha[t_len - 1]);
    (log_alpha, ll)
}

/// Log-space backward pass.
fn backward(log_trans: &[Vec<f64>], log_b: &[Vec<f64>]) -> Vec<Vec<f64>> {
    let k = log_trans.len();
    let t_len = log_b.len();
    let mut log_beta = vec![vec![NEG_INF; k]; t_len];
    for i in 0..k {
        log_beta[t_len - 1][i] = 0.0;
    }
    for t in (0..t_len - 1).rev() {
        for i in 0..k {
            let mut terms = vec![NEG_INF; k];
            for j in 0..k {
                terms[j] = log_trans[i][j] + log_b[t + 1][j] + log_beta[t + 1][j];
            }
            log_beta[t][i] = logsumexp(&terms);
        }
    }
    log_beta
}

fn argmax(xs: &[f64]) -> usize {
    let mut best = 0;
    let mut best_v = NEG_INF;
    for (i, &v) in xs.iter().enumerate() {
        if v > best_v {
            best_v = v;
            best = i;
        }
    }
    best
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand::rngs::StdRng;
    use rand_distr::{Distribution, Normal};

    fn gen_two_regime(n: usize, seed: u64) -> Vec<DVector<f64>> {
        // Persistent regimes: risk_on (low feature) vs risk_off (high feature),
        // 2-D observations, well separated.
        let mut rng = StdRng::seed_from_u64(seed);
        let lo = Normal::new(-2.0, 0.5).unwrap();
        let hi = Normal::new(3.0, 0.5).unwrap();
        let mut obs = Vec::with_capacity(n);
        let mut state = 0usize;
        for t in 0..n {
            // Switch regimes in long blocks.
            if t % 50 == 0 && t > 0 {
                state = 1 - state;
            }
            let dist = if state == 0 { &lo } else { &hi };
            let f0 = dist.sample(&mut rng);
            let f1 = dist.sample(&mut rng) * 0.5;
            obs.push(DVector::from_vec(vec![f0, f1]));
        }
        obs
    }

    #[test]
    fn canonical_ordering_risk_on_below_risk_off() {
        let obs = gen_two_regime(400, 42);
        let cfg = HmmConfig { n_states: 2, ..Default::default() };
        let model = RegimeModel::fit(&obs, &cfg);
        // After canonical ordering with higher_is_risk_off, state 0's risk feature
        // mean must be below the last state's.
        let m0 = model.state_mean(0)[cfg.risk_feature_index];
        let m_last = model.state_mean(cfg.n_states - 1)[cfg.risk_feature_index];
        assert!(m0 < m_last, "risk_on mean {m0} should be < risk_off mean {m_last}");
    }

    #[test]
    fn filtered_posteriors_have_no_look_ahead() {
        let obs = gen_two_regime(300, 7);
        let cfg = HmmConfig { n_states: 2, ..Default::default() };
        let model = RegimeModel::fit(&obs, &cfg);

        let full = model.filtered_posteriors(&obs);
        // Truncating the series at t must not change the filtered posterior at t,
        // because forward filtering only consumes obs_1..t.
        for t in [10usize, 50, 120, 200, 299] {
            let prefix: Vec<DVector<f64>> = obs[..=t].to_vec();
            let trunc = model.filtered_posteriors(&prefix);
            for s in 0..cfg.n_states {
                assert!(
                    (full[t][s] - trunc[t][s]).abs() < 1e-9,
                    "filtered posterior at t={t} state={s} changed when future was removed"
                );
            }
        }
    }

    #[test]
    fn viterbi_is_deterministic() {
        let obs = gen_two_regime(250, 99);
        let cfg = HmmConfig { n_states: 2, ..Default::default() };
        let model = RegimeModel::fit(&obs, &cfg);
        let a = model.viterbi_path(&obs);
        let b = model.viterbi_path(&obs);
        assert_eq!(a, b);
    }

    #[test]
    fn fit_is_reproducible_with_fixed_seed() {
        let obs = gen_two_regime(300, 5);
        let cfg = HmmConfig { n_states: 2, ..Default::default() };
        let m1 = RegimeModel::fit(&obs, &cfg);
        let m2 = RegimeModel::fit(&obs, &cfg);
        assert!((m1.log_likelihood - m2.log_likelihood).abs() < 1e-9);
        for s in 0..cfg.n_states {
            assert!((m1.state_mean(s) - m2.state_mean(s)).norm() < 1e-9);
        }
    }

    #[test]
    fn recovers_separated_regimes() {
        let obs = gen_two_regime(600, 13);
        let cfg = HmmConfig { n_states: 2, ..Default::default() };
        let model = RegimeModel::fit(&obs, &cfg);
        // Means should land near the generative centers (-2 and +3 on feature 0).
        let m_on = model.state_mean(0)[0];
        let m_off = model.state_mean(1)[0];
        assert!(m_on < 0.0, "risk_on feature mean {m_on} should be negative");
        assert!(m_off > 1.0, "risk_off feature mean {m_off} should be clearly positive");
    }

    #[test]
    fn posteriors_sum_to_one() {
        let obs = gen_two_regime(120, 3);
        let cfg = HmmConfig { n_states: 3, ..Default::default() };
        let model = RegimeModel::fit(&obs, &cfg);
        let post = model.filtered_posteriors(&obs);
        for row in &post {
            let s: f64 = row.iter().sum();
            assert!((s - 1.0).abs() < 1e-9, "posterior row sums to {s}");
        }
    }
}
