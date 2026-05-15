import React, { useState } from 'react';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import { FreshnessBadge, SourceBadge } from '../components/quant/FreshnessBadge';
import { useDrawer } from '../components/quant/DataDrawer';
import { useProviderHealth } from '../hooks/useProviders';
import { DatasetDrawerBody, type DatasetInfo } from '../components/quant/DatasetDrawerBody';
import {
  RefreshCw, CheckCircle2, XCircle, AlertTriangle, Database,
  Brain, Clock, BarChart2, FileText, Globe, Activity, ChevronRight,
} from 'lucide-react';
import type { ProviderId } from '../types';
import { providerLabel } from '../lib/providerLabels';

// ─── Dataset registry ─────────────────────────────────────────────────────

const DATASETS: DatasetInfo[] = [
  // V2 providers
  {
    zone: 'dq_raw', name: 'realtime_quotes', provider: 'polygon' as ProviderId, cadence: '1 min',
    description: 'Institutional real-time quote snapshots. Primary source for equity quotes with VWAP, day high/low, and nanosecond timestamp precision.',
    schema: [
      { field: 'symbol', type: 'STRING' }, { field: 'price', type: 'FLOAT64' },
      { field: 'change', type: 'FLOAT64' }, { field: 'change_pct', type: 'FLOAT64' },
      { field: 'day_h', type: 'FLOAT64' }, { field: 'day_l', type: 'FLOAT64' },
      { field: 'prev_close', type: 'FLOAT64' }, { field: 'vwap', type: 'FLOAT64' },
      { field: 'ts_ns', type: 'INT64', note: 'nanosecond precision' },
    ],
    qualityNotes: ['Primary quote source', 'VWAP included', 'Automatic fallback to market data feed on unavailability'],
    status: 'wired',
  },
  {
    zone: 'dq_raw', name: 'fundamentals', provider: 'fmp' as ProviderId, cadence: '24 h',
    description: 'Institutional fundamentals: company profiles, key metrics, income statements, earnings surprises, market movers.',
    schema: [
      { field: 'symbol', type: 'STRING' }, { field: 'pe_ratio', type: 'FLOAT64' },
      { field: 'pb_ratio', type: 'FLOAT64' }, { field: 'ev_to_ebitda', type: 'FLOAT64' },
      { field: 'roe', type: 'FLOAT64' }, { field: 'roic', type: 'FLOAT64' },
      { field: 'debt_to_equity', type: 'FLOAT64' }, { field: 'eps', type: 'FLOAT64' },
      { field: 'revenue', type: 'FLOAT64' }, { field: 'period', type: 'STRING' },
    ],
    qualityNotes: ['Quarterly + annual series', 'Earnings surprises included', 'Routed through fallback chain on failure'],
    status: 'wired',
  },
  {
    zone: 'dq_raw', name: 'historical_ohlcv', provider: 'eodhd' as ProviderId, cadence: '6 h',
    description: 'Adjusted end-of-day OHLCV — primary historical price source with split/dividend-adjusted close, covering equities, FX, indices, and crypto.',
    schema: [
      { field: 'symbol', type: 'STRING' }, { field: 'date', type: 'DATE' },
      { field: 'open', type: 'FLOAT64' }, { field: 'high', type: 'FLOAT64' },
      { field: 'low', type: 'FLOAT64' }, { field: 'close', type: 'FLOAT64' },
      { field: 'adjusted_close', type: 'FLOAT64', note: 'dividend/split adjusted' },
      { field: 'volume', type: 'INT64' },
    ],
    qualityNotes: ['Primary historical OHLCV source', 'Adjusted close for corporate actions', 'Multi-asset class coverage'],
    status: 'wired',
  },
  {
    zone: 'dq_raw', name: 'regulatory_filings', provider: 'edgar' as ProviderId, cadence: 'on demand',
    description: 'SEC institutional filings: 10-K, 10-Q, 8-K, insider transactions, XBRL company facts. Requires administrator configuration.',
    schema: [
      { field: 'symbol', type: 'STRING' }, { field: 'cik', type: 'INT64' },
      { field: 'form_type', type: 'STRING', note: '10-K | 10-Q | 8-K | 4' },
      { field: 'filing_date', type: 'DATE' }, { field: 'report_date', type: 'DATE' },
      { field: 'accession_number', type: 'STRING' }, { field: 'primary_document', type: 'STRING' },
    ],
    qualityNotes: ['SEC regulatory data', 'XBRL structured fundamentals', 'Requires compliance configuration'],
    status: 'partial',
  },
  {
    zone: 'dq_raw', name: 'market_data_feed', provider: 'finnhub', cadence: '1 min',
    description: 'Market data feed — quote fallback, company profiles, and financial news. Active when primary real-time feed is unavailable.',
    schema: [
      { field: 'symbol', type: 'STRING' }, { field: 'price', type: 'FLOAT64' },
      { field: 'change', type: 'FLOAT64' }, { field: 'change_pct', type: 'FLOAT64' },
      { field: 'ts_ms', type: 'INT64', note: 'exchange timestamp · unix ms' },
    ],
    qualityNotes: ['Automatic fallback when primary quote source is unavailable', 'Also provides company profiles and news'],
    status: 'wired',
  },
  {
    zone: 'dq_raw', name: 'intraday_ohlcv', provider: 'twelve_data', cadence: '5 min / 6 h',
    description: 'Intraday and daily OHLCV — fallback price data source for equities, FX, and commodities.',
    schema: [
      { field: 'symbol', type: 'STRING' }, { field: 'ts_ms', type: 'INT64' },
      { field: 'open', type: 'FLOAT64' }, { field: 'close', type: 'FLOAT64' },
      { field: 'volume', type: 'FLOAT64', note: 'may be 0 for FX' },
    ],
    qualityNotes: ['Intraday + daily price fallback', 'Covers equities, FX, commodities, crypto'],
    status: 'wired',
  },
  {
    zone: 'dq_raw', name: 'macro_series', provider: 'alpha_vantage', cadence: '6 h',
    description: 'Macroeconomic time series: Fed Funds Rate, CPI, Treasury yields (2Y–30Y), unemployment, real GDP.',
    schema: [
      { field: 'series_id', type: 'STRING' }, { field: 'ts_ms', type: 'INT64' },
      { field: 'value', type: 'FLOAT64' }, { field: 'unit', type: 'STRING' },
    ],
    qualityNotes: ['Aggressively cached — 6h TTL', 'Primary macro series source', 'Covers: FEDFUNDS, CPI, DGS2–30, UNEMP, GDP'],
    status: 'wired',
  },
  {
    zone: 'dq_raw', name: 'web_research', provider: 'tavily', cadence: '1 h',
    description: 'AI-curated web research results for Copilot intelligence context and sentiment analysis.',
    schema: [
      { field: 'query', type: 'STRING' }, { field: 'url', type: 'STRING' },
      { field: 'title', type: 'STRING' }, { field: 'content', type: 'STRING' },
      { field: 'score', type: 'FLOAT64' },
    ],
    qualityNotes: ['News intelligence fallback', 'Copilot research context'],
    status: 'wired',
  },
  // Intelligence zones
  {
    zone: 'dq_intelligence', name: 'intelligence_artifacts', provider: 'derived', cadence: 'on demand',
    description: 'AI-synthesised intelligence artifacts: regime, volatility, correlation, sentiment, macro, anomaly, opportunity, risk, and earnings analysis.',
    schema: [
      { field: 'id', type: 'STRING' }, { field: 'category', type: 'STRING' },
      { field: 'title', type: 'STRING' }, { field: 'narrative', type: 'STRING', note: 'AI-generated markdown' },
      { field: 'symbols', type: 'STRING[]' }, { field: 'confidence', type: 'FLOAT64' },
      { field: 'significance', type: 'FLOAT64' }, { field: 'created_at', type: 'TIMESTAMP' },
    ],
    qualityNotes: ['Persisted in research store', 'workspaces/{w}/projects/{p}/artifacts', 'V2: typed artifacts'],
    status: 'wired',
  },
  {
    zone: 'dq_intelligence', name: 'prediction_records', provider: 'derived', cadence: 'planned',
    description: 'Institutional model prediction outputs with confidence scoring, feature attributions, and outcome tracking.',
    schema: [
      { field: 'id', type: 'STRING' }, { field: 'model_id', type: 'STRING' },
      { field: 'output_type', type: 'STRING' }, { field: 'symbol', type: 'STRING' },
      { field: 'horizon', type: 'STRING' }, { field: 'prediction', type: 'STRING' },
      { field: 'confidence', type: 'FLOAT64' }, { field: 'features', type: 'JSON', note: 'SHAP attributions' },
      { field: 'outcome', type: 'JSON', note: 'filled after horizon elapses' },
    ],
    qualityNotes: ['Schema ready for real model outputs', 'Outcome tracking infrastructure', 'Benchmark comparison support'],
    status: 'planned',
  },
  {
    zone: 'dq_intelligence', name: 'model_registry', provider: 'derived', cadence: 'planned',
    description: 'Model observatory registry: model metadata, performance metrics, version history, accuracy benchmarks.',
    schema: [
      { field: 'model_id', type: 'STRING' }, { field: 'name', type: 'STRING' },
      { field: 'output_type', type: 'STRING' }, { field: 'status', type: 'STRING' },
      { field: 'accuracy', type: 'FLOAT64' }, { field: 'hit_rate', type: 'FLOAT64' },
      { field: 'information_coefficient', type: 'FLOAT64' },
    ],
    qualityNotes: ['Designed for Model Observatory integration', 'Tracks active vs experimental models'],
    status: 'planned',
  },
  {
    zone: 'dq_research', name: 'briefings', provider: 'firestore' as ProviderId, cadence: 'on demand',
    description: 'Institutional briefings generated by the /v1/briefings/generate gateway route.',
    schema: [
      { field: 'kind', type: 'STRING' }, { field: 'title', type: 'STRING' },
      { field: 'summary', type: 'STRING' }, { field: 'body', type: 'STRING', note: 'markdown' },
      { field: 'highlights', type: 'STRING[]' }, { field: 'created_at', type: 'TIMESTAMP' },
    ],
    qualityNotes: ['Persisted under workspaces/{w}/projects/{p}/briefings', 'Multi-kind: macro, volatility, earnings, etc.'],
    status: 'wired',
  },
  {
    zone: 'dq_research', name: 'lab_sessions', provider: 'firestore' as ProviderId, cadence: 'on demand',
    description: 'Quant Lab sessions with risk metrics, alpha analysis, and portfolio snapshots.',
    schema: [
      { field: 'id', type: 'STRING' }, { field: 'panel', type: 'STRING', note: 'risk | alpha | portfolio' },
      { field: 'symbols', type: 'STRING[]' }, { field: 'summary', type: 'JSON' },
      { field: 'raw_snapshot', type: 'JSON', note: 'full metric snapshot' },
    ],
    qualityNotes: ['Persisted under workspaces/{w}/projects/{p}/labSessions'],
    status: 'wired',
  },
  {
    zone: 'dq_research', name: 'copilot_insights', provider: 'firestore' as ProviderId, cadence: 'on demand',
    description: 'Saved copilot insights from research sessions.',
    schema: [
      { field: 'id', type: 'STRING' }, { field: 'content', type: 'STRING' },
      { field: 'symbols', type: 'STRING[]' }, { field: 'saved_by', type: 'STRING' },
    ],
    qualityNotes: ['Persisted under workspaces/{w}/projects/{p}/insights'],
    status: 'wired',
  },
  {
    zone: 'dq_features', name: 'ohlcv_normalised', provider: 'derived', cadence: 'planned',
    description: 'Normalised OHLCV unioned across all price sources — timezone-aligned, gap-filled, split/dividend adjusted.',
    schema: [
      { field: 'symbol', type: 'STRING' }, { field: 'ts_ms', type: 'INT64' },
      { field: 'close', type: 'FLOAT64' }, { field: 'adj_close', type: 'FLOAT64' },
      { field: 'volume', type: 'INT64' }, { field: 'provider', type: 'STRING' },
    ],
    qualityNotes: ['Pending BigQuery dq_cleaned zone', 'Cross-provider normalisation'],
    status: 'planned',
  },
];

