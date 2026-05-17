import React, { useRef, useEffect } from 'react';

export interface DashboardTab {
  id: string;
  label: string;
  count?: number;
}

interface DashboardPageTabsProps {
  tabs: DashboardTab[];
  active: string;
  onChange: (id: string) => void;
}

export const DashboardPageTabs: React.FC<DashboardPageTabsProps> = ({ tabs, active, onChange }) => {
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

  return (
    <div
      ref={scrollRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        borderBottom: '1px solid var(--border)',
        background: 'var(--background)',
        padding: '0 0 0 0',
        marginBottom: 16,
        flexShrink: 0,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={isActive ? activeRef : undefined}
            onClick={() => onChange(tab.id)}
            style={{
              flexShrink: 0,
              padding: '8px 14px',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--primary)' : 'var(--muted-foreground)',
              transition: 'color 120ms ease, border-color 120ms ease',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--foreground)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--muted-foreground)';
            }}
          >
            {tab.label}
            {tab.count != null && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999,
                background: isActive ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'var(--muted)',
                color: isActive ? 'var(--primary)' : 'var(--muted-foreground)',
              }}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
