/**
 * InstrumentDetail — institutional research workspace for a single asset.
 *
 * Layout (top to bottom):
 *   1. Price hero header (company name + live price + change)
 *   2. Compact stats strip (Open/High/Low/Prev/Vol/P-E/52W/Beta/Ann Vol/60d Ret)
 *   3. Full-width price chart with 1W–2Y timeframe selector
 *   4. Overview row: Company profile (left) | Key metrics (right)
 *   5. AI Analysis (full-width)
 *   6. EPS history bar chart (full-width)
 *   7. Market Regime intelligence (full-width)
 *   8. Benchmark intelligence (full-width)
 *   9. Recent headlines (full-width)
 *  10. Related workspace intelligence
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Camera, Loader2 } from 'lucide-react';
import { useInstrumentIntelligence } from '../hooks/useInstrument';
import { useQuote, useOHLCV, useNews } from '../hooks/useMarket';
import { useArtifacts, useBriefings } from '../hooks/useArtifacts';
import { AssetIcon } from '../components/quant/AssetIcon';
import { FreshnessBadge, SourceBadge } from '../components/quant/FreshnessBadge';
import { Disclaimer } from '../components/quant/Disclaimer';
import { NewsList } from '../components/quant/NewsList';
import { RelatedIntelligencePanel } from '../components/quant/RelatedIntelligencePanel';
import { BenchmarkIntelligencePanel } from '../components/quant/BenchmarkIntelligencePanel';
import { RegimeIntelligencePanel } from '../components/quant/RegimeIntelligencePanel';
import { InstrumentStatsStrip } from '../components/quant/InstrumentStatsStrip';
import { InstrumentOHLCVSection } from '../components/quant/InstrumentOHLCVSection';
import { InstrumentOverviewPanel } from '../components/quant/InstrumentOverviewPanel';
import { InstrumentEarningsChart } from '../components/quant/InstrumentEarningsChart';
import { ArtifactDetailDrawerBody } from '../components/quant/ArtifactDetailDrawerBody';
import { useDrawer } from '../components/quant/DataDrawer';
import { closes, logReturns, annualisedVol, maxDrawdown, trendLabel } from '../lib/quant';
import { createInstrumentSnapshot } from '../services/artifactService';
import type { FreshnessStatus } from '../services/gatewayClient';
import { useWorkspace } from '../components/WorkspaceContext';
import { useAuth } from '../components/AuthProvider';

// ─── Section divider ──────────────────────────────────────────────────────────

const SectionDivider: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 12px' }}>
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{title}</span>
    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
  </div>
);

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const Sk: React.FC<{ h?: number | string; w?: number | string }> = ({ h = 14, w = '100%' }) => (
  <div className="ds-skeleton" style={{ height: h, width: w }} />
);

const InstrumentSkeleton: React.FC = () => (
  <div style={{ padding: '0 24px 48px', maxWidth: 1380, margin: '0 auto' }}>
    {/* Hero placeholder */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Sk h={36} w={36} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Sk h={22} w={200} />
          <Sk h={12} w={140} />
        </div>
      </div>
      <Sk h={40} w={220} />
    </div>
    {/* Stats strip */}
    <div style={{ height: 52, borderRadius: 10, marginBottom: 14 }}><Sk h={52} /></div>
    {/* Chart */}
    <div style={{ height: 296, borderRadius: 10, marginBottom: 16 }}><Sk h={296} /></div>
    {/* Overview grid */}
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16, marginBottom: 16 }}>
      <Sk h={240} />
      <Sk h={240} />
    </div>
  </div>
);

// ─── AI Analysis ─────────────────────────────────────────────────────────────

