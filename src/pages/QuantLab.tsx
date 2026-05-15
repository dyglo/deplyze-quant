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
import { createArtifactFromQuantLab } from '../services/artifactService';
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
  const { currentWorkspace, currentProject, projects } = useWorkspace();
  const { user } = useAuth();
  const { sessions, loading: sessionsLoading, save: saveSession, remove: deleteSession } = useLabSessions(
    currentWorkspace?.id ?? null,
    currentProject?.id ?? null,
  );

  const handleSaveAsArtifact = async (session: LabSession) => {
    if (!currentWorkspace?.id || !currentProject?.id || !user) return;
    try {
      await createArtifactFromQuantLab(currentWorkspace.id, currentProject.id, session, user.uid);
      toast.success('Saved to Research Timeline');
    } catch {
      toast.error('Failed to save artifact');
    }
  };

  const handleSaveSession = async (payload: PanelSavePayload) => {
    if (!currentWorkspace?.id || !user) {
      toast.error('Please select an Institutional Portfolio first');
      return;
    }

    if (!currentProject?.id) {
      toast.error('Please select a Research Asset to save this session to.');
      // In a real implementation, we would open a selection modal here.
      // For now, we'll prompt the user to use the sidebar to select a project.
      return;
    }

    const sessionPayload: Omit<LabSession, 'id' | 'createdAt'> = {
      ...payload,
      workspaceId: currentWorkspace.id,
      projectId: currentProject.id,
      savedBy: user.uid,
    };
    const sessionId = await saveSession(sessionPayload);

    const savedSession: LabSession = {
      id: sessionId,
      ...sessionPayload,
      createdAt: new Date().getTime(),
    };

    toast.success('Session saved', {
      action: {
        label: 'Save as Artifact',
        onClick: () => handleSaveAsArtifact(savedSession),
      },
    });
  };

  return (
    <div style={{ padding: '0 24px 48px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <PageHeader
          title="Quant Lab"
          subtitle="Client-side analytics computed from live OHLCV data. No lookahead. No fake results."
        />
        
        {/* Project Selector for Quant Lab — only shown if in "All Sites" or no project selected */}
        {!currentProject && currentWorkspace && (
          <div style={{ 
            background: 'var(--card)', 
            border: '1px solid var(--border)', 
            padding: '8px 12px', 
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
              Research Target
            </span>
            <select 
              className="ds-input"
              style={{ padding: '4px 8px', fontSize: 12, minWidth: 160 }}
              onChange={(e) => {
                const proj = projects.find(p => p.id === e.target.value);
                if (proj) {
                  // This is a bit of a hack since WorkspaceContext doesn't expose a setter for currentProject 
                  // but we can trigger it by updating localStorage and waiting for sync if needed,
                  // or just let the user know they need to select it.
                  localStorage.setItem(`deplyze_active_proj_id_${currentWorkspace.id}`, proj.id);
                  window.dispatchEvent(new Event('storage')); // Notify context if it listens
                  toast.success(`Target set to ${proj.name}. You can now save.`);
                  window.location.reload(); // Force refresh to update context for now
                }
              }}
              value=""
            >
              <option value="" disabled>Select Research Asset...</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

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
