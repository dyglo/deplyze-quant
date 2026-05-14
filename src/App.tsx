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
import { InstrumentIntelligence } from './pages/InstrumentIntelligence';
import { InstrumentDetail } from './pages/InstrumentDetail';
import { MacroRegimeDesk } from './pages/MacroRegimeDesk';
import { CrossAssetMatrix } from './pages/CrossAssetMatrix';
import { PositioningSentiment } from './pages/PositioningSentiment';
import { ModelObservatory } from './pages/ModelObservatory';
import { QuantLab } from './pages/QuantLab';
import { ResearchCopilot } from './pages/ResearchCopilot';
import { WarehouseExplorer } from './pages/WarehouseExplorer';
import { Briefings } from './pages/Briefings';
import { BriefingDetail } from './pages/BriefingDetail';

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
            <Route path="/instruments"          element={<ProtectedRoute><InstrumentIntelligence /></ProtectedRoute>} />
            <Route path="/instruments/:symbol"  element={<ProtectedRoute><InstrumentDetail /></ProtectedRoute>} />
            <Route path="/macro"                element={<ProtectedRoute><MacroRegimeDesk /></ProtectedRoute>} />
            <Route path="/cross-asset"          element={<ProtectedRoute><CrossAssetMatrix /></ProtectedRoute>} />
            <Route path="/positioning"          element={<ProtectedRoute><PositioningSentiment /></ProtectedRoute>} />
            <Route path="/models"               element={<ProtectedRoute><ModelObservatory /></ProtectedRoute>} />
            <Route path="/lab"                  element={<ProtectedRoute><QuantLab /></ProtectedRoute>} />
            <Route path="/copilot"              element={<ProtectedRoute><ResearchCopilot /></ProtectedRoute>} />
            <Route path="/warehouse"            element={<ProtectedRoute><WarehouseExplorer /></ProtectedRoute>} />
            <Route path="/briefings"            element={<ProtectedRoute><Briefings /></ProtectedRoute>} />
            <Route path="/briefings/:id"        element={<ProtectedRoute><BriefingDetail /></ProtectedRoute>} />
            <Route path="/settings"             element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="*"                     element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
          </DrawerProvider>
        </BrowserRouter>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
