import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Gauge, Activity, Layers, Sparkles, CalendarClock, ArrowDownNarrowWide } from 'lucide-react';
import { SectionCard } from './SectionCard';

interface Screen {
  id: string;
  label: string;
  blurb: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  to: string;
}

const SCREENS: Screen[] = [
  { id: 'momentum',   label: 'Momentum Leaders',     blurb: 'Strongest trending names',        icon: TrendingUp,           to: '/instruments/movers?tab=gainers' },
  { id: 'value',      label: 'Undervalued',          blurb: 'Cheap on relative multiples',     icon: ArrowDownNarrowWide,  to: '/instruments/movers?tab=mega-caps' },
  { id: 'volatility', label: 'Volatility Expansion', blurb: 'Range breaking out',              icon: Activity,             to: '/instruments/movers?tab=vol-expansion' },
  { id: 'sectors',    label: 'Sector Rotation',      blurb: 'Where leadership is shifting',    icon: Layers,               to: '/instruments/movers?tab=sectors' },
  { id: 'narratives', label: 'AI Narrative Leaders', blurb: 'Emerging thematic clusters',      icon: Sparkles,             to: '/instruments/narratives' },
  { id: 'vol-desk',   label: 'Volatility Desk',      blurb: 'Cross-asset risk pulse',          icon: Gauge,                to: '/instruments/volatility' },
  { id: 'unusual',    label: 'Unusual Volume',       blurb: 'Abnormal participation',          icon: Activity,             to: '/instruments/movers?tab=unusual-volume' },
  { id: 'earnings',   label: 'Earnings Risk',        blurb: 'Names reporting soon',            icon: CalendarClock,        to: '/instruments/movers?tab=active' },
];

export const PopularScreens: React.FC = () => {
  const navigate = useNavigate();
  return (
    <SectionCard title="Popular Screens" subtitle="Curated discovery views">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {SCREENS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => navigate(s.to)}
              className="ds-transition-fast"
              style={{
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                padding: '11px 12px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'transparent', cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--primary) 40%, var(--border))'; (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--primary) 5%, transparent)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: 'color-mix(in srgb, var(--primary) 10%, transparent)', flexShrink: 0 }}>
                <Icon size={15} style={{ color: 'var(--primary)' }} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>{s.label}</span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
};
