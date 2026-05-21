/**
 * Curated macro / geopolitical event catalog used as ReferenceArea / ReferenceLine
 * overlays on time-series widgets. Dates are canonical and don't change, so no
 * fetch is needed.
 *
 * Categories control visibility and band tint independently. Single-day shocks
 * (`endTs === null`) render as a dashed vertical line; everything else renders
 * as a translucent band.
 */

export type EventCategory =
  | 'recession'
  | 'conflict'
  | 'crisis'
  | 'policy'
  | 'shock'
  | 'trade';

export interface MacroEvent {
  startTs: number;
  /** null = single-day shock; render as a vertical line instead of a band. */
  endTs: number | null;
  label: string;
  description: string;
  category: EventCategory;
}

export const EVENT_CATEGORIES: { id: EventCategory; label: string; tint: string; lineColor: string }[] = [
  { id: 'recession', label: 'Recessions',         tint: '#6B7280', lineColor: '#6B7280' }, // gray
  { id: 'conflict',  label: 'Wars & conflicts',   tint: '#DC2626', lineColor: '#DC2626' }, // red
  { id: 'crisis',    label: 'Financial crises',   tint: '#EA580C', lineColor: '#EA580C' }, // orange
  { id: 'policy',    label: 'Policy regimes',     tint: '#2563EB', lineColor: '#2563EB' }, // blue
  { id: 'shock',     label: 'Shocks',             tint: '#8B5CF6', lineColor: '#8B5CF6' }, // violet
  { id: 'trade',     label: 'Trade tensions',     tint: '#0D9488', lineColor: '#0D9488' }, // teal
];

function ts(iso: string): number { return Date.parse(iso); }

