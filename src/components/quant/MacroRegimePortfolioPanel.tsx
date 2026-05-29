/**
 * MacroRegimePortfolioPanel — the regime → portfolio read-through.
 *
 * Turns the Macro Regime Desk from a monitor into decision support: given the
 * current macro regime, how is the user's *active portfolio* exposed? It pulls
 * the selected portfolio's holdings, runs them through the regime-vulnerability
 * engine (`POST /v1/agents/vulnerability`), and reuses the institutional
 * PortfolioVulnerabilityPanel.
 *
 * The vulnerability computation is produced by the quant-engine from recent
 * regime/risk/liquidity/volatility agent signals; when those are stale or the
 * engine is unreachable it returns nothing, so we surface an explicit reason +
 * retry rather than an opaque empty state.
 */

import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, RefreshCw } from 'lucide-react';
import { usePortfolioWorkspace } from '../../hooks/usePortfolioWorkspace';
import { usePortfolioVulnerability } from '../../hooks/useAgentReasoning';
import { PortfolioVulnerabilityPanel } from '../portfolio/PortfolioVulnerabilityPanel';
import type { HoldingInput } from '../../services/reasoningService';

export const MacroRegimePortfolioPanel: React.FC = () => {
  const { selectedPortfolio, activeHoldings, effectiveWeights, loading } = usePortfolioWorkspace();

  const holdings: HoldingInput[] = useMemo(
    () => activeHoldings.map((h) => ({
      symbol: h.symbol,
      weight: effectiveWeights[h.symbol] ?? 0,
      asset_class: h.assetClass,
    })),
    [activeHoldings, effectiveWeights],
  );

  const vuln = usePortfolioVulnerability(holdings, selectedPortfolio?.id);

  const hasPortfolio = !!selectedPortfolio && activeHoldings.length > 0;

  // A usable result must actually carry dimension scores. The engine can return
  // a 200 with an `error` field (e.g. stale regime signals) and no dimensions.
  const usable = vuln.data && vuln.data.dimensions && Object.keys(vuln.data.dimensions).length > 0
    ? vuln.data
    : null;
  const unavailableReason = vuln.error ?? vuln.data?.error ?? null;

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Briefcase size={16} />
        <h2 className="ds-heading" style={{ margin: 0 }}>Portfolio Regime Exposure</h2>
      </div>
      <p className="ds-caption" style={{ margin: '0 0 12px', color: 'var(--muted-foreground)', fontSize: 11 }}>
        How the current macro regime stresses your active portfolio
        {selectedPortfolio ? ` · ${selectedPortfolio.name}` : ''}.
      </p>

      {loading ? (
        <div className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>Loading portfolio…</p>
        </div>
      ) : !hasPortfolio ? (
        <div className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
          <p className="ds-body" style={{ margin: '0 0 8px', color: 'var(--foreground)' }}>
            No active portfolio holdings.
          </p>
          <p className="ds-caption" style={{ margin: '0 0 12px', color: 'var(--muted-foreground)' }}>
            Create or select a portfolio with positions to see which regime dimensions stress it and which holdings drive that exposure.
          </p>
          <Link
            to="/portfolio"
            className="ds-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, textDecoration: 'none' }}
          >
            Go to Portfolio
          </Link>
        </div>
      ) : vuln.loading ? (
        <PortfolioVulnerabilityPanel result={null} loading holdingsCount={activeHoldings.length} />
      ) : usable ? (
        <PortfolioVulnerabilityPanel result={usable} holdingsCount={activeHoldings.length} />
      ) : (
        <div className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
          <p className="ds-body" style={{ margin: '0 0 8px', color: 'var(--foreground)' }}>
            Regime vulnerability is temporarily unavailable for these holdings.
          </p>
          <p className="ds-caption" style={{ margin: '0 0 12px', color: 'var(--muted-foreground)' }}>
            It is computed by the macro-intelligence engine from recent regime, risk, liquidity and
            volatility signals. This usually means those signals are still refreshing or the engine
            is briefly unreachable — the rest of this page is unaffected.
            {unavailableReason ? ` (${unavailableReason})` : ''}
          </p>
          <button
            type="button"
            onClick={() => vuln.refetch()}
            className="ds-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}
    </section>
  );
};
