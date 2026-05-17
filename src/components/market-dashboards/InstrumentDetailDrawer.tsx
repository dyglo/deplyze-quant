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
import React, { useCallback } from 'react';
import { IntelligenceDrawer } from '../intelligence-drawer';
import { IntelligenceSidePanel } from '../quant/IntelligenceSidePanel';
import {
  computeVolatilityState,
  computeMomentumScore,
  computeAnomalyTag,
  buildIntelligenceNote,
} from '../../services/screenerService';
import type { ScreenerRow } from '../../services/screenerService';
import type { DashboardQuote } from '../../services/dashboardService';

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
  if (!open && !row) return null;

  return (
    <IntelligenceDrawer open={open} onClose={onClose} drawerId="instrument-detail-drawer">
      {row && <IntelligenceSidePanel row={row} onClose={onClose} />}
    </IntelligenceDrawer>
  );
};
