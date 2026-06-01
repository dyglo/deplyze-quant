import React from 'react';
import { useAuth } from '../components/AuthProvider';
import { useAuthGate } from '../components/auth/AuthGate';
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
import { PortfolioInsights } from '../components/market-home/PortfolioInsights';
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
  const { profile, user, isGuest } = useAuth();
  const { requireAuth } = useAuthGate();
  const name = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'there';

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
          {isGuest ? 'Market' : `${greeting()}, ${name}`}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
          {isGuest
            ? 'A live institutional view of global markets — sign in to personalize your feed and save research.'
            : 'Your market overview, made fast to read.'}
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
            {isGuest ? (
              <SectionBoundary label="Your portfolio">
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                  padding: '18px 20px', borderRadius: 12,
                  background: 'color-mix(in srgb, var(--primary) 6%, var(--card))',
                  border: '1px dashed var(--border)',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>Build your portfolio intelligence</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--muted-foreground)' }}>
                      Track holdings, exposure, regime fit, and per-position agent analysis. Create a free workspace to get started — your session carries over.
                    </p>
                  </div>
                  <button
                    onClick={() => requireAuth({ title: 'Build your portfolio intelligence', description: 'Track holdings, exposure, and regime fit with autonomous agent analysis.' })}
                    className="ds-transition-fast"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                      height: 34, padding: '0 14px', borderRadius: 8, border: 'none',
                      background: 'var(--primary)', color: 'var(--primary-foreground)',
                      fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Create Workspace
                  </button>
                </div>
              </SectionBoundary>
            ) : (
              <SectionBoundary label="Your portfolio"><PortfolioInsights /></SectionBoundary>
            )}
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
