import React from 'react';

export interface HeatmapGridCell {
  id: string;
  label: string;
  sublabel?: string;
  value: number;        // change percent
  size?: 'xl' | 'lg' | 'md' | 'sm';
}

export interface HeatmapGridGroup {
  name: string;
  avgValue: number;
  cells: HeatmapGridCell[];
}

function heatColor(pct: number): { bg: string; text: string } {
  const abs = Math.abs(pct);
  if (pct > 0) {
    if (abs > 4)   return { bg: '#3A4E2D', text: '#C8E0B8' };
    if (abs > 2)   return { bg: '#4E6040', text: '#D8EDCA' };
    if (abs > 1)   return { bg: 'rgba(78,96,64,0.55)', text: '#2D3D24' };
    if (abs > 0.3) return { bg: 'rgba(78,96,64,0.25)', text: '#3A5029' };
    return { bg: 'var(--muted)', text: 'var(--muted-foreground)' };
  }
  if (pct < 0) {
    if (abs > 4)   return { bg: '#7A2E14', text: '#F9D5CA' };
    if (abs > 2)   return { bg: '#C15F3C', text: '#FCEEE9' };
    if (abs > 1)   return { bg: 'rgba(193,95,60,0.55)', text: '#6B2710' };
    if (abs > 0.3) return { bg: 'rgba(193,95,60,0.22)', text: '#8B3A1A' };
    return { bg: 'var(--muted)', text: 'var(--muted-foreground)' };
  }
  return { bg: 'var(--muted)', text: 'var(--muted-foreground)' };
}

const SIZE_HEIGHT: Record<string, number> = { xl: 56, lg: 46, md: 38, sm: 32 };
const SIZE_FLEX: Record<string, string> = { xl: '2.2 0 80px', lg: '1.6 0 64px', md: '1.1 0 52px', sm: '0.75 0 42px' };

interface HeatmapCellProps {
  cell: HeatmapGridCell;
  onSelect?: (id: string) => void;
  selected?: boolean;
}

const HeatCell: React.FC<HeatmapCellProps> = ({ cell, onSelect, selected }) => {
  const [hovered, setHovered] = React.useState(false);
  const c = heatColor(cell.value);
  const h = SIZE_HEIGHT[cell.size ?? 'md'];
  const pos = cell.value > 0;
  const neg = cell.value < 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(cell.id)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect?.(cell.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${cell.label}: ${cell.value >= 0 ? '+' : ''}${cell.value.toFixed(2)}%`}
      style={{
        flex: SIZE_FLEX[cell.size ?? 'md'],
        height: h,
        background: c.bg,
        border: selected
          ? '2px solid var(--primary)'
          : hovered ? '1px solid rgba(0,0,0,0.2)' : '1px solid rgba(0,0,0,0.06)',
        borderRadius: 5,
        cursor: onSelect ? 'pointer' : 'default',
        padding: '4px 7px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        userSelect: 'none',
        transition: 'border 80ms ease',
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, color: c.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {cell.label}
      </span>
      {cell.sublabel && h >= 46 && (
        <span style={{ fontSize: 8.5, color: c.text, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {cell.sublabel}
        </span>
      )}
      <span style={{ fontSize: 10, fontWeight: 700, color: c.text, fontVariantNumeric: 'tabular-nums' }}>
        {pos ? '+' : neg ? '' : ''}{cell.value.toFixed(2)}%
      </span>
    </div>
  );
};

interface HeatmapGridProps {
  groups: HeatmapGridGroup[];
  onSelectCell?: (id: string) => void;
  selectedCell?: string | null;
}

export const HeatmapGrid: React.FC<HeatmapGridProps> = ({ groups, onSelectCell, selectedCell }) => {
  if (!groups.length) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
        No data
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groups.map((group) => {
        const gc = heatColor(group.avgValue);
        return (
          <div key={group.name}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {group.name}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                padding: '1px 5px', borderRadius: 999,
                background: gc.bg, color: gc.text,
                border: '1px solid rgba(0,0,0,0.06)',
              }}>
                {group.avgValue >= 0 ? '+' : ''}{group.avgValue.toFixed(2)}%
              </span>
            </div>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {group.cells.map((cell) => (
                <HeatCell
                  key={cell.id}
                  cell={cell}
                  onSelect={onSelectCell}
                  selected={selectedCell === cell.id}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
