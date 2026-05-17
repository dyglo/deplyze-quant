/**
 * Shared types for intelligence drawer sections.
 *
 * Each section is a pure UI component. The hosting page or hook computes the
 * payload from real data (`lib/quant/*`, `services/*`) and passes it in.
 * Sections render their own empty / loading / error states.
 */

export type SectionState = 'idle' | 'loading' | 'error' | 'empty' | 'ready';

export interface IntelligenceSectionProps {
  state?: SectionState;
  error?: string;
}

export interface SummaryPayload {
  headline: string;
  body?: string;
  /** Short data-grounded signals. Sourced from `dashboardService.classify*`. */
  signals?: string[];
  /** Visual tone — risk-on/off, etc. */
  tone?: 'positive' | 'negative' | 'neutral' | 'warning';
}

export interface HistoricalAnalog {
  label: string;
  /** e.g. "March 2023 banking stress" */
  windowLabel?: string;
  /** Similarity 0..1 */
  similarity?: number;
  /** Forward 60d outcome if computed; rendered as percent. */
  forwardReturn60d?: number;
  /** Free text from `quant/contextualAnalog`. */
  note?: string;
}

export interface HistoricalPayload {
  /** Current value's percentile vs lookback (0..1). */
  percentile?: number;
  percentileLabel?: string;
  analogs?: HistoricalAnalog[];
  /** Optional explanatory line. */
  note?: string;
}

export interface RelatedAsset {
  symbol: string;
  label?: string;
  /** Pearson correlation, -1..1 */
  correlation?: number;
  /** Recent change percent for at-a-glance context. */
  changePercent?: number;
  /** Click handler delegated to the page (cross-link or open drawer). */
  onClick?: () => void;
}

export interface RelatedPayload {
  assets?: RelatedAsset[];
  /** Optional caption above the list. */
  note?: string;
}

export interface NarrativeTheme {
  /** e.g. "AI concentration", "EM stress" */
  label: string;
  /** Strength score 0..1 from `narrativeProducer`. */
  strength?: number;
  /** Optional one-liner. */
  body?: string;
  onClick?: () => void;
}

export interface NarrativePayload {
  themes?: NarrativeTheme[];
  note?: string;
}

export interface MacroIndicator {
  label: string;
  value?: string;
  /** Visual tone for the chip — green / red / amber / neutral. */
  tone?: 'positive' | 'negative' | 'neutral' | 'warning';
  /** Optional context line ("inverted 14 months"). */
  hint?: string;
}

export interface MacroPayload {
  /** Current regime label. */
  regime?: string;
  /** Indicators (curve state, dollar, real rates, etc.). */
  indicators?: MacroIndicator[];
  note?: string;
}

export interface LinkedDashboard {
  /** e.g. "Global Yields", "FX & Liquidity" */
  label: string;
  description?: string;
  /** Route path. */
  to: string;
  /** Optional query / state preserved across navigation. */
  state?: Record<string, unknown>;
  /** Optional pre-filter (e.g. "EM only"). */
  filter?: string;
}

export interface LinkedPayload {
  dashboards?: LinkedDashboard[];
  note?: string;
}
