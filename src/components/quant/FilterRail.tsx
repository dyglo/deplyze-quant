import React from 'react';
import { DISCOVERY_TABS } from './DiscoveryTabs';
import type { DiscoveryTab } from '../../services/screenerService';

const GROUP_LABELS = { movers: 'Movers', universe: 'Universe', workspace: 'Workspace' };

interface Props {
  active: DiscoveryTab;
  onChange: (tab: DiscoveryTab) => void;
  savedCount?: number;
}

export const FilterRail: React.FC<Props> = ({ active, onChange, savedCount = 0 }) => (
  <div style={{
    width: 176, flexShrink: 0,
    borderRight: '1px solid var(--border)',
    background: 'var(--card)',
    overflowY: 'auto',
    display: 'flex', flexDirection: 'column',
    paddingBottom: 16,
  }}>
    {(['movers', 'universe', 'workspace'] as const).map((group, gi) => {
      const tabs = DISCOVERY_TABS.filter((t) => t.group === group);
      return (
        <div key={group} style={{ paddingTop: gi === 0 ? 16 : 12 }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--border)',
            padding: '0 16px 6px',
          }}>
            {GROUP_LABELS[group]}
          </div>
          {tabs.map((tab) => {
            const isActive = tab.id === active;
            const label = tab.id === 'saved' && savedCount > 0 ? `${tab.label} (${savedCount})` : tab.label;
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                title={tab.description}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '8px 16px',
                  border: 'none',
                  borderLeft: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                  background: isActive ? 'rgba(193,95,60,0.06)' : 'transparent',
                  color: isActive ? 'var(--primary)' : 'var(--muted-foreground)',
                  fontSize: 12, fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'color 0.12s ease, background 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'var(--foreground)';
                    e.currentTarget.style.background = 'rgba(228,226,216,0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'var(--muted-foreground)';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      );
    })}
  </div>
);
