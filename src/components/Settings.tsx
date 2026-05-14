import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { useWorkspace } from './WorkspaceContext';
import { useProviderHealth } from '../hooks/useProviders';
import { Sun, Moon, Monitor, Check, LogOut } from 'lucide-react';

type TabId = 'profile' | 'workspace' | 'providers' | 'appearance';

const PROVIDERS = [
  { id: 'finnhub',      label: 'Finnhub',       hint: 'Equities quotes, fundamentals, market news' },
  { id: 'alpha_vantage',label: 'Alpha Vantage', hint: 'Macro time series (CPI, FED, yields, GDP)' },
  { id: 'twelve_data',  label: 'Twelve Data',   hint: 'OHLCV across equities, FX, commodities' },
  { id: 'tavily',       label: 'Tavily',        hint: 'AI-curated web research' },
  { id: 'serper',       label: 'Serper',        hint: 'Google news & web search' },
  { id: 'gemini',       label: 'Gemini',        hint: 'Research synthesis & Copilot' },
] as const;

export const Settings: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const { currentWorkspace, currentProject } = useWorkspace();
  const { data: providers, loading: providersLoading, refresh: refreshProviders } = useProviderHealth();
  const [tab, setTab] = useState<TabId>('profile');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(
    () => (localStorage.getItem('deplyze_theme') as 'light' | 'dark' | 'system') ?? 'system',
  );

  useEffect(() => {
    const root = document.documentElement;
    const apply = (mode: 'light' | 'dark') => root.classList.toggle('dark', mode === 'dark');
    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mql.matches ? 'dark' : 'light');
      const handler = (e: MediaQueryListEvent) => apply(e.matches ? 'dark' : 'light');
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    apply(theme);
    localStorage.setItem('deplyze_theme', theme);
  }, [theme]);

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'profile',    label: 'Profile' },
    { id: 'workspace',  label: 'Workspace' },
    { id: 'providers',  label: 'Data Providers' },
    { id: 'appearance', label: 'Appearance' },
  ];

  return (
    <div style={{ padding: '0 24px 48px', maxWidth: 880, margin: '0 auto' }}>
      <header style={{ padding: '24px 0 12px', borderBottom: '1px solid var(--border)' }}>
        <h1 className="ds-title" style={{ margin: 0 }}>Settings</h1>
        <p className="ds-caption" style={{ marginTop: 6, color: 'var(--muted-foreground)' }}>
          Manage your profile, research workspace, and connected data providers.
        </p>
      </header>

      <nav style={{ display: 'flex', gap: 4, marginTop: 16, borderBottom: '1px solid var(--border)' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="ds-transition"
            style={{
              padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: `2px solid ${tab === t.id ? 'var(--primary)' : 'transparent'}`,
              color: tab === t.id ? 'var(--foreground)' : 'var(--muted-foreground)',
              fontSize: 13, fontWeight: tab === t.id ? 600 : 500,
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section style={{ marginTop: 22 }}>
        {tab === 'profile' && (
          <div className="ds-surface" style={{ padding: 20, borderRadius: 12, display: 'grid', gap: 16 }}>
            <h2 className="ds-heading">Account</h2>
            <Field label="Display name" value={profile?.displayName ?? user?.displayName ?? '—'} />
            <Field label="Email" value={user?.email ?? '—'} />
            <Field label="User ID" value={user?.uid ?? '—'} mono />
            <button onClick={signOut} style={{
              justifySelf: 'start',
              padding: '8px 14px', background: 'transparent',
              border: '1px solid var(--border)', borderRadius: 8,
              fontSize: 12, fontWeight: 500, color: 'var(--foreground)',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <LogOut size={13} /> Sign out
            </button>
          </div>
        )}

        {tab === 'workspace' && (
          <div className="ds-surface" style={{ padding: 20, borderRadius: 12, display: 'grid', gap: 16 }}>
            <h2 className="ds-heading">Workspace (Research Desk)</h2>
            <Field label="Current workspace" value={currentWorkspace?.name ?? '—'} />
            <Field label="Current project (strategy)" value={currentProject?.name ?? '—'} />
            <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
              Workspaces and projects map to the institutional concepts of research desk and strategy
              respectively. Use the sidebar to switch between them.
            </p>
          </div>
        )}

        {tab === 'providers' && (
          <div className="ds-surface" style={{ padding: 20, borderRadius: 12, display: 'grid', gap: 14 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="ds-heading">Connected Data Providers</h2>
              <button onClick={refreshProviders} className="ds-caption" style={{
                padding: '4px 8px', background: 'transparent',
                border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                color: 'var(--muted-foreground)',
              }}>
                Refresh
              </button>
            </header>
            <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
              Provider API keys live server-side in the gateway. They are never exposed to the
              browser. Configure them with{' '}
              <code style={{ fontSize: 11 }}>gcloud run services update</code> or in{' '}
              <code style={{ fontSize: 11 }}>.env.local</code> for local development.
            </p>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {PROVIDERS.map((p) => {
                const status = providers?.find((s) => s.id === p.id);
                const configured = !providersLoading && status?.configured === true;
                return (
                  <li key={p.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8,
                  }}>
                    <div>
                      <div className="ds-heading">{p.label}</div>
                      <div className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>{p.hint}</div>
                    </div>
                    <span className={`ds-badge ${configured ? 'ds-pill-low' : 'ds-pill-neutral'}`} style={{ padding: '2px 8px', borderRadius: 999 }}>
                      {providersLoading ? 'Checking…' : configured ? 'Connected' : 'Not configured'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {tab === 'appearance' && (
          <div className="ds-surface" style={{ padding: 20, borderRadius: 12, display: 'grid', gap: 14 }}>
            <h2 className="ds-heading">Appearance</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { id: 'light' as const,  icon: Sun,     label: 'Light' },
                { id: 'dark' as const,   icon: Moon,    label: 'Dark' },
                { id: 'system' as const, icon: Monitor, label: 'System' },
              ].map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${theme === id ? 'var(--primary)' : 'var(--border)'}`,
                    background: theme === id ? 'rgba(193, 95, 60, 0.06)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontSize: 13, color: 'var(--foreground)',
                  }}
                >
                  <Icon size={14} /> {label} {theme === id ? <Check size={12} /> : null}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div style={{ display: 'grid', gap: 4 }}>
    <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
    <span className="ds-body" style={{
      fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
      fontSize: mono ? 12 : undefined,
    }}>
      {value}
    </span>
  </div>
);

export default Settings;
