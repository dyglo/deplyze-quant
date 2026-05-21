/**
 * Widget — standardized card shell used by every visualization on the
 * Historical Research result surface.
 *
 * Anatomy (top to bottom):
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Title ‹i›   • legend chip • legend chip       More  ⤢  ⋮   │
 *   │  $94,127  ↑9% vs last window     (optional KPI row)         │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  body (chart, list, narrative — passed as children)         │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Borrows the affordance grammar of the reference Bagus Fikri dashboard:
 * View More link, expand icon, and a 3-dots options menu — applied
 * uniformly so the result page reads as one design system, not a
 * collection of ad-hoc panels.
 */

import React, { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { InfoTip } from './InfoTip';
import { OptionsMenu, type MenuItem } from './OptionsMenu';
import { ExpandedView } from './ExpandedView';

export interface LegendChip {
  label: string;
  color: string;
}

export interface WidgetKpi {
  value: string;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  sublabel?: string;
}

interface Props {
  title: string;
  info?: string;
  caption?: string;
  legend?: LegendChip[];
  kpi?: WidgetKpi;
  onViewMore?: () => void;
  viewMoreLabel?: string;
  menuItems?: MenuItem[];
  expandable?: boolean;
  expandedBody?: React.ReactNode; // optional override for expanded view
  children: React.ReactNode;
}

export const Widget: React.FC<Props> = ({
  title, info, caption, legend, kpi,
  onViewMore, viewMoreLabel = 'View More',
  menuItems, expandable = true, expandedBody,
  children,
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <section style={cardStyle}>
      <header style={headerStyle}>
        <div style={titleRow}>
          <span style={titleStyle}>{title}</span>
          {info && <InfoTip text={info} />}
          {legend && legend.length > 0 && (
            <span style={legendRow}>
              {legend.map((l) => (
                <span key={l.label} style={legendChip}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
                  {l.label}
                </span>
              ))}
            </span>
          )}
        </div>
        <div style={actionsRow}>
          {onViewMore && (
            <button type="button" onClick={onViewMore} style={viewMoreLink}>
              {viewMoreLabel}
            </button>
          )}
          {expandable && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="Expand widget"
              style={iconBtn}
            >
              <Maximize2 size={13} />
            </button>
          )}
          {menuItems && menuItems.length > 0 && (
            <OptionsMenu items={menuItems} />
          )}
        </div>
      </header>

      {kpi && (
        <div style={kpiRow}>
          <span style={kpiValue}>{kpi.value}</span>
          {kpi.delta && (
            <span style={{
              ...kpiDelta,
              color: kpi.delta.direction === 'up'
                ? 'var(--success, #4E6040)'
                : kpi.delta.direction === 'down'
                ? 'var(--destructive, #c75450)'
                : 'var(--muted-foreground)',
            }}>
              {kpi.delta.direction === 'up' ? '↑' : kpi.delta.direction === 'down' ? '↓' : '→'} {kpi.delta.value}
            </span>
          )}
          {kpi.sublabel && <span style={kpiSub}>{kpi.sublabel}</span>}
        </div>
      )}

      {caption && (
        <div style={captionStyle}>{caption}</div>
      )}

      <div style={bodyStyle}>{children}</div>

      {expanded && (
        <ExpandedView
          title={title}
          caption={caption}
          onClose={() => setExpanded(false)}
        >
          {expandedBody ?? children}
        </ExpandedView>
      )}
    </section>
  );
};

// ─── styles ───────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--card)',
  padding: '14px 16px 16px',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  marginBottom: 4,
};

const titleRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  minWidth: 0,
};

const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--foreground)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const legendRow: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 10,
  marginLeft: 8,
};

const legendChip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: 11,
  color: 'var(--muted-foreground)',
};

const actionsRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  flex: '0 0 auto',
};

const viewMoreLink: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: '2px 4px',
  color: 'var(--primary)',
  fontSize: 12,
  cursor: 'pointer',
  fontWeight: 500,
};

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24,
  background: 'transparent',
  border: 'none',
  color: 'var(--muted-foreground)',
  borderRadius: 6,
  cursor: 'pointer',
};

const kpiRow: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 8,
  marginTop: 4, marginBottom: 8,
};

const kpiValue: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  color: 'var(--foreground)',
  letterSpacing: -0.3,
};

const kpiDelta: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
};

const kpiSub: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--muted-foreground)',
};

const captionStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--muted-foreground)',
  marginBottom: 8,
};

const bodyStyle: React.CSSProperties = {
  marginTop: 4,
};
