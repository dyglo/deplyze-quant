import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { WorkspaceProvider, useWorkspace } from './components/WorkspaceContext';
import { AuthGateProvider } from './components/auth/AuthGate';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Settings } from './components/Settings';
import { Toaster } from './components/ui/sonner';
import { DrawerProvider } from './components/quant/DataDrawer';
import { Activity } from 'lucide-react';
import { MarketHome } from './pages/MarketHome';
import { IntelligenceTerminal } from './pages/IntelligenceTerminal';
import { Investigations } from './pages/Investigations';
import { InstrumentDetail } from './pages/InstrumentDetail';
import { MacroRegimeDesk } from './pages/MacroRegimeDesk';
import { RelationsMap } from './pages/RelationsMap';
import { HistoricalResearch } from './pages/HistoricalResearch';
import { Backtesting } from './pages/Backtesting';
import { QuantLab } from './pages/QuantLab';
import { ResearchCopilot } from './pages/ResearchCopilot';
import { HistoricalIntelligenceTerminal } from './pages/HistoricalIntelligenceTerminal';
import { Briefings } from './pages/Briefings';
import { BriefingDetail } from './pages/BriefingDetail';
import { ResearchLibrary } from './pages/ResearchLibrary';
import { ArtifactPage } from './pages/ArtifactPage';
import { WorldEquityIntelligence } from './pages/market/WorldEquityIntelligence';
import { UsSectorIntelligence } from './pages/market/UsSectorIntelligence';
import { GlobalYields } from './pages/market/GlobalYields';
import { CountriesRegionalMarkets } from './pages/market/CountriesRegionalMarkets';
import { CommoditiesIntelligence } from './pages/market/CommoditiesIntelligence';
import { FxLiquidityIntelligence } from './pages/market/FxLiquidityIntelligence';
import { PortfolioOverview } from './pages/portfolio/PortfolioOverview';
import { HoldingsWatchlist } from './pages/portfolio/HoldingsWatchlist';
import { ExposureAnalysis } from './pages/portfolio/ExposureAnalysis';
import { PerformanceAttribution } from './pages/portfolio/PerformanceAttribution';
import { RiskRegimeFit } from './pages/portfolio/RiskRegimeFit';
import { ScenarioStress } from './pages/portfolio/ScenarioStress';
import { PortfolioAwareness } from './pages/portfolio/PortfolioAwareness';

const LoadingScreen: React.FC = () => (
  <div className="ds-loading-screen" style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '0.875rem', height: '100vh', background: 'var(--background)',
  }}>
    <div style={{
      width: '2.5rem', height: '2.5rem',
      background: 'var(--primary)', borderRadius: '0.625rem',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    }}>
      <Activity size={18} style={{ color: 'var(--primary-foreground)' }} />
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
      <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>Deplyze Quant</p>
      <p className="ds-caption" style={{ fontSize: '0.625rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Loading research workspace…
      </p>
    </div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isGuest, loading: authLoading } = useAuth();
  const { loading: workspaceLoading } = useWorkspace();
  if (authLoading) return <LoadingScreen />;
  // Anonymous guests carry a token but are not full users — gated routes still
  // present the sign-in surface. (Public routes, added in a later PR, render for
  // guests without this gate.)
  if (!user || isGuest) return <Login />;
  if (workspaceLoading) return <LoadingScreen />;
  return <Layout>{children}</Layout>;
};

