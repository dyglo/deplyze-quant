import React from 'react';
import { useDocumentHead, ORGANIZATION_JSONLD } from '../lib/seo';
import { TickerTape } from '../components/market-home/TickerTape';
import { HeroIntelligence } from '../components/market-home/HeroIntelligence';
import { MarketSnapshot } from '../components/market-home/MarketSnapshot';
import { FeaturedChart } from '../components/market-home/FeaturedChart';
import { ValuationTable } from '../components/market-home/ValuationTable';
import { CalendarSection } from '../components/market-home/CalendarSection';
import { IntelligenceSpotlight } from '../components/market-home/IntelligenceSpotlight';
import { AnalysisOpinion } from '../components/market-home/AnalysisOpinion';
import { MarketDataGrid } from '../components/market-home/MarketDataGrid';
import { RightRail } from '../components/market-home/RightRail';
import { SectionBoundary } from '../components/market-home/SectionBoundary';
import { Disclaimer } from '../components/quant/Disclaimer';

export const MarketHome: React.FC = () => {

  useDocumentHead({
    title: 'Market',
    description: 'A live institutional view of global markets — regimes, cross-asset context, briefings, and AI-driven research.',
    canonicalPath: '/',
    jsonLd: ORGANIZATION_JSONLD,
  });

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

      <div style={{ marginBottom: 16 }}>
        <SectionBoundary label="Ticker"><TickerTape /></SectionBoundary>
      </div>

      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--foreground)' }}>
          Market
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
          A live institutional view of global markets — regimes, cross-asset context, and research.
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SectionBoundary label="Market intelligence"><HeroIntelligence /></SectionBoundary>

        <div
          className="market-home-body"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 18, alignItems: 'start' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
            <SectionBoundary label="Market performance"><FeaturedChart /></SectionBoundary>
            <SectionBoundary label="Market snapshot"><MarketSnapshot /></SectionBoundary>

            <SectionBoundary label="Relative valuation"><ValuationTable /></SectionBoundary>
            <SectionBoundary label="Calendar"><CalendarSection /></SectionBoundary>
            <SectionBoundary label="Intelligence spotlight"><IntelligenceSpotlight /></SectionBoundary>
            <SectionBoundary label="Analysis & opinion"><AnalysisOpinion /></SectionBoundary>
            <SectionBoundary label="Market data"><MarketDataGrid /></SectionBoundary>
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
