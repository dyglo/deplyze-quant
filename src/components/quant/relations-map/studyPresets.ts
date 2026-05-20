/**
 * Named study presets for the Relations Map.
 *
 * Each preset captures a specific research question and sets the exact
 * edge-kind scope + optional spotlight + strength floor that best
 * answers it. Applying a preset is a one-click way to declare intent
 * before exploring the graph — Palantir calls this a "lens."
 */
import type { EdgeKind } from '../../../lib/quant/relations/types';
import type { SpotlightMode } from './OverlayControls';

export interface StudyPreset {
  id: string;
  label: string;
  /** Short phrase — displayed in the HUD study indicator. */
  studyLabel: string;
  /** One-sentence description of the research question this answers. */
  description: string;
  edgeKinds: EdgeKind[];
  spotlight?: SpotlightMode;
  strengthThreshold?: number;
  /** Accent colour token for the preset chip. */
  accent: string;
}

export const STUDY_PRESETS: StudyPreset[] = [
  {
    id: 'full-view',
    label: 'Full View',
    studyLabel: 'Full topology',
    description: 'All relationship types visible — complete market topology.',
    edgeKinds: [
      'correlation', 'inverse-correlation', 'supplier', 'customer',
      'benchmark-dependency', 'sector-dependency', 'volatility-transmission',
      'macro-dependency', 'earnings-influence', 'thematic',
      'artifact-link', 'historical', 'regime',
    ],
    accent: 'var(--muted-foreground)',
  },
  {
    id: 'macro-sensitivity',
    label: 'Macro Sensitivity',
    studyLabel: 'Macro sensitivity',
    description: 'How this instrument responds to macro regimes, rates, and benchmark shifts.',
    edgeKinds: ['macro-dependency', 'regime', 'benchmark-dependency', 'volatility-transmission'],
    spotlight: 'macro',
    accent: 'var(--chart-4)',
  },
  {
    id: 'sector-topology',
    label: 'Sector Topology',
    studyLabel: 'Sector topology',
    description: 'Peer cluster, sector ETF dependencies, and thematic co-movement within the sector.',
    edgeKinds: ['sector-dependency', 'thematic', 'correlation', 'earnings-influence'],
    spotlight: 'sector',
    accent: 'var(--chart-3)',
  },
  {
    id: 'volatility-chain',
    label: 'Volatility Chain',
    studyLabel: 'Volatility chain',
    description: 'Volatility spillover paths — where stress transmits from and to.',
    edgeKinds: ['volatility-transmission', 'inverse-correlation', 'regime'],
    spotlight: 'volatility',
    strengthThreshold: 0.2,
    accent: 'var(--destructive)',
  },
  {
    id: 'correlation-cluster',
    label: 'Correlation Cluster',
    studyLabel: 'Correlation cluster',
    description: 'What moves together with this instrument and what structurally hedges it.',
    edgeKinds: ['correlation', 'inverse-correlation', 'thematic'],
    spotlight: 'correlation',
    accent: 'var(--chart-2)',
  },
  {
    id: 'supply-chain',
    label: 'Supply Chain',
    studyLabel: 'Supply chain',
    description: 'Revenue exposure through suppliers, customers, and earnings cascade.',
    edgeKinds: ['supplier', 'customer', 'earnings-influence'],
    accent: 'var(--chart-3)',
  },
  {
    id: 'research-links',
    label: 'Research Links',
    studyLabel: 'Research links',
    description: 'Research-derived intelligence — historical analogs and artifact connections.',
    edgeKinds: ['artifact-link', 'historical', 'regime', 'thematic'],
    accent: 'var(--chart-1)',
  },
];

const STORAGE_KEY = 'relations-map-study-preset';

export function savePresetToStorage(presetId: string): void {
  try { localStorage.setItem(STORAGE_KEY, presetId); } catch { /* ignore */ }
}

export function loadPresetFromStorage(): StudyPreset | null {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return id ? (STUDY_PRESETS.find((p) => p.id === id) ?? null) : null;
  } catch { return null; }
}

/** Returns the preset whose edgeKinds exactly matches the current set, or null. */
export function detectActivePreset(
  edgeKinds: Set<EdgeKind>,
  spotlight: SpotlightMode,
  strengthThreshold: number,
): StudyPreset | null {
  const kindKey = [...edgeKinds].sort().join(',');
  for (const p of STUDY_PRESETS) {
    if ([...p.edgeKinds].sort().join(',') !== kindKey) continue;
    if (p.spotlight != null && p.spotlight !== spotlight) continue;
    if (p.strengthThreshold != null && p.strengthThreshold !== strengthThreshold) continue;
    return p;
  }
  return null;
}
