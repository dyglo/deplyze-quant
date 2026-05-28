/**
 * Deplyze Quant — Core domain types.
 *
 * Tenancy:
 *   workspace  → research desk
 *   project    → strategy / portfolio bucket
 *   membership → user ↔ workspace link (RLS pivot)
 */

// ─── Tenancy ────────────────────────────────────────────────────────────────

export type WorkspaceRole = 'owner' | 'admin' | 'manager' | 'analyst' | 'viewer';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role?: 'admin' | 'manager' | 'analyst' | 'viewer';
  orgId?: string;
  memberOrgIds?: string[];
  createdAt?: string;
}

// AuthProvider state shape (kept compatible with the existing provider).
export interface AuthState {
  user: import('firebase/auth').User | null;
  profile: UserProfile | null;
  loading: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  ownerUid: string;
  // Legacy fields kept for the existing WorkspaceContext / workspaceService.
  ownerId?: string;
  slug?: string;
  type?: string;
  description?: string;
  membersCount?: number;
  updatedAt?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  workspaceId?: string;
  name: string;
  description?: string;
  // Legacy fields kept for the existing flat `sites` collection writes.
  orgId?: string;
  address?: string;
  location?: string;
  status?: 'active' | 'archived' | 'pending';
  type?: string;
  createdAt: string;
}

// ─── Legacy tenancy aliases ─────────────────────────────────────────────────
// The existing AuthProvider, WorkspaceContext, and WorkspaceModals still
// reference these names. Pre-Quant Sentinel code wrote/read `organizations`
// and `sites` collections; new Quant code writes/reads `workspaces/{wid}/
// projects/{pid}/...`. Both vocabularies share the same shapes.

export interface Organization extends Workspace {}
export interface Site extends Project {}

export type WorkspaceMemberRole = 'owner' | 'admin' | 'manager' | 'analyst' | 'viewer';

export interface WorkspaceMember {
  id: string;
  uid: string;
  workspaceId: string;
  orgId?: string;
  role: WorkspaceMemberRole;
  email?: string;
  displayName?: string;
  joinedAt?: string;
}

export interface Membership {
  id: string;            // `${uid}_${workspaceId}`
  uid: string;
  workspaceId: string;
  role: WorkspaceRole;
  createdAt: string;
}

// ─── Markets & Instruments ──────────────────────────────────────────────────

export type AssetClass =
  | 'equity'
  | 'fx'
  | 'commodity'
  | 'index'
  | 'bond'
  | 'crypto'
  | 'macro';

export interface Instrument {
  symbol: string;        // canonical: 'EURUSD', 'AAPL', 'XAUUSD'
  displaySymbol: string; // 'EUR/USD', 'AAPL', 'Gold'
  name: string;
  assetClass: AssetClass;
  exchange?: string;
  currency?: string;
}

export interface Quote {
  symbol: string;
  price: number;
  change: number;        // absolute
  changePercent: number; // 0–100
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume?: number;
  ts: number;            // unix ms
  source: ProviderId;
}

export interface OHLCVBar {
  ts: number;            // bar open time, unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe =
  | '1min' | '5min' | '15min' | '30min' | '1h' | '4h' | '1day' | '1week' | '1month';

// ─── Macro ──────────────────────────────────────────────────────────────────

export interface MacroSeriesPoint {
  ts: number;            // unix ms
  value: number;
}

export interface MacroSeries {
  id: string;            // 'CPI', 'FEDFUNDS', 'DGS10', 'DXY', 'GDP'
  name: string;
  unit: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  points: MacroSeriesPoint[];
  source: ProviderId;
}

export interface EconomicEvent {
  id: string;
  ts: number;
  country: string;
  title: string;
  importance: 'low' | 'medium' | 'high';
  forecast?: string;
  actual?: string;
  previous?: string;
}

// ─── News & Research ────────────────────────────────────────────────────────

export interface NewsItem {
  id: string;
  headline: string;
  summary?: string;
  url: string;
  source: string;
  publishedAt: number;   // unix ms
  symbols?: string[];
  sentiment?: number;    // -1..1
}

export interface WebResearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: number;
  score?: number;        // provider-supplied relevance
}

