import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import { Activity, AlertCircle, Eye, EyeOff, Loader2, BarChart3, Network, Telescope } from 'lucide-react';

type AuthMode = 'login' | 'register';

const PROOF_POINTS = [
  { icon: Activity,   text: 'Continuous market intelligence' },
  { icon: BarChart3,  text: 'Quant analysis on autopilot' },
  { icon: Network,    text: 'Cross-asset macro context' },
  { icon: Telescope,  text: 'Model observatory & briefings' },
];

export const Login: React.FC = () => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, authError, clearAuthError } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    clearAuthError();
    setEmail(''); setPassword(''); setDisplayName('');
  };

  const handleGoogle = async () => {
    setBusy(true);
    try { await signInWithGoogle(); } finally { setBusy(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') await signInWithEmail(email, password);
      else await signUpWithEmail(email, password, displayName);
    } catch { /* error surfaced via authError */ }
    finally { setBusy(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', height: '2.375rem', padding: '0 0.875rem',
    background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '0.5rem',
    fontSize: '0.8125rem', color: 'var(--foreground)', outline: 'none',
  };

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

      {/* ─── Right: auth form ─── */}
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem 2rem' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <h2 className="ds-title" style={{ margin: 0 }}>
            {mode === 'login' ? 'Sign in to Deplyze Quant' : 'Create your research desk'}
          </h2>
          <p className="ds-caption" style={{ marginTop: 6, color: 'var(--muted-foreground)' }}>
            {mode === 'login' ? 'Continue to your research workspace.' : 'A workspace will be provisioned for you.'}
          </p>

          {authError && (
            <div style={{
              marginTop: 16, padding: '10px 12px', borderRadius: 8,
              background: 'rgba(193, 95, 60, 0.08)', border: '1px solid rgba(193, 95, 60, 0.24)',
              color: 'var(--primary)', display: 'flex', gap: 8, alignItems: 'center', fontSize: 12,
            }}>
              <AlertCircle size={14} /><span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ marginTop: 20, display: 'grid', gap: 12 }}>
            {mode === 'register' && (
              <input
                type="text" required placeholder="Full name"
                value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                style={inputStyle}
              />
            )}
            <input
              type="email" required placeholder="Email"
              value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle}
            />
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'} required minLength={6}
                placeholder="Password"
                value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle}
              />
              <button type="button" onClick={() => setShowPassword((s) => !s)} style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer',
              }}>
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <button type="submit" disabled={busy} style={{
              height: '2.5rem', borderRadius: '0.5rem', border: 'none',
              background: 'var(--primary)', color: 'var(--primary-foreground)',
              fontSize: 13, fontWeight: 600, cursor: busy ? 'progress' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div style={{ margin: '14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span className="ds-caption" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <button onClick={handleGoogle} disabled={busy} style={{
            width: '100%', height: '2.5rem', borderRadius: '0.5rem',
            border: '1px solid var(--border)', background: 'var(--card)',
            color: 'var(--foreground)', fontSize: 13, fontWeight: 500,
            cursor: busy ? 'progress' : 'pointer',
          }}>
            Continue with Google
          </button>

          <p className="ds-caption" style={{ textAlign: 'center', marginTop: 16, color: 'var(--muted-foreground)' }}>
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button onClick={() => switchMode(mode === 'login' ? 'register' : 'login')} style={{
              background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600,
            }}>
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