const ZONE_META: Record<string, { label: string; hint: string; icon: React.ReactNode; color: string }> = {
  dq_raw:          { label: 'Raw Data', hint: 'Exact source data, immutable', icon: <Database size={13} />, color: '#6e7e9e' },
  dq_intelligence: { label: 'Intelligence', hint: 'AI-synthesised artifacts and model outputs', icon: <Brain size={13} />, color: '#9e7e3a' },
  dq_research:     { label: 'Research', hint: 'Persisted briefings, insights, lab sessions', icon: <FileText size={13} />, color: '#4E6040' },
  dq_features:     { label: 'Feature Layer', hint: 'ML-ready engineered features (planned)', icon: <BarChart2 size={13} />, color: '#5e6e9e' },
};

// ─── Provider routing map ──────────────────────────────────────────────────

const ROUTING_DOMAINS = [
  { domain: 'Quotes',       chain: ['polygon', 'finnhub', 'twelve_data'] },
  { domain: 'OHLCV',        chain: ['eodhd', 'twelve_data', 'fmp', 'alpha_vantage'] },
  { domain: 'Fundamentals', chain: ['fmp', 'finnhub', 'eodhd'] },
  { domain: 'News',         chain: ['polygon', 'finnhub', 'tavily', 'serper'] },
  { domain: 'Earnings',     chain: ['fmp', 'finnhub', 'eodhd'] },
  { domain: 'Macro',        chain: ['alpha_vantage'] },
  { domain: 'Research',     chain: ['tavily', 'serper', 'gemini'] },
  { domain: 'Filings',      chain: ['edgar'] },
];

