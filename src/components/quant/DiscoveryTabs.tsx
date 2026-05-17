import React, { useRef, useEffect } from 'react';
import type { DiscoveryTab } from '../../services/screenerService';

export interface TabDef {
  id: DiscoveryTab;
  label: string;
  group: 'movers' | 'universe' | 'workspace';
  description?: string;
}

// Eight focused tabs — three movers, four universes, one saved.
export const DISCOVERY_TABS: TabDef[] = [
  { id: 'gainers',   label: 'Top Gainers',  group: 'movers',    description: 'Highest session gains' },
  { id: 'losers',    label: 'Top Losers',   group: 'movers',    description: 'Largest session declines' },
  { id: 'active',    label: 'Most Active',  group: 'movers',    description: 'Highest volume activity' },
  { id: 'mega-caps', label: 'Mega Caps',    group: 'universe',  description: 'S&P 500 top 16 by market cap' },
  { id: 'etfs',      label: 'ETFs',         group: 'universe',  description: 'Core indices + sector ETFs' },
  { id: 'fx',        label: 'FX',           group: 'universe',  description: 'Major currency pairs' },
  { id: 'crypto',    label: 'Crypto',       group: 'universe',  description: 'Top digital assets' },
  { id: 'saved',     label: 'Saved',        group: 'workspace', description: 'Your saved instruments' },
];

const GROUP_LABELS: Record<TabDef['group'], string> = {
  movers:    'Movers',
  universe:  'Universe',
  workspace: 'Workspace',
};

interface Props {
  active: DiscoveryTab;
  onChange: (tab: DiscoveryTab) => void;
  savedCount?: number;
}

export const DiscoveryTabs: React.FC<Props> = ({ active, onChange, savedCount = 0 }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const el = activeRef.current;
      const container = scrollRef.current;
      const elL = el.offsetLeft, elR = elL + el.offsetWidth;
      const viewL = container.scrollLeft, viewR = viewL + container.offsetWidth;
      if (elL < viewL) container.scrollLeft = elL - 16;
      else if (elR > viewR) container.scrollLeft = elR - container.offsetWidth + 16;
    }
  }, [active]);

  const groups = (['movers', 'universe', 'workspace'] as const);

  return (
    <div style={{ background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
      <div
        ref={scrollRef}
        style={{
          display: 'flex', alignItems: 'stretch',
          overflowX: 'auto', scrollbarWidth: 'none',
          padding: '0 20px', gap: 0,
        }}
      >
        {groups.map((group, gi) => {
          const tabs = DISCOVERY_TABS.filter((t) => t.group === group);
          return (
            <React.Fragment key={group}>
              {gi > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', margin: '0 10px' }}>
                  <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {/* Group label */}
                <div style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: 'var(--border)',
                  padding: '4px 10px 0', lineHeight: 1,
                }}>
                  {GROUP_LABELS[group]}
                </div>
                {/* Tabs */}
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 1 }}>
                  {tabs.map((tab) => {
                    const isActive = tab.id === active;
                    const label = tab.id === 'saved' && savedCount > 0
                      ? `${tab.label} (${savedCount})`
                      : tab.label;
                    return (
                      <button
                        key={tab.id}
                        ref={isActive ? activeRef : undefined}
                        onClick={() => onChange(tab.id)}
                        title={tab.description}
                        style={{
                          flexShrink: 0,
                          padding: '0 14px',
                          height: 36,
                          border: 'none',
                          borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                          background: isActive ? 'rgba(193,95,60,0.04)' : 'transparent',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: isActive ? 700 : 500,
                          color: isActive ? 'var(--primary)' : 'var(--muted-foreground)',
                          whiteSpace: 'nowrap',
                          borderRadius: '4px 4px 0 0',
                          transition: 'color 0.12s ease, background 0.12s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            (e.currentTarget as HTMLElement).style.color = 'var(--foreground)';
                            (e.currentTarget as HTMLElement).style.background = 'rgba(228,226,216,0.5)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            (e.currentTarget as HTMLElement).style.color = 'var(--muted-foreground)';
                            (e.currentTarget as HTMLElement).style.background = 'transparent';
                          }
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
