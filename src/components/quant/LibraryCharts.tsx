import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import type { LibraryStats } from '../../hooks/useLibraryStats';
import { typeColor } from '../../hooks/useLibraryStats';

const AXIS_STYLE = { fontSize: 10, fill: 'var(--muted-foreground)' };
const GRID_PROPS = { stroke: 'var(--border)', strokeDasharray: '2 4' };
const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)',
  borderRadius: 6, fontSize: 11, padding: '6px 10px',
};

// ─── Panel wrapper ────────────────────────────────────────────────────────────

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="ds-surface" style={{ borderRadius: 8, padding: '14px 16px' }}>
    <p className="ds-label" style={{ margin: '0 0 10px', color: 'var(--muted-foreground)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {title}
    </p>
    {children}
  </div>
);

// ─── Panel 1: Research Activity (stacked bar, 30d) ────────────────────────────

const ActivityPanel: React.FC<{ stats: LibraryStats }> = ({ stats }) => (
  <Panel title="Research Activity · 30d">
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={stats.activityBars} margin={{ top: 2, right: 4, left: -24, bottom: 0 }} barSize={6}>
        <CartesianGrid {...GRID_PROPS} vertical={false} />
        <XAxis dataKey="date" tick={AXIS_STYLE} tickLine={false} axisLine={false}
          interval={Math.floor(stats.activityBars.length / 5)} />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
        {stats.activeTypes.map(type => (
          <Bar key={type} dataKey={type} stackId="a" fill={typeColor(type)} radius={[2, 2, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  </Panel>
);

// ─── Panel 2: Symbol Coverage (horizontal bar) ───────────────────────────────

const CoveragePanel: React.FC<{ stats: LibraryStats }> = ({ stats }) => (
  <Panel title="Symbol Coverage">
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={stats.symbolCoverage} layout="vertical"
        margin={{ top: 2, right: 20, left: 4, bottom: 0 }} barSize={8}>
        <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="symbol" tick={AXIS_STYLE} tickLine={false} axisLine={false} width={44} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
        <Bar dataKey="count" fill="var(--chart-3)" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </Panel>
);

// ─── Panel 3: Type Breakdown (donut) ─────────────────────────────────────────

const TypePanel: React.FC<{ stats: LibraryStats }> = ({ stats }) => (
  <Panel title="Type Breakdown">
    <div style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie
            data={stats.typeBreakdown}
            innerRadius={42} outerRadius={62}
            dataKey="value" nameKey="name"
            paddingAngle={2}
          >
            {stats.typeBreakdown.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number, name: string) => {
              const total = stats.typeBreakdown.reduce((s, d) => s + d.value, 0);
              return [`${value} (${Math.round(value / total * 100)}%)`, name.replace(/_/g, ' ')];
            }}
          />
          <Legend
            formatter={(v) => v.replace(/_/g, ' ')}
            wrapperStyle={{ fontSize: 10, color: 'var(--muted-foreground)' }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Centre label */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -56%)',
        textAlign: 'center', pointerEvents: 'none',
      }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1 }}>
          {stats.total}
        </p>
        <p style={{ margin: 0, fontSize: 9, color: 'var(--muted-foreground)', letterSpacing: '0.04em' }}>saved</p>
      </div>
    </div>
  </Panel>
);

// ─── Panel 4: Quality Trend (line) ───────────────────────────────────────────

const QualityPanel: React.FC<{ stats: LibraryStats }> = ({ stats }) => {
  const hasCompleteness = stats.qualityTrend.some(d => d.completeness != null);
  return (
    <Panel title="Quality Trend · last 20">
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={stats.qualityTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="date" tick={AXIS_STYLE} tickLine={false} axisLine={false}
            interval={Math.floor(stats.qualityTrend.length / 4)} />
          <YAxis domain={[0, 1]} tick={AXIS_STYLE} tickLine={false} axisLine={false}
            tickFormatter={v => `${Math.round(v * 100)}%`} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number) => `${Math.round(v * 100)}%`}
          />
          <Line type="monotone" dataKey="confidence" stroke="var(--chart-1)"
            strokeWidth={1.5} dot={{ r: 2, fill: 'var(--chart-1)' }} name="Confidence"
            connectNulls />
          {hasCompleteness && (
            <Line type="monotone" dataKey="completeness" stroke="var(--chart-3)"
              strokeWidth={1.5} dot={{ r: 2, fill: 'var(--chart-3)' }} name="Completeness"
              connectNulls />
          )}
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
};

// ─── Composed grid ────────────────────────────────────────────────────────────

export interface ChartSelection {
  date?: string;       // from activity bar click
  symbol?: string;     // from coverage bar click
  type?: string;       // from donut slice click
}

interface Props {
  stats: LibraryStats;
  selection?: ChartSelection;
  onSelect?: (sel: ChartSelection | null) => void;
}

export const LibraryCharts: React.FC<Props> = ({ stats, selection, onSelect }) => {
  const handleActivity = (data: any) => {
    if (!onSelect) return;
    const date = data?.activeLabel;
    if (!date) return;
    onSelect(selection?.date === date ? null : { date });
  };
  const handleCoverage = (data: any) => {
    if (!onSelect) return;
    const symbol = data?.activeLabel;
    if (!symbol) return;
    onSelect(selection?.symbol === symbol ? null : { symbol });
  };
  const handleType = (data: any) => {
    if (!onSelect) return;
    const type = data?.name;
    if (!type) return;
    onSelect(selection?.type === type ? null : { type });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
      <div onClick={handleActivity} style={{ cursor: onSelect ? 'pointer' : undefined, outline: selection?.date ? '2px solid var(--primary)' : undefined, borderRadius: 8 }}>
        <ActivityPanel stats={stats} />
      </div>
      <div onClick={handleCoverage} style={{ cursor: onSelect ? 'pointer' : undefined, outline: selection?.symbol ? '2px solid var(--primary)' : undefined, borderRadius: 8 }}>
        <CoveragePanel stats={stats} />
      </div>
      <div onClick={handleType} style={{ cursor: onSelect ? 'pointer' : undefined, outline: selection?.type ? '2px solid var(--primary)' : undefined, borderRadius: 8 }}>
        <TypePanel stats={stats} />
      </div>
      <QualityPanel stats={stats} />
    </div>
  );
};
