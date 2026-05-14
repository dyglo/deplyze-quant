import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useWorkspace } from '../components/WorkspaceContext';
import { useBriefings } from '../hooks/useArtifacts';
import { useBriefingGenerate } from '../hooks/useBriefingGenerate';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import { FreshnessBadge } from '../components/quant/FreshnessBadge';
import { FileText, Loader2, RefreshCw, ArrowRight } from 'lucide-react';
import type { BriefingGenerateKind } from '../services/briefingService';
import type { Briefing } from '../types';

interface KindMeta {
  id: BriefingGenerateKind;
  label: string;
  blurb: string;
  evidence: string;
  needsSymbol?: boolean;
}

const KINDS: KindMeta[] = [
  { id: 'daily-pulse',         label: 'Daily Market Pulse',      blurb: 'Top movers + headlines snapshot.',                evidence: 'Twelve Data quotes + Serper headlines' },
  { id: 'daily-macro',         label: 'Macro Context',           blurb: 'Latest values for Fed Funds, CPI, 10Y, 2Y, U-3, GDP.', evidence: 'Alpha Vantage macro series' },
  { id: 'instrument-snapshot', label: 'Instrument Snapshot',     blurb: 'Single instrument deep dive — quote, vol, catalysts.', evidence: 'Twelve Data + Finnhub profile/news', needsSymbol: true },
  { id: 'cross-asset',         label: 'Cross-Asset Relationships', blurb: 'Pairwise correlations across a macro universe.',  evidence: 'Twelve Data OHLCV (60-day log-return ρ)' },
  { id: 'sentiment',           label: 'Sentiment',               blurb: 'Headline mood proxy across news sources.',         evidence: 'Tavily + Serper headlines' },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.id, k.label]));
KIND_LABEL['weekly-regime']   = 'Weekly Regime Report';
KIND_LABEL['volatility']      = 'Volatility Intelligence';
KIND_LABEL['positioning']     = 'Positioning Report';
KIND_LABEL['sector-rotation'] = 'Sector Rotation';
KIND_LABEL['earnings']        = 'Earnings Intelligence';
KIND_LABEL['risk']            = 'Risk Environment';
KIND_LABEL['trade-thesis']    = 'Trade Thesis';
KIND_LABEL['market-stress']   = 'Market Stress Report';

export const Briefings: React.FC = () => {
  const navigate = useNavigate();
  const { currentWorkspace, currentProject } = useWorkspace();
  const { items, loading } = useBriefings(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const gen = useBriefingGenerate();
  const [activeKind, setActiveKind] = useState<BriefingGenerateKind | null>(null);
  const [snapshotInput, setSnapshotInput] = useState('AAPL');

  const handleGenerate = async (kind: BriefingGenerateKind, params?: { symbol?: string }) => {
    if (!currentWorkspace || !currentProject) {
      toast.error('Select a workspace and project first.');
      return;
    }
    setActiveKind(kind);
    const result = await gen.run({
      kind,
      workspaceId: currentWorkspace.id,
      projectId: currentProject.id,
      params,
    });
    setActiveKind(null);
    if (result) {
      toast.success(`Generated: ${result.title}`);
      navigate(`/briefings/${result.id}`);
    } else if (gen.error) {
      toast.error(`Generate failed: ${gen.error.message}`);
    }
  };

  const lastByKind = new Map<string, Briefing>();
  for (const b of items) {
    if (!lastByKind.has(b.kind)) lastByKind.set(b.kind, b);
  }

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Institutional Research Briefings"
        subtitle="On-demand briefings synthesised by Gemini over live provider data. Generated briefings persist to Firestore and remain accessible to the whole workspace."
      />

      {/* Generators */}
      <section style={{ marginBottom: 24 }}>
        <h2 className="ds-heading" style={{ marginBottom: 10 }}>Generate</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {KINDS.map((k) => {
            const last = lastByKind.get(k.id);
            const isThisRunning = gen.generating && activeKind === k.id;
            return (
              <article key={k.id} className="ds-surface" style={{ padding: 14, borderRadius: 10, display: 'grid', gap: 8 }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                  <span className="ds-heading" style={{ margin: 0 }}>{k.label}</span>
                  {last && <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>last {new Date(last.createdAt).toLocaleString()}</span>}
                </header>
                <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>{k.blurb}</p>
                <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0, fontSize: 10, opacity: 0.75 }}>
                  Evidence: {k.evidence}
                </p>

                {k.needsSymbol && (
                  <input
                    value={snapshotInput}
                    onChange={(e) => setSnapshotInput(e.target.value.toUpperCase())}
                    placeholder="Symbol e.g. AAPL"
                    className="ds-body"
                    style={{
                      padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6,
                      background: 'var(--card)', color: 'var(--foreground)', fontSize: 12,
                    }}
                  />
                )}

                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button
                    disabled={isThisRunning}
                    onClick={() => handleGenerate(k.id, k.needsSymbol ? { symbol: snapshotInput } : undefined)}
                    style={{
                      flex: 1,
                      padding: '6px 10px', borderRadius: 6,
                      border: 'none',
                      background: isThisRunning ? 'var(--muted)' : 'var(--primary)',
                      color: isThisRunning ? 'var(--muted-foreground)' : 'var(--primary-foreground)',
                      cursor: isThisRunning ? 'not-allowed' : 'pointer',
                      fontSize: 11, fontWeight: 600,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    {isThisRunning ? <><Loader2 size={12} className="ds-spin" /> Generating…</> : <>{last ? <><RefreshCw size={11} /> Regenerate</> : <><FileText size={11} /> Generate</>}</>}
                  </button>
                  {last && (
                    <button
                      onClick={() => navigate(`/briefings/${last.id}`)}
                      style={{
                        padding: '6px 10px', borderRadius: 6,
                        border: '1px solid var(--border)', background: 'var(--card)',
                        color: 'var(--foreground)', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      View <ArrowRight size={11} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* History */}
      <section>
        <h2 className="ds-heading" style={{ marginBottom: 10 }}>History</h2>
        {loading ? (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Loading briefings…</p>
        ) : items.length === 0 ? (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
            No briefings yet — generate one above. Briefings are workspace-scoped and persist.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {items.map((b) => (
              <li key={b.id} className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
                <Link to={`/briefings/${b.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'grid', gap: 6 }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>
                      {KIND_LABEL[b.kind] ?? b.kind}
                    </span>
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      {b.dataCompleteness != null && (
                        <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
                          coverage {Math.round((b.dataCompleteness ?? 0) * 100)}%
                        </span>
                      )}
                      <FreshnessBadge status="cached" fetchedAt={b.createdAt} compact />
                    </span>
                  </header>
                  <h3 className="ds-heading" style={{ margin: 0 }}>{b.title}</h3>
                  <p className="ds-body" style={{ margin: 0, color: 'var(--foreground)' }}>{b.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Disclaimer />

      <style>{`.ds-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
};