export const MACRO_EVENTS: MacroEvent[] = [
  // ─── Recessions (NBER) ───────────────────────────────────────────────
  { startTs: ts('1990-07-01'), endTs: ts('1991-03-31'),
    label: 'Early-90s recession',
    description: 'NBER-defined US recession following Gulf War oil shock.',
    category: 'recession' },
  { startTs: ts('2001-03-01'), endTs: ts('2001-11-30'),
    label: 'Dot-com recession',
    description: 'NBER recession following the bursting of the technology bubble.',
    category: 'recession' },
  { startTs: ts('2007-12-01'), endTs: ts('2009-06-30'),
    label: 'Great Financial Crisis',
    description: 'NBER recession triggered by US subprime mortgage crisis and global banking failures.',
    category: 'recession' },
  { startTs: ts('2020-02-01'), endTs: ts('2020-04-30'),
    label: 'COVID-19 recession',
    description: 'Pandemic-driven NBER recession; shortest on record.',
    category: 'recession' },

  // ─── Conflicts / wars ────────────────────────────────────────────────
  { startTs: ts('1990-08-02'), endTs: ts('1991-02-28'),
    label: 'Gulf War',
    description: 'Iraq invasion of Kuwait through Operation Desert Storm.',
    category: 'conflict' },
  { startTs: ts('2001-10-07'), endTs: ts('2021-08-30'),
    label: 'War in Afghanistan',
    description: 'US-led intervention from 9/11 response through Taliban return.',
    category: 'conflict' },
  { startTs: ts('2003-03-20'), endTs: ts('2011-12-18'),
    label: 'Iraq War',
    description: 'US-led invasion through troop withdrawal.',
    category: 'conflict' },
  { startTs: ts('2022-02-24'), endTs: null,
    label: 'Russia–Ukraine war',
    description: 'Full-scale Russian invasion of Ukraine. Triggered commodity price spike and energy realignment.',
    category: 'conflict' },
  { startTs: ts('2023-10-07'), endTs: null,
    label: 'Israel–Hamas war',
    description: 'Hamas attack and subsequent Israeli operations in Gaza.',
    category: 'conflict' },

  // ─── Financial crises (distinct from recessions) ─────────────────────
  { startTs: ts('1997-07-02'), endTs: ts('1998-12-31'),
    label: 'Asian Financial Crisis',
    description: 'Thai baht devaluation cascading through Asian currencies and equity markets.',
    category: 'crisis' },
  { startTs: ts('1998-08-17'), endTs: ts('1998-10-31'),
    label: 'LTCM / Russia default',
    description: 'Russian sovereign default and Long-Term Capital Management collapse.',
    category: 'crisis' },
  { startTs: ts('2010-05-01'), endTs: ts('2012-09-30'),
    label: 'Eurozone debt crisis',
    description: 'Sovereign-debt stress across Greece, Ireland, Portugal, Spain, Italy.',
    category: 'crisis' },
  { startTs: ts('2015-08-11'), endTs: ts('2015-09-30'),
    label: 'China devaluation',
    description: 'PBoC yuan devaluation and Shanghai equity crash.',
    category: 'crisis' },
  { startTs: ts('2023-03-10'), endTs: ts('2023-05-01'),
    label: 'US regional banking stress',
    description: 'Failures of Silicon Valley Bank, Signature Bank, First Republic; emergency Fed liquidity.',
    category: 'crisis' },

  // ─── Policy regimes ──────────────────────────────────────────────────
  { startTs: ts('1979-10-06'), endTs: ts('1982-08-31'),
    label: 'Volcker disinflation',
    description: 'Aggressive Fed rate hikes to break the 1970s inflation regime.',
    category: 'policy' },
  { startTs: ts('2013-05-22'), endTs: ts('2013-12-31'),
    label: 'Taper tantrum',
    description: 'Bernanke signal of QE tapering triggered bond sell-off and EM stress.',
    category: 'policy' },
  { startTs: ts('2020-03-15'), endTs: ts('2022-03-15'),
    label: 'COVID-era QE / ZIRP',
    description: 'Emergency Fed cuts to zero plus large-scale asset purchases.',
    category: 'policy' },
  { startTs: ts('2022-03-16'), endTs: ts('2023-07-26'),
    label: 'Post-COVID hiking cycle',
    description: 'Fed hikes from 0 to 5.5% to combat inflation; fastest pace since Volcker.',
    category: 'policy' },

  // ─── Shocks (single-day) ─────────────────────────────────────────────
  { startTs: ts('2001-09-11'), endTs: null,
    label: '9/11 attacks',
    description: 'Attacks on World Trade Center and Pentagon; US equity markets closed for 4 days.',
    category: 'shock' },
  { startTs: ts('2016-06-23'), endTs: null,
    label: 'Brexit referendum',
    description: 'UK voted to leave the European Union; GBP fell ~10% overnight.',
    category: 'shock' },
  { startTs: ts('2016-11-08'), endTs: null,
    label: 'US presidential election 2016',
    description: 'Surprise Trump victory; major repricing in equities, bonds, and FX.',
    category: 'shock' },
  { startTs: ts('2024-11-05'), endTs: null,
    label: 'US presidential election 2024',
    description: 'Trump returns to office; tariff and tax policy repricing.',
    category: 'shock' },

  // ─── Trade tensions ──────────────────────────────────────────────────
  { startTs: ts('2018-03-22'), endTs: ts('2020-01-15'),
    label: 'US–China trade war',
    description: 'Tariff escalation between US and China through Phase 1 deal.',
    category: 'trade' },
];

export function clipEventsToWindow(
  startTs: number,
  endTs: number,
  enabledCategories: Set<EventCategory>,
): MacroEvent[] {
  return MACRO_EVENTS
    .filter((e) => enabledCategories.has(e.category))
    .filter((e) => {
      const eEnd = e.endTs ?? e.startTs;
      return eEnd >= startTs && e.startTs <= endTs;
    })
    .map((e) => ({
      ...e,
      startTs: Math.max(e.startTs, startTs),
      endTs: e.endTs == null ? null : Math.min(e.endTs, endTs),
    }));
}

export function categoryTint(c: EventCategory): string {
  return EVENT_CATEGORIES.find((x) => x.id === c)?.tint ?? '#6B7280';
}