const AIAnalysis: React.FC<{
  loading: boolean; error: Error | null;
  narrative: string | null | undefined;
  status: FreshnessStatus; fetchedAt: number | null;
  onRetry: () => void;
}> = ({ loading, error, narrative, status, fetchedAt, onRetry }) => (
  <section className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 className="ds-heading" style={{ margin: 0 }}>AI Analysis</h2>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, background: 'rgba(193,95,60,0.08)', color: 'var(--primary)' }}>Gemini</span>
      </div>
      <FreshnessBadge status={status} fetchedAt={fetchedAt} compact />
    </div>
    {loading ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)' }}>
        <Loader2 size={13} className="animate-spin" />
        <span style={{ fontSize: 12 }}>Synthesising intelligence — pulling fundamentals, news, generating analysis…</span>
      </div>
    ) : error ? (
      <p style={{ color: 'var(--primary)', margin: 0, fontSize: 12 }}>
        {error.message}{' '}
        <button onClick={onRetry} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>Retry</button>
      </p>
    ) : narrative ? (
      <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, margin: 0, fontSize: 13, color: 'var(--foreground)' }}>{narrative}</p>
    ) : (
      <p style={{ color: 'var(--muted-foreground)', margin: 0, fontSize: 12 }}>No analysis available.</p>
    )}
  </section>
);

// ─── Main page ─────────────────────────────────────────────────────────────────

