import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowUpRight } from 'lucide-react';
import { useNews, useOHLCV } from '../../hooks/useMarket';
import { useSWR } from '../../hooks/useSWR';
import { Sparkline } from '../quant/Sparkline';
import { useCompositeRegime, useRiskEnvironment } from '../../hooks/useAgentIntelligence';
import { fetchHeroRail, type SnapshotRow } from '../../services/marketHomeService';
import { extractRiskLevel } from '../../services/agentService';
import { RegimeStatusChip, RiskLevelChip } from '../quant/SystemAnalyzingState';
import { fmtPrice, stripMarkdown, symbolCountry } from './format';
import { Flag } from './Flag';
import { ChangeCell } from './ChangeCell';
import type { GatewayNewsItem } from '../../services/marketService';

function timeAgo(ts: number | null | undefined): string {
  if (!Number.isFinite(ts)) return '';
  const s = Math.max(0, Math.floor((Date.now() - Number(ts)) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const NewsCard: React.FC<{ item: GatewayNewsItem; featured?: boolean }> = ({ item, featured }) => {
  const [imgOk, setImgOk] = useState(Boolean(item.image));
  const headline = item.headline || 'Market headline';
  const source = item.source || 'News';
  const age = timeAgo(item.publishedAt);
  return (
  <a
    href={item.url || '#'}
    target="_blank"
    rel="noopener noreferrer"
    className="ds-transition-fast"
    style={{
      display: 'flex', flexDirection: featured ? 'column' : 'row', gap: featured ? 10 : 11,
      padding: featured ? 0 : '10px 0', textDecoration: 'none',
      borderBottom: featured ? 'none' : '1px solid var(--border)',
    }}
  >
    {item.image && imgOk && (
      <div style={{
        width: featured ? '100%' : 72,
        aspectRatio: featured ? '16 / 9' : undefined,
        height: featured ? undefined : 54,
        flexShrink: 0,
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--muted)',
      }}>
        <img
          src={item.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          decoding="async"
          onError={() => setImgOk(false)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
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
      }}>{headline}</p>
      {featured && item.summary && (
        <p style={{ margin: '7px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--muted-foreground)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{stripMarkdown(item.summary)}</p>
      )}
      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {source}{age ? ` · ${age}` : ''}
      </div>
    </div>
  </a>
  );
};

const FeaturedIntelligence: React.FC = () => {
  const navigate = useNavigate();
  const { data: regime, regimeLabel } = useCompositeRegime();
  const { data: risk } = useRiskEnvironment();
  const riskLevel = extractRiskLevel(risk);

  const summary = typeof regime?.summary === 'string'
    ? regime.summary
    : typeof risk?.summary === 'string'
      ? risk.summary
      : null;

  return (
    <button
      type="button"
      onClick={() => navigate('/macro')}
      className="ds-transition-fast"
      style={{
        textAlign: 'left', width: '100%', cursor: 'pointer',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Sparkles size={14} style={{ color: 'var(--primary)' }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--primary)' }}>
          Deplyze Market Summary
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <RegimeStatusChip regime={regimeLabel} confidence={regime?.confidence ?? null} />
        <RiskLevelChip riskLevel={riskLevel} severity={risk?.severity} />
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--foreground)' }}>
        {summary
          ? stripMarkdown(summary)
          : 'Composite regime and risk-environment intelligence is recalculating. Cross-asset signals will appear here as the agents publish their latest reads.'}
      </p>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: 'var(--primary)' }}>
        Open Macro Regime Desk <ArrowUpRight size={12} />
      </span>
    </button>
  );
};

const HeroRailRow: React.FC<{ row: SnapshotRow; onOpen: () => void }> = ({ row: r, onOpen }) => {
  const { data: ohlcv } = useOHLCV(r.ok ? r.symbol : null, '1day', 30);
  const spark = (ohlcv?.bars ?? []).map((b) => b.close).filter((c) => Number.isFinite(c));
  const sparkColor = r.changePercent > 0 ? '#4E6040' : r.changePercent < 0 ? 'var(--primary)' : 'var(--muted-foreground)';

  return (
    <button
      type="button"
      disabled={!r.ok}
      onClick={r.ok ? onOpen : undefined}
      className="ds-transition-fast"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        width: '100%', padding: '6px 4px', background: 'transparent', border: 'none',
        borderBottom: '1px solid var(--border)', textAlign: 'left', cursor: r.ok ? 'pointer' : 'default',
      }}
      onMouseEnter={(e) => { if (r.ok) (e.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <Flag iso={symbolCountry(r.symbol)} width={16} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--foreground)' }}>{r.symbol}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {spark.length > 1 && <Sparkline values={spark} width={48} height={18} strokeWidth={1.1} color={sparkColor} />}
        <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)' }}>{r.ok ? fmtPrice(r.price) : '—'}</span>
        <ChangeCell changePercent={r.changePercent} ok={r.ok} />
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
      <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--foreground)' }}>
        Markets Now
      </div>
      <div>
        {loading && rows.length === 0
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 34, margin: '6px 0', borderRadius: 6, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />
            ))
          : rows.map((r) => <HeroRailRow key={r.symbol} row={r} onOpen={() => navigate(`/instruments/${encodeURIComponent(r.symbol)}`)} />)}
      </div>
    </div>
  );
};

const NEWS_TABS: { id: 'general' | 'forex' | 'crypto' | 'merger'; label: string }[] = [
  { id: 'general', label: 'Latest' },
  { id: 'forex',   label: 'Forex' },
  { id: 'crypto',  label: 'Crypto' },
  { id: 'merger',  label: 'M&A' },
];

const TabbedHeadlines: React.FC = () => {
  const [cat, setCat] = useState<'general' | 'forex' | 'crypto' | 'merger'>('general');
  const { data, loading } = useNews({ category: cat, limit: 6 });
  // For the default tab, skip the first item (it is the featured story on the left).
  const items = (data ?? []).slice(cat === 'general' ? 1 : 0, cat === 'general' ? 5 : 4);

  return (
    <div>
      <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {NEWS_TABS.map((t) => {
          const active = t.id === cat;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setCat(t.id)}
              style={{
                fontSize: 10.5, fontWeight: active ? 700 : 500, padding: '3px 9px', borderRadius: 999,
                border: 'none', cursor: 'pointer',
                background: active ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                color: active ? 'var(--primary)' : 'var(--muted-foreground)',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div>
        {loading && items.length === 0
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ height: 44, margin: '8px 0', borderRadius: 6, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />)
          : items.length === 0
          ? <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '10px 0' }}>No headlines in this category right now.</p>
          : items.map((item, index) => <NewsCard key={item.id || `${item.url}-${index}`} item={item} />)}
      </div>
    </div>
  );
};

export const HeroIntelligence: React.FC = () => {
  const { data: news, loading } = useNews({ category: 'general', limit: 7 });
  const items = news ?? [];
  const featured = items[0];

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

      {/* Center: AI summary + tabbed headlines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <FeaturedIntelligence />
        <TabbedHeadlines />
      </div>

      {/* Right: compact market rail */}
      <HeroRail />
    </div>
  );
};