// Maps internal provider IDs to display labels for the routing map
const CHAIN_LABEL = providerLabel;

// ─── Sub-component: provider health card ──────────────────────────────────

interface ProviderCardProps {
  id: string;
  configured: boolean;
  latencyMs?: number;
  consecutiveFailures?: number;
  lastSuccessAt?: number;
  lastFailureMessage?: string;
}

const ProviderCard: React.FC<ProviderCardProps> = ({
  id, configured, latencyMs, consecutiveFailures, lastFailureMessage,
}) => {
  const hasFailed = (consecutiveFailures ?? 0) > 0;
  const statusColor = !configured ? 'var(--muted-foreground)' : hasFailed ? '#9e7e3a' : '#4E6040';
  const Icon = !configured ? XCircle : hasFailed ? AlertTriangle : CheckCircle2;

  return (
    <div className="ds-surface" style={{
      padding: '10px 12px', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 8,
      border: '1px solid var(--border)',
    }}>
      <Icon size={14} color={statusColor} style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>
          {providerLabel(id)}
        </span>
        <div className="ds-caption" style={{ color: 'var(--muted-foreground)', marginTop: 1 }}>
          {!configured ? 'not connected' : hasFailed ? 'degraded' : 'operational'}
          {latencyMs != null && configured && !hasFailed ? ` · ${latencyMs}ms` : ''}
        </div>
      </div>
    </div>
  );
};

