import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Settings } from './components/Settings';
import { Toaster } from './components/ui/sonner';
import { DrawerProvider } from './components/quant/DataDrawer';
import { MarketHome } from './pages/MarketHome';
import { Investigations } from './pages/Investigations';
import { InstrumentDetail } from './pages/InstrumentDetail';
import { MacroRegimeDesk } from './pages/MacroRegimeDesk';
import { HistoricalResearch } from './pages/HistoricalResearch';
import { ResearchCopilot } from './pages/ResearchCopilot';
import { HistoricalIntelligenceTerminal } from './pages/HistoricalIntelligenceTerminal';
import { ResearchLibrary } from './pages/ResearchLibrary';
import { ArtifactPage } from './pages/ArtifactPage';
import { GlobalYields } from './pages/market/GlobalYields';
import { CommoditiesIntelligence } from './pages/market/CommoditiesIntelligence';

export default function App() {
  return (
    <BrowserRouter>
          <DrawerProvider>
          <Routes>
            <Route path="/login"                element={<Navigate to="/" replace />} />
            {/* ── Public research surfaces ── */}
            <Route path="/"                     element={<Layout><MarketHome /></Layout>} />
            <Route path="/investigations"       element={<Layout><Investigations /></Layout>} />
            {/* Single-asset research (public discovery) */}
            <Route path="/instruments/:symbol"     element={<Layout><InstrumentDetail /></Layout>} />
            <Route path="/macro"                element={<Layout><MacroRegimeDesk /></Layout>} />
            <Route path="/research"             element={<Layout><HistoricalResearch /></Layout>} />
            <Route path="/research/i/:id"       element={<Layout><HistoricalResearch /></Layout>} />
            <Route path="/positioning"          element={<Navigate to="/research" replace />} />
            <Route path="/copilot"              element={<Layout><ResearchCopilot /></Layout>} />
            <Route path="/historical-intelligence" element={<Layout><HistoricalIntelligenceTerminal /></Layout>} />
            <Route path="/library"              element={<Layout><ResearchLibrary /></Layout>} />
            <Route path="/artifacts/:id"        element={<Layout><ArtifactPage /></Layout>} />
            <Route path="/settings"             element={<Layout><Settings /></Layout>} />
            {/* Market Dashboards — Phase 1 + 2 (public discovery) */}
            <Route path="/market/global-yields" element={<Layout><GlobalYields /></Layout>} />
            <Route path="/market/commodities"   element={<Layout><CommoditiesIntelligence /></Layout>} />
            <Route path="*"                       element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
          </DrawerProvider>
    </BrowserRouter>
  );
}
