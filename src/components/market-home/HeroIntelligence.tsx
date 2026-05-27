import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowUpRight } from 'lucide-react';
import { useNews } from '../../hooks/useMarket';
import { useSWR } from '../../hooks/useSWR';
import { useCompositeRegime, useRiskEnvironment } from '../../hooks/useAgentIntelligence';
import { fetchHeroRail } from '../../services/marketHomeService';
import { extractRiskLevel } from '../../services/agentService';
import { RegimeStatusChip, RiskLevelChip } from '../quant/SystemAnalyzingState';
import { fmtPrice, fmtPct, deltaColor } from './format';
import type { GatewayNewsItem } from '../../services/marketService';

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const NewsCard: React.FC<{ item: GatewayNewsItem; featured?: boolean }> = ({ item, featured }) => (
  <a
    href={item.url}
    target="_blank"
    rel="noopener noreferrer"
    className="ds-transition-fast"
    style={{
      display: 'flex', flexDirection: featured ? 'column' : 'row', gap: featured ? 10 : 11,
      padding: featured ? 0 : '10px 0', textDecoration: 'none',
      borderBottom: featured ? 'none' : '1px solid var(--border)',
    }}
  >
    {item.image && (
      <div style={{
        width: featured ? '100%' : 72,
        height: featured ? 188 : 54,
        flexShrink: 0,
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--muted)',
      }}>
        <img src={item.image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )}
    <div style={{ minWidth: 0 }}>
      <p style={{
        margin: 0,
        fontSize: featured ? 18 : 12.5,
        fontWeight: featured ? 700 : 600,
        lineHeight: 1.3,
        color: 'var(--foreground)',
        letterSpacing: '-0.01em',
        display: '-webkit-box',
        WebkitLineClamp: featured ? 3 : 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>{item.headline}</p>
      {featured && item.summary && (
        <p style={{ margin: '7px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--muted-foreground)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.summary}</p>
      )}
      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {item.source}{item.publishedAt ? ` · ${timeAgo(item.publishedAt)}` : ''}
      </div>
    </div>
  </a>
);

const FeaturedIntelligence: React.FC = () => {
  const navigate = useNavigate();
  const { data: regime, regimeLabel } = useCompositeRegime();
  const { data: risk } = useRiskEnvironment();
  const riskLevel = extractRiskLevel(risk);

  const summary = regime?.summary || risk?.summary;

  return (
    <button
      type="button"
      onClick={() => navigate('/macro')}
      className="ds-transition-fast"
      style={{
        textAlign: 'left', width: '100%', cursor: 'pointer',
        background: 'color-mix(in srgb, var(--primary) 7%, transparent)',
        borderLeft: '3px solid var(--primary)',
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Sparkles size={14} style={{ color: 'var(--primary)' }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--primary)' }}>
          Deplyze Intelligence Summary
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <RegimeStatusChip regime={regimeLabel} confidence={regime?.confidence ?? null} />
        <RiskLevelChip riskLevel={riskLevel} severity={risk?.severity} />
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--foreground)' }}>
        {summary
          ? summary
          : 'Composite regime and risk-environment intelligence is recalculating. Cross-asset signals will appear here as the agents publish their latest reads.'}
      </p>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: 'var(--primary)' }}>
        Open Macro Regime Desk <ArrowUpRight size={12} />
      </span>
    </button>
  );
};

const HeroRail: React.FC = () => {
  const navigate = useNavigate();
  const { data, loading } = useSWR(() => fetchHeroRail(), [], { cacheKey: 'marketHome:heroRail' });
  const rows = data ?? [];

  return (
    <div>
      <div style={{ padding: '0 0 8px', borderBottom: '2px solid var(--foreground)', marginBottom: 4, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--foreground)' }}>
        Markets Now
      </div>
      <div>
        {loading && rows.length === 0
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 34, margin: '6px 0', borderRadius: 6, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
            ))
          : rows.map((r) => {
              const color = deltaColor(r.changePercent);
              return (
                <button
                  key={r.symbol}
                  type="button"
                  disabled={!r.ok}
                  onClick={r.ok ? () => navigate(`/instruments/${encodeURIComponent(r.symbol)}`) : undefined}
                  className="ds-transition-fast"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    width: '100%', padding: '7px 4px', background: 'transparent', border: 'none',
                    borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: r.ok ? 'pointer' : 'default',
                  }}
                  onMouseEnter={(e) => { if (r.ok) (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--foreground)' }}>{r.symbol}</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>{r.ok ? fmtPrice(r.price) : '—'}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color, minWidth: 56, textAlign: 'right' }}>{r.ok ? fmtPct(r.changePercent) : '—'}</span>
                  </span>
                </button>
              );
            })}
      </div>
    </div>
  );
};

export const HeroIntelligence: React.FC = () => {
  const { data: news, loading } = useNews({ category: 'general', limit: 7 });
  const items = news ?? [];
  const featured = items[0];
  const rest = items.slice(1, 5);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1.2fr) minmax(240px, 0.9fr)',
      gap: 24,
      alignItems: 'start',
    }} className="market-home-hero">
      {/* Left: featured story */}
      <div style={{ minHeight: 220 }}>
        {loading && !featured ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ height: 188, borderRadius: 8, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
            <div style={{ height: 18, width: '80%', borderRadius: 4, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
          </div>
        ) : featured ? (
          <NewsCard item={featured} featured />
        ) : (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Market headlines are loading…</p>
        )}
      </div>

      {/* Center: AI summary + secondary headlines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <FeaturedIntelligence />
        <div>
          {loading && rest.length === 0
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ height: 44, margin: '8px 0', borderRadius: 6, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
              ))
            : rest.map((item) => <NewsCard key={item.id} item={item} />)}
        </div>
      </div>

      {/* Right: compact market rail */}
      <HeroRail />
    </div>
  );
};
