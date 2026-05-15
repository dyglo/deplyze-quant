import React, { useState } from 'react';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import { RiskPanel } from '../components/quant/RiskPanel';
import { AlphaPanel } from '../components/quant/AlphaPanel';
import { PortfolioPanel } from '../components/quant/PortfolioPanel';

type LabTab = 'risk' | 'alpha' | 'portfolio';

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
];

export const QuantLab: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LabTab>('risk');

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
        <RiskPanel defaultSymbol="SPY" />
      </div>
      <div style={{ display: activeTab === 'alpha' ? 'block' : 'none' }}>
        <AlphaPanel defaultSymbol="SPY" />
      </div>
      <div style={{ display: activeTab === 'portfolio' ? 'block' : 'none' }}>
        <PortfolioPanel />
      </div>

      <Disclaimer />
    </div>
  );
};
