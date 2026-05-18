/**
 * InstrumentDetailDrawer — thin adapter on `IntelligenceDrawer` for dashboards
 * that already speak `DashboardQuote` and want a screener-style detail panel.
 *
 * The drawer chrome (slide-over, backdrop, ESC, focus) is supplied by
 * `IntelligenceDrawer`. The content is the existing `IntelligenceSidePanel`,
 * which keeps its own price/header/news rendering. Section scaffolds
 * (Summary / Historical / Narrative / Macro / Linked) plug in here from
 * later waves via the `sections` prop on `IntelligenceDrawer`.
 */
import React, { useCallback, useMemo } from 'react';
import { IntelligenceDrawer } from '../intelligence-drawer';
import { IntelligenceSidePanel } from '../quant/IntelligenceSidePanel';
import { useOHLCV } from '../../hooks/useMarket';
import { buildHistoricalPayload } from '../../lib/intelligence/historicalContext';
import { buildLinksForSymbol } from '../../lib/intelligence/crossLinks';
import {
  computeVolatilityState,
  computeMomentumScore,
  computeAnomalyTag,
  buildIntelligenceNote,
} from '../../services/screenerService';
import type { ScreenerRow } from '../../services/screenerService';
import type { DashboardQuote } from '../../services/dashboardService';

// Asset classes for which the gateway returns reliable OHLCV used in analog
// matching. FX/crypto bar history is patchier so we skip rather than show
// shaky analogs.
const OHLCV_ASSET_CLASSES = new Set<ScreenerRow['assetClass']>(['equity', 'etf', 'index']);

function dashboardQuoteToScreenerRow(
  q: DashboardQuote,
  assetClass: ScreenerRow['assetClass'] = 'etf',
  sector?: string,
): ScreenerRow {
  const volState = computeVolatilityState(q.changePercent);
  const momentumScore = computeMomentumScore(q.changePercent);
  return {
    symbol: q.symbol,
    name: q.name,
    assetClass,
    sector,
    price: q.price,
    changePercent: q.changePercent,
    change: q.change,
    high: q.high,
    low: q.low,
    open: q.open,
    previousClose: q.previousClose,
    volatilityState: volState,
    momentumScore,
    anomalyTag: computeAnomalyTag(q.changePercent),
    intelligenceNote: buildIntelligenceNote({ changePercent: q.changePercent, volatilityState: volState }),
    lastUpdated: q.lastUpdated,
  };
}

interface DrawerState {
  row: ScreenerRow | null;
  open: boolean;
}

interface UseInstrumentDrawerReturn {
  drawerState: DrawerState;
  openDrawer: (q: DashboardQuote, assetClass?: ScreenerRow['assetClass'], sector?: string) => void;
  closeDrawer: () => void;
}

export function useInstrumentDrawer(): UseInstrumentDrawerReturn {
  const [drawerState, setDrawerState] = React.useState<DrawerState>({ row: null, open: false });

  const openDrawer = useCallback((
    q: DashboardQuote,
    assetClass: ScreenerRow['assetClass'] = 'etf',
    sector?: string,
  ) => {
    setDrawerState({ row: dashboardQuoteToScreenerRow(q, assetClass, sector), open: true });
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerState((s) => ({ ...s, open: false }));
    // Match the drawer's exit transition so children stay mounted long enough
    // for the animation to play out.
    setTimeout(() => setDrawerState({ row: null, open: false }), 250);
  }, []);

  return { drawerState, openDrawer, closeDrawer };
}

interface InstrumentDetailDrawerProps {
  row: ScreenerRow | null;
  open: boolean;
  onClose: () => void;
}

export const InstrumentDetailDrawer: React.FC<InstrumentDetailDrawerProps> = ({ row, open, onClose }) => {
  const supportsHistory = row != null && OHLCV_ASSET_CLASSES.has(row.assetClass);
  // Pull a richer history than the side-panel's 90 bars so the analog engine
  // has at least 3 × window to match against.
  const ohlcv = useOHLCV(supportsHistory ? row!.symbol : null, '1day', 252);

  const historicalPayload = useMemo(() => {
    if (!supportsHistory) return null;
    return buildHistoricalPayload(ohlcv.data?.bars ?? null);
  }, [supportsHistory, ohlcv.data]);

  const linkedPayload = useMemo(() => {
    if (!row) return null;
    const dashboards = buildLinksForSymbol({ symbol: row.symbol, assetClass: row.assetClass });
    return dashboards.length > 0 ? { dashboards } : null;
  }, [row]);

  if (!open && !row) return null;

  const sections = (historicalPayload || linkedPayload)
    ? {
        ...(historicalPayload ? { historical: { payload: historicalPayload } } : {}),
        ...(linkedPayload ? { linked: { payload: linkedPayload } } : {}),
      }
    : undefined;

  return (
    <IntelligenceDrawer
      open={open}
      onClose={onClose}
      drawerId="instrument-detail-drawer"
      sections={sections}
    >
      {row && <IntelligenceSidePanel row={row} onClose={onClose} />}
    </IntelligenceDrawer>
  );
};
