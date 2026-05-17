/**
 * InstrumentDetailDrawer — bridges DashboardQuote into the existing
 * IntelligenceSidePanel. Call useInstrumentDrawer() from any dashboard page,
 * then pass openDrawer to table rows and heatmap cells.
 */
import React, { useCallback } from 'react';
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
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.28)',
          backdropFilter: 'blur(2px)',
          zIndex: 60,
          opacity: open ? 1 : 0,
          transition: 'opacity 200ms ease',
          pointerEvents: open ? 'auto' : 'none',
        }}
      />
      {/* Panel */}
      <aside
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: 'min(480px, 96vw)',
          background: 'var(--background)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-20px 0 48px rgba(0,0,0,0.18)',
          zIndex: 61,
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 220ms cubic-bezier(0.16,1,0.3,1)',
          overflow: 'hidden',
        }}
      >
        {row && (
          <IntelligenceSidePanel
            row={row}
            onClose={onClose}
          />
        )}
      </aside>
    </>
  );
};
