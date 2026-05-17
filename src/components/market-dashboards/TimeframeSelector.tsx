import React from 'react';

export type Timeframe = '1D' | '5D' | '1M' | '3M' | 'YTD' | '1Y' | '3Y';

const ALL_FRAMES: Timeframe[] = ['1D', '5D', '1M', '3M', 'YTD', '1Y', '3Y'];

interface TimeframeSelectorProps {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
  options?: Timeframe[];
}

export const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({
  value, onChange, options = ALL_FRAMES,
}) => (
  <div style={{
    display: 'inline-flex',
    border: '1px solid var(--border)',
    borderRadius: 7,
    overflow: 'hidden',
    background: 'var(--muted)',
  }}>
    {options.map((tf) => {
      const active = tf === value;
      return (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          style={{
            padding: '4px 9px',
            border: 'none',
            background: active ? 'var(--card)' : 'transparent',
            color: active ? 'var(--primary)' : 'var(--muted-foreground)',
            fontSize: 10,
            fontWeight: active ? 700 : 500,
            cursor: 'pointer',
            letterSpacing: '0.02em',
            borderRight: '1px solid var(--border)',
            transition: 'background 100ms ease, color 100ms ease',
          }}
          onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--foreground)'; }}
          onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--muted-foreground)'; }}
        >
          {tf}
        </button>
      );
    })}
  </div>
);