export const InstrumentDetail: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const sym = symbol ? decodeURIComponent(symbol) : null;

  const quote  = useQuote(sym);
  const ohlcv  = useOHLCV(sym, '1day', 90);   // for analytics only
  const news   = useNews(sym ? { symbol: sym, limit: 10 } : {});
  const intel  = useInstrumentIntelligence(sym);

  const { currentWorkspace, currentProject } = useWorkspace();
  const { user } = useAuth();
  const artifacts = useArtifacts(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const briefings = useBriefings(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const drawer = useDrawer();

  const [savingSnap, setSavingSnap] = useState(false);

  // Derived analytics from 90-day bars
  const bars = ohlcv.data?.bars ?? [];
  const cs = useMemo(() => closes(bars), [bars]);
  const analytics = useMemo(() => {
    if (cs.length < 20) return null;
    const lr = logReturns(cs);
    const vol = annualisedVol(lr) * 100;
    const last60 = cs.slice(-60);
    const ret60 = last60.length > 1 ? (last60[last60.length - 1] / last60[0] - 1) * 100 : 0;
    let eq = 1; const curve = [eq];
    for (const r of lr) { eq *= Math.exp(r); curve.push(eq); }
    const { mdd } = maxDrawdown(curve);
    const t = trendLabel(cs);
    return { vol, ret60, mdd: mdd * 100, trend: t };
  }, [cs]);

  const handleSaveSnapshot = async () => {
    if (!sym || !q || !analytics || !currentWorkspace?.id || !currentProject?.id || !user) return;
    setSavingSnap(true);
    try {
      await createInstrumentSnapshot(currentWorkspace.id, currentProject.id, sym, q, analytics, intel.data?.narrative ?? '', user.uid);
      toast.success('Snapshot saved to Research Timeline');
    } catch { toast.error('Failed to save snapshot'); }
    finally { setSavingSnap(false); }
  };

  const handleOpenArtifact = useCallback((artifactId: string) => {
    const artifact = artifacts.items.find(a => a.id === artifactId);
    if (!artifact) return;
    drawer.open({
      title: artifact.title, subtitle: artifact.category, width: 560,
      body: <ArtifactDetailDrawerBody artifact={artifact} relatedArtifacts={artifacts.items} onOpenArtifact={handleOpenArtifact} />,
    });
  }, [artifacts.items, drawer]);

  if (!sym) return null;
  if (quote.loading && !quote.data) return <InstrumentSkeleton />;

  const q = quote.data;
  const dp = q?.changePercent;
  const profile = intel.data?.profile ?? null;
  const fundamentals = intel.data?.fundamentals ?? null;
  const earnings = intel.data?.earnings ?? [];

  const profileName = profile?.name;
  const effectiveIndustry = profile?.industry ?? profile?.finnhubIndustry;
  const dpColor = dp == null ? 'var(--foreground)' : dp > 0 ? 'var(--ds-gain)' : dp < 0 ? 'var(--ds-loss)' : 'var(--foreground)';

  return (
    <div style={{ padding: '0 24px 48px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── 1. PRICE HERO HEADER ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 0 12px', gap: 16, flexWrap: 'wrap' }}>

        {/* Left: logo + name + tags */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <AssetIcon symbol={sym} size={36} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>{profileName ?? sym}</h1>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted-foreground)' }}>{sym}</span>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
              {profile?.exchange && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: 'var(--muted)', color: 'var(--muted-foreground)', letterSpacing: 0.4, textTransform: 'uppercase' }}>{profile.exchange}</span>}
              {profile?.sector && <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: 'rgba(193,95,60,0.08)', color: 'var(--primary)' }}>{profile.sector}</span>}
              {effectiveIndustry && profile?.sector !== effectiveIndustry && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{effectiveIndustry}</span>}
              {profile?.country && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{profile.country}</span>}
            </div>
          </div>
        </div>

        {/* Centre: live price block */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 32, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 }}>
            {q?.price != null ? q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—'}
          </span>
          {q?.price != null && q?.previousClose != null && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: dpColor }}>
                {dp != null ? `${dp > 0 ? '+' : ''}${(q.price - q.previousClose).toFixed(2)}` : ''}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: dpColor }}>
                {dp != null ? `(${dp > 0 ? '+' : ''}${dp.toFixed(2)}%)` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {q?.source && <SourceBadge source={q.source} />}
          <FreshnessBadge status={quote.status} fetchedAt={quote.fetchedAt} compact />
          <button disabled={savingSnap || !q} onClick={handleSaveSnapshot} className="ds-btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            {savingSnap ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
            Save Snapshot
          </button>
          <Link to="/" style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, textDecoration: 'none', color: 'var(--muted-foreground)', fontSize: 12 }}>
            ← Market Home
          </Link>
        </div>
      </div>

      {/* ── 2. COMPACT STATS STRIP ───────────────────────────────────── */}
      <InstrumentStatsStrip
        quote={q}
        fundamentals={fundamentals}
        analytics={analytics}
        loading={quote.loading}
      />

      {/* ── 3. FULL-WIDTH CHART ──────────────────────────────────────── */}
      <InstrumentOHLCVSection symbol={sym} />

      {/* ── 4. OVERVIEW ROW: Company profile | Key metrics ──────────── */}
      <InstrumentOverviewPanel
        symbol={sym}
        profile={profile}
        fundamentals={fundamentals}
        currentPrice={q?.price}
      />

      {/* ── 5. AI ANALYSIS ──────────────────────────────────────────── */}
      <SectionDivider title="AI Analysis" />
      <AIAnalysis
        loading={intel.loading}
        error={intel.error}
        narrative={intel.data?.narrative}
        status={intel.status}
        fetchedAt={intel.fetchedAt}
        onRetry={() => intel.refresh()}
      />

      {/* ── 6. EPS HISTORY ──────────────────────────────────────────── */}
      {earnings.length > 0 && (
        <>
          <SectionDivider title="Earnings History" />
          <InstrumentEarningsChart earnings={earnings} />
        </>
      )}

      {/* ── 7. MARKET REGIME ────────────────────────────────────────── */}
      <SectionDivider title="Market Regime" />
      <RegimeIntelligencePanel symbol={sym} />

      {/* ── 8. BENCHMARK INTELLIGENCE ───────────────────────────────── */}
      <SectionDivider title="Benchmark Intelligence" />
      <BenchmarkIntelligencePanel symbol={sym} />

      {/* ── 9. RECENT HEADLINES ─────────────────────────────────────── */}
      <SectionDivider title="Recent Headlines" />
      <section>
        {news.loading && !news.data ? (
          <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: 0 }}>Loading news…</p>
        ) : news.data?.length ? (
          <NewsList items={news.data.map((n) => ({ id: n.id, headline: n.headline, summary: n.summary, url: n.url, source: n.source, publishedAt: n.publishedAt }))} max={10} />
        ) : (
          <p style={{ color: 'var(--muted-foreground)', fontSize: 12, margin: 0 }}>No recent headlines.</p>
        )}
      </section>

      {/* ── 10. RELATED WORKSPACE INTELLIGENCE ──────────────────────── */}
      <RelatedIntelligencePanel
        symbols={sym ? [sym] : []}
        artifacts={artifacts.items}
        briefings={briefings.items}
        onOpenArtifact={handleOpenArtifact}
        maxItems={4}
      />

      <Disclaimer />
    </div>
  );
};