/**
 * PublicRoute — open to guests AND full accounts. Renders the same Layout as a
 * gated route (the Layout itself adapts to guest sessions: institutional CTA,
 * no workspace selectors). Full accounts still wait for their workspace to load
 * so the workspace chrome is correct; guests have an inert workspace context
 * (loading resolves immediately), so they fall straight through.
 */
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading: authLoading } = useAuth();
  const { loading: workspaceLoading } = useWorkspace();
  if (authLoading || workspaceLoading) return <LoadingScreen />;
  return <Layout>{children}</Layout>;
};

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <BrowserRouter>
          <AuthGateProvider>
          <DrawerProvider>
          <Routes>
            <Route path="/login"                element={<Login />} />
            {/* ── Public surfaces (guests + full accounts) ── */}
            <Route path="/"                     element={<PublicRoute><MarketHome /></PublicRoute>} />
            <Route path="/terminal"             element={<PublicRoute><IntelligenceTerminal /></PublicRoute>} />
            <Route path="/investigations"       element={<ProtectedRoute><Investigations /></ProtectedRoute>} />
            {/* Single-asset research (public discovery) */}
            <Route path="/instruments/:symbol"     element={<PublicRoute><InstrumentDetail /></PublicRoute>} />
            <Route path="/macro"                element={<PublicRoute><MacroRegimeDesk /></PublicRoute>} />
            <Route path="/relations-map"        element={<PublicRoute><RelationsMap /></PublicRoute>} />
            <Route path="/cross-asset"          element={<Navigate to="/relations-map" replace />} />
            <Route path="/research"             element={<ProtectedRoute><HistoricalResearch /></ProtectedRoute>} />
            <Route path="/research/i/:id"       element={<ProtectedRoute><HistoricalResearch /></ProtectedRoute>} />
            <Route path="/positioning"          element={<Navigate to="/research" replace />} />
            <Route path="/backtesting"          element={<ProtectedRoute><Backtesting /></ProtectedRoute>} />
            <Route path="/models"               element={<Navigate to="/backtesting" replace />} />
            <Route path="/lab"                  element={<ProtectedRoute><QuantLab /></ProtectedRoute>} />
            <Route path="/copilot"              element={<ProtectedRoute><ResearchCopilot /></ProtectedRoute>} />
            <Route path="/historical-intelligence" element={<ProtectedRoute><HistoricalIntelligenceTerminal /></ProtectedRoute>} />
            <Route path="/briefings"            element={<PublicRoute><Briefings /></PublicRoute>} />
            <Route path="/briefings/:id"        element={<PublicRoute><BriefingDetail /></PublicRoute>} />
            <Route path="/library"              element={<ProtectedRoute><ResearchLibrary /></ProtectedRoute>} />
            <Route path="/artifacts/:id"        element={<ProtectedRoute><ArtifactPage /></ProtectedRoute>} />
            <Route path="/settings"             element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            {/* Market Dashboards — Phase 1 + 2 (public discovery) */}
            <Route path="/market/world-equity"  element={<PublicRoute><WorldEquityIntelligence /></PublicRoute>} />
            <Route path="/market/us-sectors"    element={<PublicRoute><UsSectorIntelligence /></PublicRoute>} />
            <Route path="/market/global-yields" element={<PublicRoute><GlobalYields /></PublicRoute>} />
            <Route path="/market/countries"     element={<PublicRoute><CountriesRegionalMarkets /></PublicRoute>} />
            <Route path="/market/commodities"   element={<PublicRoute><CommoditiesIntelligence /></PublicRoute>} />
            <Route path="/market/fx-liquidity"  element={<PublicRoute><FxLiquidityIntelligence /></PublicRoute>} />
            {/* Portfolio Intelligence Workspace */}
            <Route path="/portfolio/overview"     element={<ProtectedRoute><PortfolioOverview /></ProtectedRoute>} />
            <Route path="/portfolio/holdings"     element={<ProtectedRoute><HoldingsWatchlist /></ProtectedRoute>} />
            <Route path="/portfolio/exposure"     element={<ProtectedRoute><ExposureAnalysis /></ProtectedRoute>} />
            <Route path="/portfolio/attribution"  element={<ProtectedRoute><PerformanceAttribution /></ProtectedRoute>} />
            <Route path="/portfolio/risk"         element={<ProtectedRoute><RiskRegimeFit /></ProtectedRoute>} />
            <Route path="/portfolio/scenario"     element={<ProtectedRoute><ScenarioStress /></ProtectedRoute>} />
            <Route path="/portfolio/:portfolioId/awareness" element={<ProtectedRoute><PortfolioAwareness /></ProtectedRoute>} />
            <Route path="/portfolio"              element={<Navigate to="/portfolio/overview" replace />} />
            <Route path="*"                       element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
          </DrawerProvider>
          </AuthGateProvider>
        </BrowserRouter>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
