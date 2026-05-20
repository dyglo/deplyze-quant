import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { WorkspaceProvider, useWorkspace } from './components/WorkspaceContext';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Settings } from './components/Settings';
import { Toaster } from './components/ui/sonner';
import { DrawerProvider } from './components/quant/DataDrawer';
import { Activity } from 'lucide-react';

import { IntelligenceTerminal } from './pages/IntelligenceTerminal';
import { MorningTerminal } from './pages/MorningTerminal';
import { Investigations } from './pages/Investigations';
import { InstrumentIntelligenceHub } from './pages/instruments/InstrumentIntelligenceHub';
import { MoversWorkspace } from './pages/instruments/MoversWorkspace';
import { HeatmapWorkspace } from './pages/instruments/HeatmapWorkspace';
import { NarrativeIntelligence } from './pages/instruments/NarrativeIntelligence';
import { VolatilityDesk } from './pages/instruments/VolatilityDesk';
import { InstrumentDetail } from './pages/InstrumentDetail';
import { MacroRegimeDesk } from './pages/MacroRegimeDesk';
import { RelationsMap } from './pages/RelationsMap';
import { PositioningSentiment } from './pages/PositioningSentiment';
import { ModelObservatory } from './pages/ModelObservatory';
import { QuantLab } from './pages/QuantLab';
import { ResearchCopilot } from './pages/ResearchCopilot';
import { HistoricalIntelligenceTerminal } from './pages/HistoricalIntelligenceTerminal';
import { WarehouseExplorer } from './pages/WarehouseExplorer';
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
  const { user, loading: authLoading } = useAuth();
  const { loading: workspaceLoading } = useWorkspace();
  if (authLoading) return <LoadingScreen />;
  if (!user) return <Login />;
  if (workspaceLoading) return <LoadingScreen />;
  return <Layout>{children}</Layout>;
};

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <BrowserRouter>
          <DrawerProvider>
          <Routes>
            <Route path="/login"                element={<Login />} />
            <Route path="/"                     element={<ProtectedRoute><IntelligenceTerminal /></ProtectedRoute>} />
            <Route path="/morning"              element={<ProtectedRoute><MorningTerminal /></ProtectedRoute>} />
            <Route path="/investigations"       element={<ProtectedRoute><Investigations /></ProtectedRoute>} />
            {/* Instrument Intelligence — Level 2 workspaces (must precede :symbol) */}
            <Route path="/instruments/movers"      element={<ProtectedRoute><MoversWorkspace /></ProtectedRoute>} />
            <Route path="/instruments/heatmap"     element={<ProtectedRoute><HeatmapWorkspace /></ProtectedRoute>} />
            <Route path="/instruments/narratives"  element={<ProtectedRoute><NarrativeIntelligence /></ProtectedRoute>} />
            <Route path="/instruments/volatility"  element={<ProtectedRoute><VolatilityDesk /></ProtectedRoute>} />
            {/* Level 1 Hub */}
            <Route path="/instruments"             element={<ProtectedRoute><InstrumentIntelligenceHub /></ProtectedRoute>} />
            {/* Single-asset research */}
            <Route path="/instruments/:symbol"     element={<ProtectedRoute><InstrumentDetail /></ProtectedRoute>} />
            <Route path="/macro"                element={<ProtectedRoute><MacroRegimeDesk /></ProtectedRoute>} />
            <Route path="/relations-map"        element={<ProtectedRoute><RelationsMap /></ProtectedRoute>} />
            <Route path="/cross-asset"          element={<Navigate to="/relations-map" replace />} />
            <Route path="/positioning"          element={<ProtectedRoute><PositioningSentiment /></ProtectedRoute>} />
            <Route path="/models"               element={<ProtectedRoute><ModelObservatory /></ProtectedRoute>} />
            <Route path="/lab"                  element={<ProtectedRoute><QuantLab /></ProtectedRoute>} />
            <Route path="/copilot"              element={<ProtectedRoute><ResearchCopilot /></ProtectedRoute>} />
            <Route path="/historical-intelligence" element={<ProtectedRoute><HistoricalIntelligenceTerminal /></ProtectedRoute>} />
            <Route path="/warehouse"            element={<ProtectedRoute><WarehouseExplorer /></ProtectedRoute>} />
            <Route path="/briefings"            element={<ProtectedRoute><Briefings /></ProtectedRoute>} />
            <Route path="/briefings/:id"        element={<ProtectedRoute><BriefingDetail /></ProtectedRoute>} />
            <Route path="/library"              element={<ProtectedRoute><ResearchLibrary /></ProtectedRoute>} />
            <Route path="/artifacts/:id"        element={<ProtectedRoute><ArtifactPage /></ProtectedRoute>} />
            <Route path="/settings"             element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            {/* Market Dashboards — Phase 1 + 2 */}
            <Route path="/market/world-equity"  element={<ProtectedRoute><WorldEquityIntelligence /></ProtectedRoute>} />
            <Route path="/market/us-sectors"    element={<ProtectedRoute><UsSectorIntelligence /></ProtectedRoute>} />
            <Route path="/market/global-yields" element={<ProtectedRoute><GlobalYields /></ProtectedRoute>} />
            <Route path="/market/countries"     element={<ProtectedRoute><CountriesRegionalMarkets /></ProtectedRoute>} />
            <Route path="/market/commodities"   element={<ProtectedRoute><CommoditiesIntelligence /></ProtectedRoute>} />
            <Route path="/market/fx-liquidity"  element={<ProtectedRoute><FxLiquidityIntelligence /></ProtectedRoute>} />
            {/* Portfolio Intelligence Workspace */}
            <Route path="/portfolio/overview"     element={<ProtectedRoute><PortfolioOverview /></ProtectedRoute>} />
            <Route path="/portfolio/holdings"     element={<ProtectedRoute><HoldingsWatchlist /></ProtectedRoute>} />
            <Route path="/portfolio/exposure"     element={<ProtectedRoute><ExposureAnalysis /></ProtectedRoute>} />
            <Route path="/portfolio/attribution"  element={<ProtectedRoute><PerformanceAttribution /></ProtectedRoute>} />
            <Route path="/portfolio/risk"         element={<ProtectedRoute><RiskRegimeFit /></ProtectedRoute>} />
            <Route path="/portfolio/scenario"     element={<ProtectedRoute><ScenarioStress /></ProtectedRoute>} />
            <Route path="/portfolio"              element={<Navigate to="/portfolio/overview" replace />} />
            <Route path="*"                       element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
          </DrawerProvider>
        </BrowserRouter>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
