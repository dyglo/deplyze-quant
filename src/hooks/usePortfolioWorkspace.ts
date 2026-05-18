/**
 * usePortfolioWorkspace — real-time portfolio + holdings state.
 * Manages CRUD for portfolios and their holdings within the current workspace.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../components/AuthProvider';
import { useWorkspace } from '../components/WorkspaceContext';
import {
  subscribeToPortfolios,
  createPortfolio,
  updatePortfolio,
  archivePortfolio,
  deletePortfolio,
  subscribeToHoldings,
  addHolding,
  updateHolding,
  removeHolding,
  subscribeToPortfolioObservations,
} from '../services/portfolioService';
import type { Portfolio, Holding, PortfolioIntelligenceObservation } from '../lib/portfolio/schemas';
import { toast } from 'sonner';

interface UsePortfolioWorkspaceReturn {
  portfolios: Portfolio[];
  selectedPortfolio: Portfolio | null;
  holdings: Holding[];
  observations: PortfolioIntelligenceObservation[];
  loading: boolean;
  holdingsLoading: boolean;

  selectPortfolio: (id: string | null) => void;
  createNew: (params: Parameters<typeof createPortfolio>[2]) => Promise<string>;
  updateSelected: (updates: Parameters<typeof updatePortfolio>[1]) => Promise<void>;
  archiveSelected: () => Promise<void>;

  addNewHolding: (params: Parameters<typeof addHolding>[2]) => Promise<string>;
  updateExistingHolding: (holdingId: string, updates: Parameters<typeof updateHolding>[2]) => Promise<void>;
  removeExistingHolding: (holdingId: string) => Promise<void>;

  /** Computed equal-weight allocation when no explicit weights set */
  effectiveWeights: Record<string, number>;
}

export function usePortfolioWorkspace(): UsePortfolioWorkspaceReturn {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    localStorage.getItem('deplyze_active_portfolio_id')
  );
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [observations, setObservations] = useState<PortfolioIntelligenceObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [holdingsLoading, setHoldingsLoading] = useState(false);

  // Subscribe to portfolios
  useEffect(() => {
    if (!user || !currentWorkspace) {
      setPortfolios([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToPortfolios(user.uid, currentWorkspace.id, (ps) => {
      setPortfolios(ps);
      setLoading(false);
      // Auto-select first portfolio if none selected
      setSelectedId((prev) => {
        if (prev && ps.find(p => p.id === prev)) return prev;
        const first = ps[0]?.id ?? null;
        if (first) localStorage.setItem('deplyze_active_portfolio_id', first);
        return first;
      });
    });
    return unsub;
  }, [user, currentWorkspace]);

  // Subscribe to holdings of selected portfolio
  useEffect(() => {
    if (!selectedId) {
      setHoldings([]);
      setObservations([]);
      return;
    }
    setHoldingsLoading(true);
    const unsubH = subscribeToHoldings(selectedId, (hs) => {
      setHoldings(hs);
      setHoldingsLoading(false);
    });
    const unsubO = subscribeToPortfolioObservations(selectedId, setObservations);
    return () => { unsubH(); unsubO(); };
  }, [selectedId]);

  const selectedPortfolio = portfolios.find(p => p.id === selectedId) ?? null;

  // Effective weights: use explicit weights if all set, otherwise equal-weight
  const effectiveWeights: Record<string, number> = (() => {
    if (holdings.length === 0) return {};
    const hasWeights = holdings.every(h => typeof h.weight === 'number' && h.weight > 0);
    if (hasWeights) {
      const total = holdings.reduce((s, h) => s + (h.weight ?? 0), 0);
      return Object.fromEntries(holdings.map(h => [h.symbol, (h.weight ?? 0) / total]));
    }
    const eq = 1 / holdings.length;
    return Object.fromEntries(holdings.map(h => [h.symbol, eq]));
  })();

  const selectPortfolio = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) localStorage.setItem('deplyze_active_portfolio_id', id);
    else localStorage.removeItem('deplyze_active_portfolio_id');
  }, []);

  const createNew = useCallback(async (params: Parameters<typeof createPortfolio>[2]) => {
    if (!user || !currentWorkspace) throw new Error('No active session');
    const id = await createPortfolio(user.uid, currentWorkspace.id, params);
    selectPortfolio(id);
    toast.success(`Portfolio "${params.name}" created`);
    return id;
  }, [user, currentWorkspace, selectPortfolio]);

  const updateSelected = useCallback(async (updates: Parameters<typeof updatePortfolio>[1]) => {
    if (!selectedId) return;
    await updatePortfolio(selectedId, updates);
  }, [selectedId]);

  const archiveSelected = useCallback(async () => {
    if (!selectedId) return;
    await archivePortfolio(selectedId);
    selectPortfolio(null);
    toast.info('Portfolio archived');
  }, [selectedId, selectPortfolio]);

  const addNewHolding = useCallback(async (params: Parameters<typeof addHolding>[2]) => {
    if (!selectedId || !currentWorkspace) throw new Error('No active portfolio');
    const id = await addHolding(selectedId, currentWorkspace.id, params);
    toast.success(`${params.symbol} added to portfolio`);
    return id;
  }, [selectedId, currentWorkspace]);

  const updateExistingHolding = useCallback(async (holdingId: string, updates: Parameters<typeof updateHolding>[2]) => {
    if (!selectedId) return;
    await updateHolding(selectedId, holdingId, updates);
  }, [selectedId]);

  const removeExistingHolding = useCallback(async (holdingId: string) => {
    if (!selectedId) return;
    const h = holdings.find(h => h.id === holdingId);
    await removeHolding(selectedId, holdingId);
    if (h) toast.info(`${h.symbol} removed from portfolio`);
  }, [selectedId, holdings]);

  return {
    portfolios,
    selectedPortfolio,
    holdings,
    observations,
    loading,
    holdingsLoading,
    selectPortfolio,
    createNew,
    updateSelected,
    archiveSelected,
    addNewHolding,
    updateExistingHolding,
    removeExistingHolding,
    effectiveWeights,
  };
}
