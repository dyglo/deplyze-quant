import React, { useMemo, useState } from 'react';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import { AgentStatusDashboard } from '../components/quant/AgentStatusDashboard';
import { FreshnessBadge } from '../components/quant/FreshnessBadge';
import { useDrawer } from '../components/quant/DataDrawer';
import { useProviderHealth } from '../hooks/useProviders';
import {
  ModelDrawerBody,
  MODEL_STATUS_COLOR,
  checkModelAvailability,
  type ModelDef,
  type ModelStatus,
} from '../components/quant/ModelDrawerBody';
import { capabilityLabel } from '../lib/providerLabels';
import { Stethoscope, AlertTriangle, CheckCircle2 } from 'lucide-react';

const MODELS: ModelDef[] = [
  {
    id: 'regime-classifier',
    name: 'Regime Classifier',
    category: 'Market Regime',
    purpose: 'Classifies the current market into trending-bull, trending-bear, ranging, vol-expansion, or vol-compression regimes from daily OHLCV.',
    expectedOutput: '{ symbol, label, confidence, since } per asset, refreshed daily.',
    features: ['log_return_5d', 'log_return_20d', 'realised_vol_20d', 'atr_pct_rank', 'breadth_20d', 'rsi_14'],
    requiredProviders: ['twelve_data'],
    requiredDatasets: ['dq_features.returns', 'dq_features.volatility'],
    validation: ['Walk-forward CV with 3y train / 6m test windows', 'Calibration error < 0.05', 'Class-stability ≥ 0.7 across folds'],
    nextStep: 'Land dq_features.returns + volatility tables, then ship a baseline HMM / Random Forest classifier.',
    status: 'needs-dataset',
  },
  {
    id: 'directional-bias',
    name: 'Directional Bias',
    category: 'Probabilistic Forecast',
    purpose: 'Estimates the probability of next-N-day direction conditional on the current regime and macro tilt.',
    expectedOutput: '{ symbol, horizon, p_up, expected_move, confidence }.',
    features: ['regime_state', 'macro_score', 'realised_vol_20d', 'cross_asset_spread'],
    requiredProviders: ['twelve_data', 'alpha_vantage'],
    requiredDatasets: ['dq_features.returns', 'dq_features.regime_state'],
    validation: ['Brier score vs naive baseline', 'No lookahead in feature pipeline', 'Reported in probability bins'],
    nextStep: 'Wait for regime-classifier; this model consumes its output.',
    status: 'needs-training',
  },
  {
    id: 'vol-forecaster',
    name: 'Volatility Forecaster',
    category: 'Volatility',
    purpose: 'Projects 5/20/60-day realised volatility from a GARCH-style or LSTM baseline.',
    expectedOutput: '{ symbol, horizon, vol_forecast, ci_low, ci_high }.',
    features: ['squared_returns', 'realised_vol_20d', 'atr_pct_rank'],
    requiredProviders: ['twelve_data'],
    requiredDatasets: ['dq_features.returns', 'dq_features.volatility'],
    validation: ['QLIKE / MSE against realised vol', 'Calibration of CI coverage'],
    nextStep: 'Ship a simple EWMA / GARCH(1,1) baseline once dq_features.volatility lands.',
    status: 'needs-dataset',
  },
  {
    id: 'correlation-shift',
    name: 'Correlation Shift Detector',
    category: 'Cross-Asset',
    purpose: 'Flags pairs whose rolling correlation has materially diverged from their historical norm.',
    expectedOutput: '{ pair, current_rho, historical_rho, z_score, since }.',
    features: ['rolling_corr_30d', 'rolling_corr_180d', 'corr_zscore'],
    requiredProviders: ['twelve_data'],
    requiredDatasets: ['dq_features.correlations'],
    validation: ['Replays vs historical breakdowns', 'False positive rate budget'],
    nextStep: 'Persist correlation snapshots (already computed live in Cross-Asset Matrix) into BigQuery dq_features.correlations.',
    status: 'planned',
  },
  {
    id: 'sentiment-intel',
    name: 'Sentiment Intelligence',
    category: 'NLP',
    purpose: 'Replace the current rule-based headline scorer with a transformer-based sentiment + stance model.',
    expectedOutput: '{ symbol, score, stance, source_diversity, narrative }.',
    features: ['headline_embedding', 'source_reputation', 'tone_class'],
    requiredProviders: ['tavily', 'serper', 'finnhub', 'gemini'],
    requiredDatasets: ['dq_raw.web_research', 'dq_raw.news_feed'],
    validation: ['Inter-annotator agreement', 'Backtest sentiment vs forward returns'],
    nextStep: 'Currently shipped as a keyword proxy on the Positioning & Sentiment page. Upgrade path: AI classifier with structured output.',
    status: 'data-ready',
  },
  {
    id: 'anomaly-detect',
    name: 'Anomaly Detection',
    category: 'Risk',
    purpose: 'Flags statistically unusual price / volume / spread behaviour against a rolling baseline.',
    expectedOutput: '{ symbol, anomaly_type, severity, evidence }.',
    features: ['vol_z_score', 'volume_z_score', 'gap_pct', 'spread_pct'],
    requiredProviders: ['twelve_data'],
    requiredDatasets: ['dq_features.returns', 'dq_features.volatility'],
    validation: ['False-positive cap under benign regimes', 'Time-to-detect on labelled events'],
    nextStep: 'Trivial baseline (rolling z-score on returns + volume) can ship as soon as dq_features lands.',
    status: 'planned',
  },
  {
    id: 'event-impact',
    name: 'Event Impact Model',
    category: 'Macro',
    purpose: 'Estimates expected price reaction to macro events (CPI surprises, FOMC) by analog matching.',
    expectedOutput: '{ event, symbol, expected_reaction, confidence }.',
    features: ['surprise_index', 'regime_state', 'historical_reaction'],
    requiredProviders: ['alpha_vantage', 'tavily'],
    requiredDatasets: ['dq_cleaned.economic_events', 'dq_features.returns'],
    validation: ['Out-of-sample event holdout', 'Conditional CI coverage'],
    nextStep: 'Build dq_cleaned.economic_events table (calendar + surprise) before training.',
    status: 'planned',
  },
];