// ─── Intelligence Artifacts (agent outputs) ─────────────────────────────────

export type ArtifactCategory =
  | 'regime'
  | 'volatility'
  | 'correlation'
  | 'sentiment'
  | 'positioning'
  | 'anomaly'
  | 'macro'
  | 'opportunity'
  | 'risk'
  | 'earnings';

export type ArtifactType =
  | 'briefing'
  | 'quant_lab_analysis'
  | 'copilot_insight'
  | 'macro_shift'
  | 'volatility_anomaly'
  | 'correlation_breakdown'
  | 'sentiment_cluster'
  | 'instrument_snapshot'
  | 'market_note';

export type ConfidenceBand = 'low' | 'medium' | 'high' | 'very-high';

export interface IntelligenceArtifact {
  id: string;
  workspaceId: string;
  projectId: string;
  category: ArtifactCategory;
  title: string;
  narrative: string;            // Gemini-generated synthesis
  symbols: string[];
  confidence: number;           // 0..1
  significance: number;         // 0..1 (statistical, not just confidence)
  evidence: Array<{
    label: string;
    value: string | number;
    source: ProviderId | 'derived';
  }>;
  createdAt: number;            // unix ms
  agentId?: string;
  // V2 extensions — all optional for backward compatibility
  artifactType?: ArtifactType;           // V2 type literal
  source?: 'agent' | 'user';            // 'agent' for gateway-written, 'user' for client-created
  summary?: string;                      // 2-4 sentence executive summary
  body?: string;                         // markdown content
  relatedSymbols?: string[];
  relatedMacroIndicators?: string[];
  relatedDatasets?: string[];
  relatedProviders?: string[];
  confidenceScore?: number;              // V2 alias; UI prefers this over the existing `confidence` field
  completenessScore?: number;
  sourceReferences?: string[];
  tags?: string[];
  saved?: boolean;
  createdBy?: string;                    // uid; only set on user-created artifacts
  updatedAt?: number;                    // unix ms
}

// ─── Regime, correlations, ML outputs ───────────────────────────────────────

export type RegimeLabel =
  | 'trending-bull'
  | 'trending-bear'
  | 'ranging'
  | 'volatility-expansion'
  | 'volatility-compression'
  | 'risk-on'
  | 'risk-off';

export interface RegimeState {
  symbol: string;
  label: RegimeLabel;
  confidence: number;          // 0..1
  since: number;               // unix ms — start of current regime
  history: Array<{ from: number; to: number; label: RegimeLabel }>;
}

export interface CorrelationCell {
  rowSymbol: string;
  colSymbol: string;
  value: number;               // -1..1
  windowDays: number;
}

export interface CorrelationSnapshot {
  ts: number;
  windowDays: number;
  symbols: string[];
  cells: CorrelationCell[];
}

export interface ModelOutput {
  modelId: string;             // 'regime-classifier', 'vol-forecaster', ...
  symbol: string;
  ts: number;
  prediction: number | string;
  confidence: number;
  features?: Record<string, number>;
}

// ─── Briefings & watchlists ─────────────────────────────────────────────────

export type BriefingKind =
  | 'daily-macro'
  | 'weekly-regime'
  | 'volatility'
  | 'cross-asset'
  | 'positioning'
  | 'sector-rotation'
  | 'earnings'
  | 'risk'
  | 'trade-thesis'
  | 'market-stress';

export interface Briefing {
  id: string;
  workspaceId: string;
  projectId: string;
  kind: BriefingKind | 'daily-pulse' | 'instrument-snapshot' | 'sentiment';
  title: string;
  summary: string;             // 2–4 sentence executive summary
  body: string;                // markdown
  highlights: string[];
  symbols: string[];
  createdAt: number;
  source: 'agent' | 'manual';
  /** Optional metadata written by the gateway briefing generator. */
  sourceCoverage?: number;
  dataCompleteness?: number;
  params?: Record<string, unknown> | null;
}

