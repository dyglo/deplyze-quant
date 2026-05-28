import React, { useState, useEffect, useMemo } from 'react';
import { ExternalLink, Loader2, FileText, Activity, BookOpen, AlertCircle } from 'lucide-react';
import { useNews } from '../../hooks/useMarket';
import { useAgentOutputs } from '../../hooks/useAgentIntelligence';
import { fetchFilingsForSymbol, type FilingRow, type RelationsContextPayload } from '../../services/v3p2Service';
import { NewsList } from './NewsList';
import { IntelligenceObservationCard } from './IntelligenceObservationCard';
import type { Briefing, IntelligenceArtifact } from '../../types';

interface Props {
  symbol: string;
  artifacts: IntelligenceArtifact[];
  briefings: Briefing[];
  relationsContext: RelationsContextPayload | null;
  onOpenArtifact: (id: string) => void;
}

type TabType = 'news' | 'research' | 'briefings' | 'filings' | 'narratives' | 'observations';

const TABS: Array<{ id: TabType; label: string }> = [
  { id: 'news', label: 'News' },
  { id: 'research', label: 'Research Artifacts' },
  { id: 'briefings', label: 'Market Briefings' },
  { id: 'filings', label: 'SEC Filings' },
  { id: 'narratives', label: 'Narrative Shifts' },
  { id: 'observations', label: 'Agent Observations' },
];

