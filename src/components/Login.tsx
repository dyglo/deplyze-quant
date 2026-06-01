import React from 'react';
import { Activity, BarChart3, Network, FlaskConical } from 'lucide-react';
import { AuthPanel } from './auth/AuthPanel';

const PROOF_POINTS = [
  { icon: Activity,   text: 'Continuous market intelligence' },
  { icon: BarChart3,  text: 'Quant analysis on autopilot' },
  { icon: Network,    text: 'Cross-asset macro context' },
  { icon: FlaskConical, text: 'Regime-aware backtesting & briefings' },
];

export const Login: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--background)' }}>
      {/* ─── Left: brand / value proposition ─── */}
      <aside style={{
        background: 'linear-gradient(160deg, var(--primary) 0%, #8C3F23 100%)',
        color: '#F4F3EE',
        padding: '3rem 3.5rem',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: 'rgba(244,243,238,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Activity size={18} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>Deplyze Quant</span>
        </div>

        <div>
          <h1 style={{ fontSize: 38, fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.025em', margin: 0 }}>
            AI-native<br />quant research.
          </h1>
          <p style={{ marginTop: 18, maxWidth: 420, fontSize: 14, lineHeight: 1.55, color: 'rgba(244,243,238,0.85)' }}>
            Continuous ingestion, structured market data, autonomous research agents, and institutional
            briefings — built so independent traders and small research teams can think like a desk.
          </p>
        </div>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
          {PROOF_POINTS.map(({ icon: Icon, text }) => (
            <li key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6,
                background: 'rgba(244,243,238,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={13} />
              </div>
              <span style={{ color: 'rgba(244,243,238,0.85)', letterSpacing: '0.01em' }}>{text}</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* ─── Right: auth form (shared with the in-context AuthModal) ─── */}
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 2rem' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <AuthPanel />
        </div>
      </main>
    </div>
  );
};

export default Login;
