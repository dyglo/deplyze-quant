import React from 'react';
import { useAuth } from '../components/AuthProvider';
import { HeroIntelligence } from '../components/market-home/HeroIntelligence';
import { MarketSnapshot } from '../components/market-home/MarketSnapshot';
import { ValuationTable } from '../components/market-home/ValuationTable';
import { CalendarSection } from '../components/market-home/CalendarSection';
import { IntelligenceSpotlight } from '../components/market-home/IntelligenceSpotlight';
import { AnalysisOpinion } from '../components/market-home/AnalysisOpinion';
import { MarketDataGrid } from '../components/market-home/MarketDataGrid';
import { PortfolioInsights } from '../components/market-home/PortfolioInsights';
import { PopularScreens } from '../components/market-home/PopularScreens';
import { ToolsShortcuts } from '../components/market-home/ToolsShortcuts';
import { RightRail } from '../components/market-home/RightRail';
import { SectionBoundary } from '../components/market-home/SectionBoundary';
import { Disclaimer } from '../components/quant/Disclaimer';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export const MarketHome: React.FC = () => {
  const { profile, user } = useAuth();
  const name = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'there';

  return (
    <div style={{ padding: '20px 20px 40px', maxWidth: 1480, margin: '0 auto', width: '100%' }}>
      <style>{`
        @media (max-width: 1080px) {
          .market-home-hero { grid-template-columns: 1fr 1fr !important; }
          .market-home-body { grid-template-columns: 1fr !important; }
          .market-home-rail { position: static !important; }
        }
        @media (max-width: 720px) {
          .market-home-hero { grid-template-columns: 1fr !important; }
          .market-home-cal { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--foreground)' }}>
          {greeting()}, {name}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
          Your market overview — institutional intelligence, made fast to read.
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SectionBoundary label="Market intelligence"><HeroIntelligence /></SectionBoundary>

        <div
          className="market-home-body"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 18, alignItems: 'start' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
            <SectionBoundary label="Market snapshot"><MarketSnapshot /></SectionBoundary>
            <SectionBoundary label="Your portfolio"><PortfolioInsights /></SectionBoundary>
            <SectionBoundary label="Relative valuation"><ValuationTable /></SectionBoundary>
            <SectionBoundary label="Calendar"><CalendarSection /></SectionBoundary>
            <SectionBoundary label="Intelligence spotlight"><IntelligenceSpotlight /></SectionBoundary>
            <SectionBoundary label="Analysis & opinion"><AnalysisOpinion /></SectionBoundary>
            <SectionBoundary label="Market data"><MarketDataGrid /></SectionBoundary>
            <SectionBoundary label="Popular screens"><PopularScreens /></SectionBoundary>
            <SectionBoundary label="Tools"><ToolsShortcuts /></SectionBoundary>
          </div>
          <div className="market-home-rail" style={{ position: 'sticky', top: 12 }}>
            <SectionBoundary label="Right rail"><RightRail /></SectionBoundary>
          </div>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
};