export const InstrumentLayeredNews: React.FC<Props> = ({
  symbol,
  artifacts,
  briefings,
  relationsContext,
  onOpenArtifact,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('news');

  // 1. News
  const news = useNews({ symbol, limit: 12 });

  // 2. Filings
  const [filings, setFilings] = useState<FilingRow[]>([]);
  const [filingsLoading, setFilingsLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'filings' && symbol) {
      setFilingsLoading(true);
      fetchFilingsForSymbol(symbol, 15)
        .then(res => setFilings(res))
        .catch(() => setFilings([]))
        .finally(() => setFilingsLoading(false));
    }
  }, [activeTab, symbol]);

  // 3. Agent Observations
  const agentObs = useAgentOutputs({ symbol, limit: 15 });

  // 4. Filtered Artifacts & Briefings
  const relatedArtifacts = useMemo(() => {
    return artifacts.filter(a => a.symbols?.some(s => s.toUpperCase() === symbol.toUpperCase()));
  }, [artifacts, symbol]);

  const relatedBriefings = useMemo(() => {
    return briefings.filter(b => b.symbols?.some(s => s.toUpperCase() === symbol.toUpperCase()));
  }, [briefings, symbol]);

  return (
    <section style={{ marginBottom: 28 }}>
      {/* Section header + tabs in one row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', paddingBottom: 10 }}>
          News & Intelligence
        </h2>
        <div style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', gap: 0 }}>
          {TABS.map(t => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                  padding: '6px 12px 8px',
                  fontSize: 11.5,
                  fontWeight: isActive ? 700 : 400,
                  color: isActive ? 'var(--primary)' : 'var(--muted-foreground)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ minHeight: 120 }}>
        {/* NEWS TAB */}
        {activeTab === 'news' && (
          <div>
            {news.loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--muted-foreground)', fontSize: 12 }}>
                <Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} />
                Loading latest news…
              </div>
            ) : news.data?.length ? (
              <NewsList items={news.data.map(n => ({ id: n.id, headline: n.headline, summary: n.summary, url: n.url, source: n.source, publishedAt: n.publishedAt }))} max={10} />
            ) : (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
                No recent headlines found.
              </div>
            )}
          </div>
        )}

        {/* RESEARCH TAB */}
        {activeTab === 'research' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {relatedArtifacts.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
                No saved research artifacts for {symbol} yet. Save a snapshot or compile intelligence to view it here.
              </div>
            ) : (
              relatedArtifacts.map(a => (
                <button
                  key={a.id}
                  onClick={() => onOpenArtifact(a.id)}
                  className="ds-surface ds-row"
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    textAlign: 'left',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <span className="ds-label" style={{ color: 'var(--primary)' }}>{a.category}</span>
                    <span className="ds-caption">{new Date(a.createdAt).toLocaleDateString()}</span>
                  </div>
                  <span className="ds-heading" style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>{a.title}</span>
                  {a.summary && <span className="ds-caption" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.summary}</span>}
                </button>
              ))
            )}
          </div>
        )}

        {/* BRIEFINGS TAB */}
        {activeTab === 'briefings' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {relatedBriefings.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
                No macro/sector briefings mention {symbol} recently.
              </div>
            ) : (
              relatedBriefings.map(b => (
                <a
                  key={b.id}
                  href={`/briefings/${b.id}`}
                  className="ds-surface ds-row"
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    textDecoration: 'none',
                    color: 'inherit',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <span className="ds-label" style={{ color: 'var(--primary)' }}>Briefing · {b.kind}</span>
                    <span className="ds-caption">{new Date(b.createdAt).toLocaleDateString()}</span>
                  </div>
                  <span className="ds-heading" style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>{b.title}</span>
                  {b.summary && <span className="ds-caption" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.summary}</span>}
                </a>
              ))
            )}
          </div>
        )}

        {/* FILINGS TAB */}
        {activeTab === 'filings' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {filingsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--muted-foreground)', fontSize: 12 }}>
                <Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} />
                Fetching EDGAR filings…
              </div>
            ) : filings.length > 0 ? (
              filings.map((f, idx) => {
                const dateStr = typeof f.filing_date === 'string' ? f.filing_date : f.filing_date?.value;
                const date = dateStr ? new Date(dateStr).toLocaleDateString() : '—';
                return (
                  <div
                    key={f.id || idx}
                    className="ds-surface"
                    style={{
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderRadius: 8,
                      background: 'var(--card)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <FileText size={18} style={{ color: 'var(--muted-foreground)' }} />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(193,95,60,0.1)', color: 'var(--primary)' }}>
                            {f.form_type}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{f.entity_name || symbol}</span>
                        </div>
                        <span className="ds-caption" style={{ marginTop: 2, display: 'inline-block' }}>Filed on {date}</span>
                      </div>
                    </div>
                    {f.document_url && (
                      <a href={f.document_url} target="_blank" rel="noreferrer" className="ds-btn-ghost" style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                        View SEC Link <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
                No recent SEC EDGAR filings available.
              </div>
            )}
          </div>
        )}

        {/* NARRATIVES TAB */}
        {activeTab === 'narratives' && (
          <div style={{ display: 'grid', gap: 10 }}>
            {relationsContext?.narratives && relationsContext.narratives.length > 0 ? (
              relationsContext.narratives.map((theme, i) => (
                <div key={theme.themeId || i} className="ds-surface" style={{ padding: 12, background: 'var(--card)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>
                      {theme.themeLabel}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                      Score: {theme.lifetimeScore?.toFixed(1) ?? '—'}
                    </span>
                  </div>
                  <p className="ds-caption" style={{ margin: '6px 0 0', lineHeight: 1.4, color: 'var(--muted-foreground)' }}>
                    Focal themes and news narratives related to {symbol}. Memory traces indicate a last seen stamp of{' '}
                    {theme.lastSeenTs ? new Date(theme.lastSeenTs).toLocaleDateString() : '—'}.
                  </p>
                </div>
              ))
            ) : (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
                No active emerging narratives found.
              </div>
            )}
          </div>
        )}

        {/* AGENT OBSERVATIONS TAB */}
        {activeTab === 'observations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {agentObs.loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--muted-foreground)', fontSize: 12 }}>
                <Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} />
                Loading agent logs…
              </div>
            ) : agentObs.data?.length ? (
              agentObs.data.map(obs => (
                <IntelligenceObservationCard key={obs.artifact_id} output={obs} compact />
              ))
            ) : (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
                No autonomous agent observations recorded for {symbol} in the last 48 hours.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