export interface Watchlist {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  symbols: string[];
  createdAt: number;
}

// ─── Agent runs (audit log) ─────────────────────────────────────────────────

export interface AgentRun {
  id: string;
  workspaceId: string;
  projectId: string;
  agentId: string;
  startedAt: number;
  finishedAt?: number;
  status: 'running' | 'succeeded' | 'failed';
  artifactsProduced: number;
  errorMessage?: string;
}

// ─── V2: Pins ────────────────────────────────────────────────────────────────

export interface ArtifactPin {
  id: string;          // equals artifactId (used as document ID for O(1) lookup)
  workspaceId: string;
  projectId: string;
  pinnedBy: string;    // uid
  pinnedAt: number;    // unix ms
  tags?: string[];
  note?: string;
}

// ─── V2: Copilot Insights ────────────────────────────────────────────────────

export interface CopilotInsight {
  id: string;
  workspaceId: string;
  projectId: string;
  content: string;     // assistant message markdown text
  savedBy: string;     // uid
  symbols?: string[];  // from context chips at save time
  createdAt: number;   // unix ms
}

// ─── V2: Quant Lab Sessions ───────────────────────────────────────────────────

export type LabPanel = 'risk' | 'alpha' | 'portfolio';

export interface LabSessionAssetSnapshot {
  symbol: string;
  weight?: number;        // portfolio weight 0-1
  annVol: number;
  annReturn: number;
  sharpe: number;
  beta?: number;
  alpha?: number;
  infoRatio?: number;
  trackingError?: number;
  equityCurve?: number[]; // rebased to 100, max 252 points
}

export interface LabSession {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  panel: LabPanel;
  savedBy: string;     // uid
  createdAt: number;   // unix ms
  symbols: string[];   // symbol(s) analysed
  timeframe: string;   // e.g. '1day'
  summary: Record<string, string | number>; // key scalars
  // V1.0: rich snapshot for session cards + Restore
  rawSnapshot?: {
    basket?: LabSessionAssetSnapshot[];
    riskMetrics?: {
      annVol: number; mdd: number; sharpe: number; sortino: number;
      hVar95: number; hVar99: number; annReturn: number;
      equityCurve?: number[];
    };
    alphaMetrics?: LabSessionAssetSnapshot[];
    portfolioMetrics?: {
      portVol: number; portReturn: number; portSharpe: number; portMdd: number;
      diversification: number; equityCurve?: number[];
    };
  };
}

// ─── V2: Research Timeline ────────────────────────────────────────────────────

export type TimelineEvent =
  | { kind: 'artifact';   id: string; createdAt: number; data: IntelligenceArtifact }
  | { kind: 'briefing';   id: string; createdAt: number; data: Briefing }
  | { kind: 'labSession'; id: string; createdAt: number; data: LabSession }
  | { kind: 'insight';    id: string; createdAt: number; data: CopilotInsight };

// ─── Copilot ────────────────────────────────────────────────────────────────

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  contextChips?: Array<{ kind: 'instrument' | 'timeframe' | 'artifact'; value: string }>;
}

// ─── Providers ──────────────────────────────────────────────────────────────

export type ProviderId =
  // V1 providers
  | 'finnhub'
  | 'alpha_vantage'
  | 'twelve_data'
  | 'tavily'
  | 'serper'
  | 'gemini'
  // V2 institutional providers
  | 'polygon'
  | 'fmp'
  | 'eodhd'
  | 'edgar'
  // Derived/computed
  | 'derived'
  | 'firestore';

export interface ProviderHealth {
  id: ProviderId;
  configured: boolean;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastFailureMessage?: string;
  latencyMs?: number;
  consecutiveFailures?: number;
}

// ─── V2: Prediction & Model Output Infrastructure ────────────────────────────
// Schemas prepare the platform for institutional model outputs without
// generating fake predictions. Real model outputs flow through these contracts.

export type PredictionHorizon = '1d' | '5d' | '1w' | '1m' | '3m' | '6m' | '1y';
export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'very-high';
export type ModelOutputType = 'regime' | 'volatility' | 'directional' | 'correlation' | 'anomaly' | 'factor';

