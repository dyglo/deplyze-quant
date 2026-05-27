import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, ArrowUpRight } from 'lucide-react';
import { usePortfolioWorkspace } from '../../hooks/usePortfolioWorkspace';
import { usePortfolioAgentOutputs } from '../../hooks/useAgentIntelligence';
import { useSWR } from '../../hooks/useSWR';
import { fetchQuotes } from '../../services/marketService';
import { SectionCard } from './SectionCard';
import { fmtPct, deltaColor, relTime, stripMarkdown } from './format';

const HoldingsStrip: React.FC<{ symbols: string[] }> = ({ symbols }) => {
  const navigate = useNavigate();
  const key = symbols.slice(0, 8).join(',');
  const { data, loading } = useSWR(
    () => (key ? fetchQuotes(symbols.slice(0, 8)) : Promise.resolve([])),
    [key],
    { cacheKey: key ? `marketHome:holdings:${key}` : undefined },
  );
  const rows = data ?? [];

  if (loading && rows.length === 0) {
    return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ height: 46, width: 96, borderRadius: 7, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />)}</div>;
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {rows.map((r) => {
        const pct = r.data?.changePercent ?? 0;
        return (
          <button
            key={r.symbol}
            type="button"
            disabled={!r.ok}
            onClick={r.ok ? () => navigate(`/instruments/${encodeURIComponent(r.symbol)}`) : undefined}
            className="ds-transition-fast"
            style={{
              display: 'flex', flexDirection: 'column', gap: 2, padding: '7px 11px', borderRadius: 7,
              border: '1px solid var(--border)', background: 'transparent', cursor: r.ok ? 'pointer' : 'default', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>{r.symbol}</span>
            <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: deltaColor(pct) }}>{r.ok ? fmtPct(pct) : '—'}</span>
          </button>
        );
      })}
    </div>
  );
};

export const PortfolioInsights: React.FC = () => {
  const navigate = useNavigate();
  const { portfolios, selectedPortfolio, holdings, loading } = usePortfolioWorkspace();
  const { data: agentOutputs } = usePortfolioAgentOutputs(selectedPortfolio?.id, { limit: 3 });

  // Don't render the section at all while we don't yet know if a portfolio exists.
  if (loading) return null;

  if (portfolios.length === 0) {
    return (
      <SectionCard title="Your Portfolio" subtitle="Personalised intelligence">
        <button
          type="button"
          onClick={() => navigate('/portfolio')}
          className="ds-transition-fast"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
            padding: '16px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', cursor: 'pointer',
          }}
        >
          <Briefcase size={20} style={{ color: 'var(--primary)' }} />
          <span>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>Build a portfolio to unlock personalised intelligence</span>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted-foreground)', marginTop: 2 }}>Track holdings and get exposure, risk-fit, and agent insights tailored to you.</span>
          </span>
        </button>
      </SectionCard>
    );
  }

  const symbols = holdings.map((h) => h.symbol);

  return (
    <SectionCard
      title="Your Portfolio"
      subtitle={selectedPortfolio?.name}
      action={
        <button onClick={() => navigate('/portfolio/overview')} className="ds-transition-fast" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          Open workspace <ArrowUpRight size={12} />
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {symbols.length > 0 ? (
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', marginBottom: 8 }}>Holdings</div>
            <HoldingsStrip symbols={symbols} />
          </div>
        ) : (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>No holdings yet — add positions in the portfolio workspace.</p>
        )}

        {(agentOutputs?.length ?? 0) > 0 && (
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', marginBottom: 8 }}>Portfolio Intelligence</div>
            <div style={{ display: 'grid', gap: 2 }}>
              {agentOutputs!.slice(0, 3).map((o) => (
                <button
                  key={o.artifact_id}
                  type="button"
                  onClick={() => navigate(`/artifacts/${encodeURIComponent(o.artifact_id)}`)}
                  className="ds-transition-fast"
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 2px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stripMarkdown(o.title) || 'Portfolio observation'}</span>
                    <span style={{ fontSize: 9.5, color: 'var(--muted-foreground)', flexShrink: 0 }}>{relTime(o.generated_at)}</span>
                  </span>
                  {o.summary && <span style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4, marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{stripMarkdown(o.summary)}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
};
