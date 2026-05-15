import React, { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import { RiskPanel } from '../components/quant/RiskPanel';
import { AlphaPanel } from '../components/quant/AlphaPanel';
import { PortfolioPanel } from '../components/quant/PortfolioPanel';
import { LabSessionCard } from '../components/quant/LabSessionCard';
import { useWorkspace } from '../components/WorkspaceContext';
import { useAuth } from '../components/AuthProvider';
import { useLabSessions } from '../hooks/useLabSessions';
import type { LabPanel, LabSession } from '../types';

type LabTab = 'risk' | 'alpha' | 'portfolio' | 'sessions';

const TABS: { id: LabTab; label: string; description: string }[] = [
  {
    id: 'risk',
    label: 'Risk Analytics',
    description: 'Volatility, drawdown, VaR, Sharpe, Sortino, Calmar, and historical stress scenarios',
  },
  {
    id: 'alpha',
    label: 'Alpha Research',
    description: 'Rolling vol, mean-reversion z-score, SMA crossover, benchmark correlation',
  },
  {
    id: 'portfolio',
    label: 'Portfolio Analytics',
    description: 'Multi-asset basket, correlation matrix, risk contributions, portfolio equity curve',
  },
  {
    id: 'sessions',
    label: 'Saved Sessions',
    description: 'Your saved Quant Lab analysis sessions with key metrics snapshots.',
  },
];

type PanelSavePayload = {
  name: string;
  panel: LabPanel;
  symbols: string[];
  timeframe: string;
  summary: Record<string, string | number>;
};

export const QuantLab: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LabTab>('risk');
  const { currentWorkspace, currentProject } = useWorkspace();
  const { user } = useAuth();
  const { sessions, loading: sessionsLoading, save: saveSession, remove: deleteSession } = useLabSessions(
    currentWorkspace?.id ?? null,
    currentProject?.id ?? null,
  );

  const handleSaveSession = async (payload: PanelSavePayload) => {
    if (!currentWorkspace?.id || !currentProject?.id || !user) {
      toast.error('No workspace selected');
      return;
    }
    try {
      const sessionPayload: Omit<LabSession, 'id' | 'createdAt'> = {
        ...payload,
        workspaceId: currentWorkspace.id,
        projectId: currentProject.id,
        savedBy: user.uid,
      };
      await saveSession(sessionPayload);
    } catch {
      toast.error('Failed to save session');
    }
  };

  return (
    <div style={{ padding: '0 24px 48px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Quant Lab"
        subtitle="Client-side analytics computed from live OHLCV data. No lookahead. No fake results."
      />

      {/* Tab bar */}
      <nav
        role="tablist"
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 20,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 0,
        }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '9px 16px',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--muted-foreground)',
              letterSpacing: '-0.01em',
              transition: 'color 0.12s, border-color 0.12s',
              marginBottom: -1,
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Active tab description */}
      <p
        className="ds-caption"
        style={{ color: 'var(--muted-foreground)', margin: '0 0 20px', fontSize: 12 }}
      >
        {TABS.find(t => t.id === activeTab)?.description}
      </p>

      {/* Panels — keep all mounted to preserve state across tab switches */}
      <div style={{ display: activeTab === 'risk' ? 'block' : 'none' }}>
        <RiskPanel
          defaultSymbol="SPY"
          onSaveSession={(p) => handleSaveSession(p)}
        />
      </div>
      <div style={{ display: activeTab === 'alpha' ? 'block' : 'none' }}>
        <AlphaPanel
          defaultSymbol="SPY"
          onSaveSession={(p) => handleSaveSession(p)}
        />
      </div>
      <div style={{ display: activeTab === 'portfolio' ? 'block' : 'none' }}>
        <PortfolioPanel
          onSaveSession={(p) => handleSaveSession(p)}
        />
      </div>

      {/* Saved Sessions tab */}
      <div style={{ display: activeTab === 'sessions' ? 'block' : 'none' }}>
        {sessionsLoading ? (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <div className="ds-empty" style={{ minHeight: 200 }}>
            <p className="ds-heading">No saved sessions yet</p>
            <p className="ds-caption" style={{ maxWidth: 320, textAlign: 'center' }}>
              Run any analysis in Risk, Alpha, or Portfolio tabs and click "Save Session" to persist results here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {sessions.map((s) => (
              <LabSessionCard
                key={s.id}
                session={s}
                onDelete={async (id) => {
                  try { await deleteSession(id); toast.success('Session deleted'); }
                  catch { toast.error('Failed to delete session'); }
                }}
              />
            ))}
          </div>
        )}
      </div>

      <Disclaimer />
    </div>
  );
};