export interface PredictionArtifact {
  id: string;
  workspaceId: string;
  projectId: string;
  modelId: string;
  modelVersion?: string;
  outputType: ModelOutputType;
  symbol?: string;
  symbols?: string[];
  horizon: PredictionHorizon;
  generatedAt: number;          // unix ms
  validUntil?: number;          // unix ms — when prediction expires
  // Prediction output
  prediction: string | number;  // model output value or label
  confidence: number;           // 0..1
  confidenceLevel: ConfidenceLevel;
  // Explainability
  features?: Array<{
    name: string;
    value: number;
    contribution: number;    // SHAP-style attribution; -1..1
    direction: 'positive' | 'negative';
  }>;
  explanation?: string;        // narrative explanation
  // Benchmark comparison
  benchmarkPrediction?: string | number;
  benchmarkModelId?: string;
  // Outcome tracking (filled in after horizon elapses)
  outcome?: {
    actualValue?: string | number;
    resolvedAt?: number;
    error?: number;            // |predicted - actual|
    accuracy?: number;         // 0..1
    notes?: string;
  };
  tags?: string[];
  source: 'model' | 'agent' | 'research';
  createdBy?: string;
}

// ─── V2: Company Profile (normalised across providers) ───────────────────────

export interface CompanyProfile {
  symbol: string;
  name: string;
  sector?: string;
  industry?: string;
  country?: string;
  exchange?: string;
  currency?: string;
  marketCap?: number;
  beta?: number;
  cik?: string;
  isin?: string;
  ceo?: string;
  employees?: number;
  description?: string;
  website?: string;
  logo?: string;
  ipoDate?: string;
  isEtf?: boolean;
  isActivelyTrading?: boolean;
  providerId: string;
  fetchedAt: number;
}

// ─── V2: Fundamental Snapshot (normalised) ───────────────────────────────────

export interface FundamentalMetrics {
  symbol: string;
  date: string;
  period?: string;
  // Valuation
  peRatio?: number;
  pbRatio?: number;
  evToEbitda?: number;
  evToSales?: number;
  priceToSales?: number;
  // Profitability
  roe?: number;
  roic?: number;
  roa?: number;
  operatingMargin?: number;
  netMargin?: number;
  grossMargin?: number;
  // Growth
  revenueGrowthYoY?: number;
  earningsGrowthYoY?: number;
  // Financial health
  debtToEquity?: number;
  currentRatio?: number;
  interestCoverage?: number;
  netDebtToEbitda?: number;
  // Returns / yield
  dividendYield?: number;
  earningsYield?: number;
  fcfYield?: number;
  // Technical
  beta?: number;
  week52High?: number;
  week52Low?: number;
  ma50?: number;
  ma200?: number;
  // Raw
  revenue?: number;
  netIncome?: number;
  ebitda?: number;
  eps?: number;
  marketCap?: number;
  enterpriseValue?: number;
  providerId: string;
  fetchedAt: number;
}

// ─── V2: Earnings Event (normalised) ─────────────────────────────────────────

export interface EarningsEvent {
  date: string;
  symbol: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  surpriseAbs?: number | null;
  surprisePct?: number | null;
  revenue?: number | null;
  revenueEstimate?: number | null;
  time?: string;
  fiscalDateEnding?: string;
}

// ─── V2: SEC Filing (normalised) ─────────────────────────────────────────────

export interface SecFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  form: string;
  description: string;
  viewUrl: string;
}

// ─── V2: Intelligence Archive entry ──────────────────────────────────────────

export type ArchiveEntryKind =
  | 'artifact'
  | 'briefing'
  | 'labSession'
  | 'insight'
  | 'prediction'
  | 'regime_snapshot'
  | 'anomaly'
  | 'earnings_event';

export interface IntelligenceArchiveEntry {
  kind: ArchiveEntryKind;
  id: string;
  createdAt: number;
  title: string;
  summary?: string;
  symbols?: string[];
  tags?: string[];
  confidence?: number;
  significance?: number;
  providerId?: string;
}
