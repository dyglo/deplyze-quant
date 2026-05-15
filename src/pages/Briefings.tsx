import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useWorkspace } from '../components/WorkspaceContext';
import { useBriefings } from '../hooks/useArtifacts';
import { useBriefingGenerate } from '../hooks/useBriefingGenerate';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import { FreshnessBadge } from '../components/quant/FreshnessBadge';
import { FileText, Loader2, RefreshCw, ArrowRight, Plus } from 'lucide-react';
import type { BriefingGenerateKind } from '../services/briefingService';
import type { Briefing } from '../types';

interface KindMeta {
  id: BriefingGenerateKind | 'custom';
  label: string;
  blurb: string;
  evidence: string;
  needsSymbol?: boolean;
  group: 'market' | 'strategy' | 'custom';
}

const KINDS: KindMeta[] = [
  // Market Analysis
  { id: 'daily-pulse',         label: 'Daily Market Pulse',        blurb: 'Top movers + headlines snapshot.',                         evidence: 'Live quotes + news feeds',                group: 'market' },
  { id: 'daily-macro',         label: 'Macro Context',             blurb: 'Fed Funds, CPI, 10Y, 2Y, U-3, GDP snapshot.',              evidence: 'Macro series data',                       group: 'market' },
  { id: 'instrument-snapshot', label: 'Instrument Snapshot',       blurb: 'Single instrument deep dive — quote, vol, catalysts.',      evidence: 'Price data + fundamentals + news',        group: 'market', needsSymbol: true },
  { id: 'cross-asset',         label: 'Cross-Asset Relationships', blurb: 'Pairwise correlations across a macro universe.',            evidence: 'Historical OHLCV (60-day log-return ρ)',  group: 'market' },
  { id: 'sentiment',           label: 'Sentiment',                 blurb: 'Headline mood proxy across news sources.',                  evidence: 'News & web research feeds',               group: 'market' },
  { id: 'weekly-regime',       label: 'Weekly Regime Report',      blurb: 'Macro regime classification + asset allocation implication.',evidence: 'Macro series + price data',              group: 'market' },
  { id: 'volatility',          label: 'Volatility Intelligence',   blurb: 'VIX, realised vol, term structure, risk events ahead.',     evidence: 'Historical OHLCV + headlines',            group: 'market' },
  { id: 'market-stress',       label: 'Market Stress Report',      blurb: 'Systemic stress indicators — spreads, vol, liquidity.',     evidence: 'Macro series + price data',               group: 'market' },
  // Research & Strategy
  { id: 'earnings',            label: 'Earnings Intelligence',     blurb: 'Upcoming earnings + analyst consensus + beat/miss history.', evidence: 'Earnings data + news',                  group: 'strategy', needsSymbol: true },
  { id: 'sector-rotation',     label: 'Sector Rotation',           blurb: 'Relative performance + momentum across GICS sectors.',      evidence: 'Historical ETF price data',              group: 'strategy' },
  { id: 'positioning',         label: 'Positioning Report',        blurb: 'COT-style positioning + speculative sentiment.',            evidence: 'Web research + news intelligence',        group: 'strategy' },
  { id: 'risk',                label: 'Risk Environment',          blurb: 'Tail risk, correlation breakdown, drawdown watch.',         evidence: 'Price data + macro spreads',              group: 'strategy' },
  { id: 'trade-thesis',        label: 'Trade Thesis',              blurb: 'Structured long/short thesis for a given instrument.',      evidence: 'Price data + fundamentals + news',        group: 'strategy', needsSymbol: true },
  // Custom
  { id: 'custom',              label: 'Custom Research Brief',     blurb: 'Ask any research question — synthesised over live market data.', evidence: 'All connected data sources',       group: 'custom' },
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
  const [activeKind, setActiveKind] = useState<string | null>(null);
  const [snapshotInput, setSnapshotInput] = useState('AAPL');
  const [customQuery, setCustomQuery] = useState('');
  const [historyTab, setHistoryTab] = useState<string>('all');

  const handleGenerate = async (kind: BriefingGenerateKind, params?: { symbol?: string; query?: string }) => {
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

  const historyKinds = ['all', ...Array.from(new Set(items.map(b => b.kind)))];
  const historyItems = historyTab === 'all' ? items : items.filter(b => b.kind === historyTab);

  const GROUPS = [
    { id: 'market',   label: 'Market Analysis' },
    { id: 'strategy', label: 'Research & Strategy' },
    { id: 'custom',   label: 'Custom' },
  ] as const;

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Institutional Research Briefings"
        subtitle="13 briefing types synthesised by AI over live market data. Persist to your workspace and remain accessible to the whole research desk."
      />

      {/* Generators — grouped */}
      {GROUPS.map(group => {
        const groupKinds = KINDS.filter(k => k.group === group.id);
        return (
          <section key={group.id} style={{ marginBottom: 28 }}>
            <h2 className="ds-heading" style={{ marginBottom: 10 }}>{group.label}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {groupKinds.map((k) => {
                const last = k.id !== 'custom' ? lastByKind.get(k.id) : undefined;
                const isThisRunning = gen.generating && activeKind === k.id;
                return (
                  <article key={k.id} className="ds-surface" style={{ padding: 14, borderRadius: 10, display: 'grid', gap: 8 }}>
                    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                      <span className="ds-heading" style={{ margin: 0 }}>{k.label}</span>
                      {last && <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{new Date(last.createdAt).toLocaleDateString()}</span>}
                    </header>
                    <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>{k.blurb}</p>
                    <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0, fontSize: 10, opacity: 0.7 }}>
                      Evidence: {k.evidence}
                    </p>

                    {k.needsSymbol && (
                      <input
                        value={snapshotInput}
                        onChange={(e) => setSnapshotInput(e.target.value.toUpperCase())}
                        placeholder="Symbol e.g. AAPL"
                        style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)', color: 'var(--foreground)', fontSize: 12 }}
                      />
                    )}

                    {k.id === 'custom' && (
                      <textarea
                        value={customQuery}
                        onChange={e => setCustomQuery(e.target.value)}
                        placeholder="e.g. What is the current macro positioning of hedge funds in EM debt? What does the yield curve inversion imply for equity duration?"
                        rows={3}
                        style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)', color: 'var(--foreground)', fontSize: 12, resize: 'vertical', fontFamily: 'inherit' }}
                      />
                    )}

                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button
                        disabled={isThisRunning || (k.id === 'custom' && !customQuery.trim())}
                        onClick={() => {
                          if (k.id === 'custom') {
                            handleGenerate('trade-thesis' as BriefingGenerateKind, { query: customQuery });
                          } else {
                            handleGenerate(k.id as BriefingGenerateKind, k.needsSymbol ? { symbol: snapshotInput } : undefined);
                          }
                        }}
                        style={{
                          flex: 1, padding: '6px 10px', borderRadius: 6, border: 'none',
                          background: isThisRunning ? 'var(--muted)' : 'var(--primary)',
                          color: isThisRunning ? 'var(--muted-foreground)' : 'var(--primary-foreground)',
                          cursor: isThisRunning ? 'not-allowed' : 'pointer',
                          fontSize: 11, fontWeight: 600,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: (k.id === 'custom' && !customQuery.trim()) ? 0.5 : 1,
                        }}
                      >
                        {isThisRunning
                          ? <><Loader2 size={12} className="ds-spin" /> Generating…</>
                          : k.id === 'custom'
                            ? <><Plus size={11} /> Generate Brief</>
                            : last ? <><RefreshCw size={11} /> Regenerate</> : <><FileText size={11} /> Generate</>
                        }
                      </button>
                      {last && (
                        <button
                          onClick={() => navigate(`/briefings/${last.id}`)}
                          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
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
        );
      })}

      {/* History — tabbed by kind */}
      <section>
        <h2 className="ds-heading" style={{ marginBottom: 10 }}>History</h2>
        {/* Kind tabs */}
        {items.length > 0 && (
          <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 14, overflowX: 'auto' }}>
            {historyKinds.map(k => {
              const count = k === 'all' ? items.length : items.filter(b => b.kind === k).length;
              return (
                <button key={k} onClick={() => setHistoryTab(k)}
                  style={{ padding: '6px 12px', border: 'none', borderBottom: historyTab === k ? '2px solid var(--primary)' : '2px solid transparent', background: 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: historyTab === k ? 700 : 500, color: historyTab === k ? 'var(--primary)' : 'var(--muted-foreground)', marginBottom: -1, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {k === 'all' ? 'All' : (KIND_LABEL[k] ?? k)}
                  <span style={{ background: 'var(--muted)', borderRadius: 10, padding: '0 5px', fontSize: 9, fontWeight: 700 }}>{count}</span>
                </button>
              );
            })}
          </nav>
        )}
        {loading ? (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Loading briefings…</p>
        ) : items.length === 0 ? (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
            No briefings yet — generate one above. Briefings are workspace-scoped and persist.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {historyItems.map((b) => {
              const versionCount = items.filter(x => x.kind === b.kind).length;
              return (
                <li key={b.id} className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
                  <Link to={`/briefings/${b.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'grid', gap: 6 }}>
                    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{KIND_LABEL[b.kind] ?? b.kind}</span>
                        {versionCount > 1 && (
                          <span style={{ fontSize: 9, background: 'var(--muted)', borderRadius: 10, padding: '1px 5px', color: 'var(--muted-foreground)', fontWeight: 700 }}>
                            v{versionCount}
                          </span>
                        )}
                      </div>
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
              );
            })}
          </ul>
        )}
      </section>

      <Disclaimer />

      <style>{`.ds-spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
};