const STATUS_RANK: Record<ModelStatus, number> = {
  'data-ready': 0, 'needs-training': 1, 'needs-dataset': 2, 'planned': 3, 'disabled': 4,
};

export const ModelObservatory: React.FC = () => {
  const drawer = useDrawer();
  const health = useProviderHealth();
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);

  const ranked = useMemo(
    () => [...MODELS].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]),
    [],
  );

  const summary = useMemo(() => {
    const counts: Record<ModelStatus, number> = {
      'data-ready': 0, 'needs-training': 0, 'needs-dataset': 0, 'planned': 0, 'disabled': 0,
    };
    for (const m of MODELS) counts[m.status]++;
    return counts;
  }, []);

  const runDiagnostics = async () => {
    setDiagnosticsRunning(true);
    await health.refresh();
    // Defer slightly so the spinner is visible if the cache is warm.
    await new Promise((r) => setTimeout(r, 400));
    setDiagnosticsRunning(false);
  };

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Model Observatory"
        subtitle="Honest view of the ML suite — no fake performance numbers. Each model declares its dependencies, required datasets, and next implementation step."
        actions={
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <FreshnessBadge status={health.status} fetchedAt={health.fetchedAt} compact />
            <button
              onClick={runDiagnostics}
              disabled={diagnosticsRunning}
              style={{
                padding: '6px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--card)',
                color: 'var(--foreground)', cursor: diagnosticsRunning ? 'not-allowed' : 'pointer',
                fontSize: 11, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <Stethoscope size={11} /> Run diagnostics
            </button>
          </div>
        }
      />

      {/* Status summary */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 18 }}>
        {(Object.keys(summary) as ModelStatus[]).filter((s) => summary[s] > 0).map((s) => (
          <div key={s} className="ds-surface" style={{ padding: 10, borderRadius: 8 }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: MODEL_STATUS_COLOR[s],
            }}>
              {s.replace('-', ' ')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', marginTop: 2 }}>
              {summary[s]}
            </div>
          </div>
        ))}
      </section>

      {/* Model table */}
      <section className="ds-surface" style={{ padding: 0, borderRadius: 10, overflow: 'hidden' }}>
        <table className="ds-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--muted)' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Model</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Category</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Providers</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((m) => {
              const avail = checkModelAvailability(m, health.data);
              return (
                <tr
                  key={m.id}
                  onClick={() => drawer.open({
                    title: m.name,
                    subtitle: m.category,
                    width: 580,
                    body: <ModelDrawerBody model={m} providers={health.data} />,
                  })}
                  style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                  className="ds-row"
                >
                  <td style={{ padding: '12px 14px' }}>
                    <div className="ds-heading" style={{ margin: 0 }}>{m.name}</div>
                    <div className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>{m.id}</div>
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--muted-foreground)', fontSize: 12 }}>{m.category}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      {avail.allOk ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#4E6040', fontSize: 11, fontWeight: 600 }}>
                          <CheckCircle2 size={12} /> all connected
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#9e7e3a', fontSize: 11, fontWeight: 600 }}>
                          <AlertTriangle size={12} /> needs: {avail.providersMissing.map(capabilityLabel).join(', ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 999,
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: MODEL_STATUS_COLOR[m.status],
                      background: `color-mix(in srgb, ${MODEL_STATUS_COLOR[m.status]} 12%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${MODEL_STATUS_COLOR[m.status]} 30%, transparent)`,
                    }}>
                      {m.status.replace('-', ' ')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="ds-caption" style={{ marginTop: 10, color: 'var(--muted-foreground)' }}>
        Diagnostics call <code>/v1/providers/health</code> to verify required keys are configured server-side.
        Required datasets are tracked here but ingestion into BigQuery <code>dq_features</code> lands in a
        later phase.
      </p>

      {/* ── V4: Agent Intelligence Status ──────────────────────────────────── */}
      <section style={{ marginTop: 28, marginBottom: 24 }}>
        <AgentStatusDashboard />
      </section>

      <Disclaimer />
    </div>
  );
};
