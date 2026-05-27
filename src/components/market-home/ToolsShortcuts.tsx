import React from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart, TrendingUp, Database, FileText, Network, Compass,
  History, Sparkles, Globe, Flame,
} from 'lucide-react';
import { SectionCard } from './SectionCard';

interface Tool {
  label: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  to: string;
}

const TOOLS: Tool[] = [
  { label: 'Stock Screener',         icon: LineChart, to: '/instruments/movers' },
  { label: 'Instrument Intelligence', icon: Compass,  to: '/instruments' },
  { label: 'Macro Regime Desk',      icon: TrendingUp, to: '/macro' },
  { label: 'Portfolio Intelligence', icon: Globe,     to: '/portfolio/overview' },
  { label: 'Historical Intelligence', icon: History,  to: '/historical-intelligence' },
  { label: 'Research Copilot',       icon: Sparkles,  to: '/copilot' },
  { label: 'Data Warehouse',         icon: Database,  to: '/warehouse' },
  { label: 'Briefings',              icon: FileText,  to: '/briefings' },
  { label: 'Relations Map',          icon: Network,   to: '/relations-map' },
  { label: 'Commodities',            icon: Flame,     to: '/market/commodities' },
];

export const ToolsShortcuts: React.FC = () => (
  <SectionCard title="Tools" subtitle="Jump into a workspace">
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
      {TOOLS.map((t) => {
        const Icon = t.icon;
        return (
          <Link
            key={t.label}
            to={t.to}
            className="ds-transition-fast"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, textAlign: 'center',
              padding: '14px 8px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', textDecoration: 'none',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--primary) 40%, var(--border))'; (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--primary) 5%, transparent)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Icon size={18} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.25 }}>{t.label}</span>
          </Link>
        );
      })}
    </div>
  </SectionCard>
);
