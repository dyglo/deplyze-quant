import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, GitBranch } from 'lucide-react';
import { useSWR } from '../../hooks/useSWR';
import { SectionCard } from './SectionCard';
import { fetchLatestBriefings, fetchEmergingNarratives } from '../../services/v3p2Service';
import { tsValue, relTime, stripMarkdown } from './format';

const Empty: React.FC<{ msg: string }> = ({ msg }) => (
  <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '14px 2px' }}>{msg}</p>
);
const Skeleton: React.FC<{ n: number }> = ({ n }) => (
  <div style={{ display: 'grid', gap: 8 }}>
    {Array.from({ length: n }).map((_, i) => <div key={i} style={{ height: 56, borderRadius: 6, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />)}
  </div>
);

const BriefingsBlock: React.FC = () => {
  const navigate = useNavigate();
  const { data, loading, error } = useSWR(() => fetchLatestBriefings(), [], { cacheKey: 'marketHome:briefings' });
  const items = (data ?? []).slice(0, 4);

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', marginBottom: 8 }}>
        <FileText size={12} /> Latest Briefings
      </div>
      {loading && items.length === 0 ? <Skeleton n={3} />
        : error && items.length === 0 ? <Empty msg="Briefings unavailable." />
        : items.length === 0 ? <Empty msg="No briefings published yet." />
        : (
          <div style={{ display: 'grid', gap: 2 }}>
            {items.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => navigate(`/briefings/${encodeURIComponent(b.id)}`)}
                className="ds-transition-fast"
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 2px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--foreground)', minWidth: 0, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{stripMarkdown(b.title)}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted-foreground)', flexShrink: 0 }}>{relTime(tsValue(b.observation_time))}</span>
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4, marginTop: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{stripMarkdown(b.summary)}</span>
              </button>
            ))}
          </div>
        )}
    </div>
  );
};

const NarrativesBlock: React.FC = () => {
  const { data, loading, error } = useSWR(() => fetchEmergingNarratives({ limit: 6 }), [], { cacheKey: 'marketHome:narratives' });
  const items = (data ?? []).slice(0, 5);

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', marginBottom: 8 }}>
        <GitBranch size={12} /> Emerging Narratives
      </div>
      {loading && items.length === 0 ? <Skeleton n={3} />
        : error && items.length === 0 ? <Empty msg="Narrative intelligence unavailable." />
        : items.length === 0 ? <Empty msg="No emerging narratives detected." />
        : (
          <div style={{ display: 'grid', gap: 2 }}>
            {items.map((n) => (
              <div
                key={n.artifact_id}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 2px', borderBottom: '1px solid var(--border)' }}
              >
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--foreground)', minWidth: 0, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{stripMarkdown(n.title)}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>{Math.round(n.confidence * 100)}%</span>
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4, marginTop: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{stripMarkdown(n.summary)}</span>
              </div>
            ))}
          </div>
        )}
    </div>
  );
};

export const AnalysisOpinion: React.FC = () => (
  <SectionCard title="Analysis & Opinion" subtitle="Deplyze research intelligence">
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20 }} className="market-home-cal">
      <BriefingsBlock />
      <NarrativesBlock />
    </div>
  </SectionCard>
);