// ─── Sub-component: routing domain row ────────────────────────────────────

const RoutingRow: React.FC<{ domain: string; chain: string[]; healthById: Map<string, { configured: boolean }> }> = ({
  domain, chain, healthById,
}) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--card)',
  }}>
    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)', minWidth: 110 }}>{domain}</span>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {chain.map((p, i) => {
        const configured = healthById.get(p)?.configured ?? false;
        return (
          <React.Fragment key={p}>
            {i > 0 && <ChevronRight size={10} color="var(--muted-foreground)" />}
            <span style={{
              fontSize: 10, fontWeight: 600,
              padding: '2px 6px', borderRadius: 4,
              background: configured ? 'rgba(78,96,64,0.10)' : 'var(--muted)',
              color: configured ? '#4E6040' : 'var(--muted-foreground)',
              border: '1px solid color-mix(in srgb, currentColor 20%, transparent)',
            }}>{CHAIN_LABEL(p)}</span>
          </React.Fragment>
        );
      })}
    </div>
  </div>
);

// ─── Tab type ─────────────────────────────────────────────────────────────

type Tab = 'intelligence' | 'providers' | 'datasets';

// ─── Main component ───────────────────────────────────────────────────────

export const WarehouseExplorer: React.FC = () => {
  const drawer = useDrawer();
  const health = useProviderHealth();
  const [activeTab, setActiveTab] = useState<Tab>('intelligence');

  const healthById = new Map<string, { configured: boolean; latencyMs?: number; consecutiveFailures?: number; lastSuccessAt?: number; lastFailureMessage?: string }>(
    (health.data ?? []).map((p) => [p.id, p as { configured: boolean }])
  );

  const byZone = DATASETS.reduce((acc, d) => {
    (acc[d.zone] ??= []).push(d);
    return acc;
  }, {} as Record<string, DatasetInfo[]>);

  const TAB_STYLES = (t: Tab): React.CSSProperties => ({
    padding: '5px 14px',
    borderRadius: 6,
    border: 'none',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    background: activeTab === t ? 'var(--primary)' : 'transparent',
    color: activeTab === t ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
    transition: 'background 0.15s, color 0.15s',
  });

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Research Intelligence Warehouse"
        subtitle="Unified intelligence infrastructure — providers, data contracts, model schemas, and research artifacts powering Deplyze Quant."
        actions={
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <FreshnessBadge status={health.status} fetchedAt={health.fetchedAt} compact />
            <button
              onClick={() => health.refresh()}
              title="Re-check providers"
              style={{
                width: 26, height: 26, borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--card)',
                color: 'var(--muted-foreground)', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <RefreshCw size={12} style={{ animation: health.isFetching ? 'spin 1s linear infinite' : undefined }} />
            </button>
          </div>
        }
      />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, padding: '4px', borderRadius: 8, background: 'var(--muted)', width: 'fit-content' }}>
        <button style={TAB_STYLES('intelligence')} onClick={() => setActiveTab('intelligence')}>
          <Brain size={11} style={{ display: 'inline', marginRight: 4 }} />Intelligence
        </button>
        <button style={TAB_STYLES('providers')} onClick={() => setActiveTab('providers')}>
          <Activity size={11} style={{ display: 'inline', marginRight: 4 }} />Providers
        </button>
        <button style={TAB_STYLES('datasets')} onClick={() => setActiveTab('datasets')}>
          <Database size={11} style={{ display: 'inline', marginRight: 4 }} />Datasets
        </button>
      </div>

      {/* ── Intelligence tab ── */}
      {activeTab === 'intelligence' && (
        <div>
          {/* Intelligence infrastructure overview */}
          <section style={{ marginBottom: 24 }}>
            <h2 className="ds-heading" style={{ marginBottom: 12 }}>Intelligence Infrastructure</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {[
                {
                  icon: <Brain size={16} color="#9e7e3a" />,
                  title: 'Intelligence Artifacts',
                  desc: 'AI-synthesised regime, volatility, correlation, and macro artifacts persisted in Firestore.',
                  status: 'live', zone: 'dq_intelligence',
                },
                {
                  icon: <BarChart2 size={16} color="#4E6040" />,
                  title: 'Prediction Framework',
                  desc: 'Model output schemas with confidence scoring, feature attribution, and outcome tracking. Ready for real model pipeline connection.',
                  status: 'schema-ready', zone: 'dq_intelligence',
                },
                {
                  icon: <Clock size={16} color="#6e7e9e" />,
                  title: 'Research Timeline',
                  desc: 'Ordered intelligence events: briefings, lab sessions, artifacts, copilot insights unified on a shared research timeline.',
                  status: 'live', zone: 'dq_research',
                },
                {
                  icon: <FileText size={16} color="#4E6040" />,
                  title: 'SEC EDGAR Filings',
                  desc: '10-K, 10-Q, 8-K, insider transactions, XBRL fundamentals from SEC public filings. Requires administrator configuration.',
                  status: 'partial', zone: 'dq_raw',
                },
                {
                  icon: <Globe size={16} color="#9e7e3a" />,
                  title: 'Market Fundamentals',
                  desc: 'Institutional fundamentals normalised across all connected data sources with automatic fallback routing.',
                  status: 'live', zone: 'dq_raw',
                },
                {
                  icon: <Activity size={16} color="#4E6040" />,
                  title: 'WebSocket Readiness',
                  desc: 'WebSocket abstraction layer prepared for live trade, quote, and aggregate streaming with automatic reconnect.',
                  status: 'ready', zone: 'infrastructure',
                },
              ].map((card) => (
                <div key={card.title} className="ds-surface" style={{
                  padding: 14, borderRadius: 10, border: '1px solid var(--border)',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    {card.icon}
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      padding: '2px 7px', borderRadius: 999,
                      color: card.status === 'live' || card.status === 'ready' ? '#4E6040'
                           : card.status === 'partial' ? '#9e7e3a'
                           : 'var(--muted-foreground)',
                      background: card.status === 'live' || card.status === 'ready' ? 'rgba(78,96,64,0.10)'
                               : card.status === 'partial' ? 'rgba(158,126,58,0.10)'
                               : 'var(--muted)',
                      border: '1px solid color-mix(in srgb, currentColor 20%, transparent)',
                    }}>{card.status}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>{card.title}</div>
                    <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>{card.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Prediction schema overview */}
          <section style={{ marginBottom: 24 }}>
            <h2 className="ds-heading" style={{ marginBottom: 4 }}>Prediction Infrastructure Schema</h2>
            <p className="ds-caption" style={{ marginBottom: 12, color: 'var(--muted-foreground)' }}>
              Model output contracts are schema-ready for institutional model pipelines. No synthetic predictions are generated — these schemas prepare the platform for real alpha research systems.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
              {[
                {
                  schema: 'PredictionRecord',
                  fields: ['modelId', 'outputType', 'symbol', 'horizon', 'prediction', 'confidence', 'features[]', 'outcome'],
                  purpose: 'Core prediction output with SHAP attributions and outcome tracking.',
                },
                {
                  schema: 'ModelRegistryEntry',
                  fields: ['id', 'name', 'outputType', 'status', 'accuracy', 'hitRate', 'informationCoefficient'],
                  purpose: 'Model observatory registry with performance benchmarks.',
                },
                {
                  schema: 'BenchmarkComparison',
                  fields: ['modelId', 'benchmarkId', 'modelSharpe', 'benchmarkSharpe', 'informationRatio', 'skillScore'],
                  purpose: 'Compare model vs baseline: buy-and-hold, equal-weight, or another model.',
                },
                {
                  schema: 'IntelligenceTimelineEvent',
                  fields: ['kind', 'ts', 'title', 'symbols', 'confidence', 'significance', 'sourceId'],
                  purpose: 'Ordered research memory events for intelligence persistence.',
                },
              ].map((s) => (
                <div key={s.schema} style={{
                  padding: '12px 14px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--card)',
                }}>
                  <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
                    {s.schema}
                  </div>
                  <p className="ds-caption" style={{ margin: '0 0 8px', color: 'var(--muted-foreground)' }}>{s.purpose}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {s.fields.map((f) => (
                      <span key={f} style={{
                        fontSize: 9, fontFamily: 'ui-monospace, monospace', padding: '1px 5px',
                        borderRadius: 3, background: 'var(--muted)', color: 'var(--muted-foreground)',
                      }}>{f}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* WebSocket architecture note */}
          <section style={{ marginBottom: 24 }}>
            <div style={{
              padding: '14px 16px', borderRadius: 10,
              border: '1px solid rgba(158,126,58,0.25)',
              background: 'rgba(158,126,58,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Activity size={14} color="#9e7e3a" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#9e7e3a' }}>WebSocket Streaming Architecture</span>
              </div>
              <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
                The live streaming client is implemented and ready. It supports
                trade ticks, quote ticks, second aggregates, and minute aggregates.
                Auto-reconnect with exponential back-off is built in. API credentials
                are provisioned server-side — never exposed to the browser.
                A singleton registry ensures one connection per asset class is shared across all components.
              </p>
            </div>
          </section>
        </div>
      )}

      {/* ── Providers tab ── */}
      {activeTab === 'providers' && (
        <div>
          <section style={{ marginBottom: 20 }}>
            <h2 className="ds-heading" style={{ marginBottom: 8 }}>Provider Registry</h2>
            {health.loading && !health.data ? (
              <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Checking provider health…</p>
            ) : health.error && !health.data ? (
              <p className="ds-caption" style={{ color: 'var(--primary)' }}>
                Provider health unavailable.{' '}
                <button onClick={() => health.refresh()} style={{
                  background: 'transparent', border: 'none', color: 'var(--primary)',
                  textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit',
                }}>Retry</button>
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {(health.data ?? []).map((p) => (
                  <ProviderCard
                    key={p.id}
                    id={p.id}
                    configured={p.configured}
                    latencyMs={(p as { latencyMs?: number }).latencyMs}
                    consecutiveFailures={(p as { consecutiveFailures?: number }).consecutiveFailures}
                    lastSuccessAt={(p as { lastSuccessAt?: number }).lastSuccessAt}
                    lastFailureMessage={(p as { lastFailureMessage?: string }).lastFailureMessage}
                  />
                ))}
              </div>
            )}
          </section>

          <section style={{ marginBottom: 20 }}>
            <h2 className="ds-heading" style={{ marginBottom: 8 }}>Provider Routing Map</h2>
            <p className="ds-caption" style={{ marginBottom: 10, color: 'var(--muted-foreground)' }}>
              Fallback chains execute left-to-right. First successful provider wins and its response is cached.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ROUTING_DOMAINS.map((rd) => (
                <RoutingRow key={rd.domain} domain={rd.domain} chain={rd.chain} healthById={healthById} />
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ── Datasets tab ── */}
      {activeTab === 'datasets' && (
        <div>
          {Object.keys(byZone).map((zone) => {
            const meta = ZONE_META[zone];
            return (
              <section key={zone} style={{ marginBottom: 20 }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: meta?.color ?? 'var(--muted-foreground)' }}>{meta?.icon}</span>
                    <h2 className="ds-heading" style={{ margin: 0, fontFamily: 'ui-monospace, monospace' }}>{zone}</h2>
                    {meta && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                        background: 'var(--muted)', color: 'var(--muted-foreground)',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>{meta.label}</span>
                    )}
                  </div>
                  <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>{meta?.hint ?? ''}</span>
                </header>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                  {byZone[zone].map((ds) => (
                    <button
                      key={ds.name}
                      onClick={() => drawer.open({
                        title: ds.name, subtitle: `${zone} · ${ds.provider}`,
                        width: 560, body: <DatasetDrawerBody ds={ds} />,
                      })}
                      className="ds-surface ds-transition-fast"
                      style={{
                        textAlign: 'left', padding: 12, borderRadius: 10,
                        border: '1px solid var(--border)', background: 'var(--card)',
                        cursor: 'pointer', color: 'inherit', display: 'grid', gap: 4,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 700 }}>{ds.name}</span>
                        <SourceBadge source={ds.provider} />
                      </div>
                      <p className="ds-caption" style={{ margin: 0, color: 'var(--muted-foreground)' }}>{ds.description}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>cadence · {ds.cadence}</span>
                        <span style={{
                          padding: '1px 7px', borderRadius: 999,
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                          color: ds.status === 'wired' ? '#4E6040' : ds.status === 'partial' ? '#9e7e3a' : 'var(--muted-foreground)',
                          background: ds.status === 'wired' ? 'rgba(78,96,64,0.10)'
                            : ds.status === 'partial' ? 'rgba(158,126,58,0.10)'
                            : 'var(--muted)',
                          border: '1px solid color-mix(in srgb, currentColor 25%, transparent)',
                        }}>{ds.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Disclaimer />
      <style>{`@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
};
