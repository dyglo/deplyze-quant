import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Camera, Loader2, Star, TrendingUp, Activity, FileText, Globe, Building2, Users, Calendar, ArrowUpRight, Shield, Award, Bell, ChevronDown, Info, TriangleAlert } from 'lucide-react';
import { useInstrumentIntelligence } from '../hooks/useInstrument';
import { useQuote, useOHLCV } from '../hooks/useMarket';
import { useArtifacts, useBriefings } from '../hooks/useArtifacts';
import { useCompositeRegime, useRiskEnvironment, useAgentOutputs } from '../hooks/useAgentIntelligence';
import { AssetIcon } from '../components/quant/AssetIcon';
import { FreshnessBadge, SourceBadge } from '../components/quant/FreshnessBadge';
import { Disclaimer } from '../components/quant/Disclaimer';
import { RegimeIntelligencePanel } from '../components/quant/RegimeIntelligencePanel';
import { InstrumentEarningsChart } from '../components/quant/InstrumentEarningsChart';
import { InstrumentTechnicalAnalysis } from '../components/quant/InstrumentTechnicalAnalysis';
import { InstrumentAnalystRatings } from '../components/quant/InstrumentAnalystRatings';
import { InstrumentAdvancedChart } from '../components/quant/InstrumentAdvancedChart';
import { InstrumentKeyStatistics } from '../components/quant/InstrumentKeyStatistics';
import { InstrumentLayeredNews } from '../components/quant/InstrumentLayeredNews';
import { InstrumentFinancialReport } from '../components/quant/InstrumentFinancialReport';
import { InstrumentIncomeStatement } from '../components/quant/InstrumentIncomeStatement';
import { InstrumentOwnership } from '../components/quant/InstrumentOwnership';
import { RegimeStatusChip, RiskLevelChip } from '../components/quant/SystemAnalyzingState';
import { Flag } from '../components/market-home/Flag';
import { ChangeCell } from '../components/market-home/ChangeCell';

import {
  subscribeToWatchlists,
  updateWatchlist,
  createWatchlist,
} from '../services/portfolioService';
import { fetchMarketMovers, type MarketMoverItem, type MoverType } from '../services/marketService';
import { fetchRelationsContext, type RelationsContextPayload } from '../services/v3p2Service';
import { closes, logReturns, annualisedVol, maxDrawdown, trendLabel } from '../lib/quant';
import { createInstrumentSnapshot } from '../services/artifactService';
import { useWorkspace } from '../components/WorkspaceContext';
import { useAuth } from '../components/AuthProvider';
import { useAuthGate } from '../components/auth/AuthGate';
import { useDocumentHead } from '../lib/seo';
import type { IntelligenceWatchlist } from '../lib/portfolio/schemas';
import { symbolCountry } from '../components/market-home/format';

// ─── Inline skeleton ─────────────────────────────────────────────────────────
const Sk: React.FC<{ h?: number | string; w?: number | string }> = ({ h = 14, w = '100%' }) => (
  <div className="ds-skeleton" style={{ height: h, width: w }} />
);

const InstrumentSkeleton: React.FC = () => (
  <div style={{ padding: '0 24px 48px', maxWidth: 1380, margin: '0 auto' }}>
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
    <div style={{ height: 52, borderRadius: 10, marginBottom: 14 }}><Sk h={52} /></div>
    <div style={{ height: 296, borderRadius: 10, marginBottom: 16 }}><Sk h={296} /></div>
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16, marginBottom: 16 }}>
      <Sk h={240} /><Sk h={240} />
    </div>
  </div>
);

export const InstrumentDetail: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const sym = symbol ? decodeURIComponent(symbol).toUpperCase() : null;

  useDocumentHead({
    title: sym ? `${sym} — Quote, Analysis & Intelligence` : 'Instrument Intelligence',
    description: sym
      ? `${sym} live quote, technicals, fundamentals, analyst ratings, regime fit, and AI-driven research intelligence.`
      : 'Institutional instrument intelligence — quotes, fundamentals, and regime-aware analysis.',
    canonicalPath: sym ? `/instruments/${encodeURIComponent(sym)}` : '/instruments',
    jsonLd: sym ? {
      '@context': 'https://schema.org',
      '@type': 'FinancialProduct',
      name: sym,
      category: 'Security',
      url: `https://app.deplyze.com/instruments/${encodeURIComponent(sym)}`,
    } : undefined,
  });

  const quote = useQuote(sym);
  const ohlcv = useOHLCV(sym, '1day', 90);
  const intel = useInstrumentIntelligence(sym);

  const { currentWorkspace, currentProject } = useWorkspace();
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();
  const artifacts = useArtifacts(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const briefings = useBriefings(currentWorkspace?.id ?? null, currentProject?.id ?? null);

  const [savingSnap, setSavingSnap] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [watchlists, setWatchlists] = useState<IntelligenceWatchlist[]>([]);
  const [newWlName, setNewWlName] = useState('');

  // 1. Fetch Relations Context
  const [relationsContext, setRelationsContext] = useState<RelationsContextPayload | null>(null);
  const [relationsLoading, setRelationsLoading] = useState(false);

  useEffect(() => {
    if (sym) {
      setRelationsLoading(true);
      fetchRelationsContext({ symbol: sym })
        .then(setRelationsContext)
        .catch(() => setRelationsContext(null))
        .finally(() => setRelationsLoading(false));
    }
  }, [sym]);

  // 2. Fetch Watchlists
  useEffect(() => {
    if (!user || !currentWorkspace) return;
    const unsub = subscribeToWatchlists(user.uid, currentWorkspace.id, (wl) => {
      setWatchlists(wl);
    });
    return unsub;
  }, [user, currentWorkspace]);

  // 3. Fetch Movers
  const [moverTab, setMoverTab] = useState<MoverType>('gainers');
  const [movers, setMovers] = useState<MarketMoverItem[]>([]);
  const [moversLoading, setMoversLoading] = useState(false);

  useEffect(() => {
    setMoversLoading(true);
    fetchMarketMovers(moverTab)
      .then(setMovers)
      .catch(() => setMovers([]))
      .finally(() => setMoversLoading(false));
  }, [moverTab]);

  // 4. Macro & Risk Chips
  const compositeRegime = useCompositeRegime();
  const riskEnvironment = useRiskEnvironment();

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

  // Watchlist handlers
  const handleAddToWatchlist = async (wl: IntelligenceWatchlist) => {
    if (!requireAuth({ title: 'Save to a watchlist', description: 'Create a free workspace to track instruments across your watchlists.' })) return;
    if (!sym) return;
    if (wl.symbols.includes(sym)) {
      toast.error(`Already in watchlist "${wl.name}"`);
      return;
    }
    try {
      await updateWatchlist(wl.id, { symbols: [...wl.symbols, sym] });
      toast.success(`Added ${sym} to watchlist "${wl.name}"`);
    } catch {
      toast.error('Failed to update watchlist');
    }
  };

  const handleRemoveFromWatchlist = async (wl: IntelligenceWatchlist) => {
    if (!requireAuth()) return;
    if (!sym) return;
    try {
      await updateWatchlist(wl.id, { symbols: wl.symbols.filter(s => s !== sym) });
      toast.success(`Removed ${sym} from watchlist "${wl.name}"`);
    } catch {
      toast.error('Failed to update watchlist');
    }
  };

  const handleCreateWatchlist = async () => {
    if (!requireAuth({ title: 'Create a watchlist', description: 'Create a free workspace to build and track watchlists.' })) return;
    if (!newWlName.trim() || !user || !currentWorkspace || !sym) return;
    try {
      await createWatchlist(user.uid, currentWorkspace.id, {
        name: newWlName.trim(),
        symbols: [sym],
      });
      toast.success(`Watchlist "${newWlName}" created with ${sym}`);
      setNewWlName('');
    } catch {
      toast.error('Failed to create watchlist');
    }
  };

  const handleSaveSnapshot = async () => {
    if (!requireAuth({ title: 'Save a research snapshot', description: 'Create a free workspace to save snapshots to your research timeline.' })) return;
    if (!sym || !q || !analytics || !currentWorkspace?.id || !currentProject?.id || !user) return;
    setSavingSnap(true);
    try {
      await createInstrumentSnapshot(currentWorkspace.id, currentProject.id, sym, q, analytics, intel.data?.narrative ?? '', user.uid);
      toast.success('Snapshot saved to Research Timeline');
    } catch { toast.error('Failed to save snapshot'); }
    finally { setSavingSnap(false); }
  };

  const handleScrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const [activeTab, setActiveTab] = useState<string>('General');
  const mainTabs = ['General', 'Chart', 'News & Analysis', 'Financials', 'Technical', 'Forum'] as const;
  const subTabs = ['Overview', 'Profile', 'Ownership', 'Historical Data', 'Historical Splits', 'Options'] as const;

  const [clock, setClock] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-poll quote every 10s; flash price green/red on change
  const prevPriceRef = useRef<number | null>(null);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    const id = setInterval(() => { quote.refresh(); }, 10_000);
    return () => clearInterval(id);
  }, [quote.refresh]);
  useEffect(() => {
    const p = quote.data?.price ?? null;
    if (p == null) return;
    if (prevPriceRef.current != null && p !== prevPriceRef.current) {
      const dir = p > prevPriceRef.current ? 'up' : 'down';
      setPriceFlash(dir);
      const t = setTimeout(() => setPriceFlash(null), 800);
      prevPriceRef.current = p;
      return () => clearTimeout(t);
    }
    prevPriceRef.current = p;
  }, [quote.data?.price]);

  if (!sym) return null;
  if (quote.loading && !quote.data) return <InstrumentSkeleton />;

  const q = quote.data;
  const dp = q?.changePercent;
  const profile = intel.data?.profile ?? null;
  const fundamentals = intel.data?.fundamentals ?? null;
  const earnings = intel.data?.earnings ?? [];
  const earningsDates = earnings.map(e => e.date);

  const profileName = profile?.name;
const dpColor = dp == null ? 'var(--foreground)' : dp > 0 ? 'var(--ds-gain)' : dp < 0 ? 'var(--ds-loss)' : 'var(--foreground)';

  // 52W range calculation
  const rangeLow = fundamentals?.week52Low ?? ((q?.previousClose ?? 100) * 0.8);
  const rangeHigh = fundamentals?.week52High ?? ((q?.previousClose ?? 100) * 1.2);
  const currentVal = q?.price ?? q?.previousClose ?? 100;
  const rangePct = rangeHigh > rangeLow ? Math.min(100, Math.max(0, ((currentVal - rangeLow) / (rangeHigh - rangeLow)) * 100)) : 50;

  // Day's range calculation
  const dayLow = q?.low ?? (q?.price ? q.price * 0.99 : null);
  const dayHigh = q?.high ?? (q?.price ? q.price * 1.01 : null);
  const dayRangePct = dayLow != null && dayHigh != null && dayHigh > dayLow && q?.price != null
    ? Math.min(100, Math.max(0, ((q.price - dayLow) / (dayHigh - dayLow)) * 100))
    : 50;

  return (
    <div style={{ padding: '0 24px 72px', maxWidth: 1400, margin: '0 auto', background: 'var(--background)' }}>

      {/* ── 1. INSTRUMENT HERO ─────────────────────────────────────────── */}
      <div style={{ padding: '18px 0 0' }}>

        {/* Top row: logo + name | bell + Add to Watchlist */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, gap: 12 }}>
          {/* Left: icon + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <AssetIcon symbol={sym} size={32} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, lineHeight: 1.25, color: 'var(--foreground)' }}>
                  {profileName ? `${profileName} (${sym})` : sym}
                </h1>
                <Info size={14} style={{ color: 'var(--muted-foreground)', flexShrink: 0, cursor: 'pointer' }} />
              </div>
            </div>
          </div>

          {/* Right: bell + Add to Watchlist */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              disabled={savingSnap || !q}
              onClick={handleSaveSnapshot}
              style={{
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border)', borderRadius: 6, background: 'var(--background)',
                cursor: 'pointer', color: 'var(--muted-foreground)',
              }}
              title="Save Snapshot"
            >
              {savingSnap ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />}
            </button>
            <button
              onClick={() => setWatchlistOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 6, border: 'none',
                background: 'var(--primary)', color: '#fff',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Star size={13} style={{ fill: watchlists.some(w => w.symbols.includes(sym)) ? '#fff' : 'none' }} />
              Add to Watchlist
            </button>
          </div>
        </div>

        {/* Sub-row: exchange + currency + pro research */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          {profile?.exchange && (
            <button style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px',
              border: '1px solid var(--border)', borderRadius: 4, background: 'transparent',
              fontSize: 11.5, fontWeight: 600, color: 'var(--foreground)', cursor: 'pointer',
            }}>
              <Flag iso={symbolCountry(sym)} width={14} />
              {profile.exchange}
              <ChevronDown size={10} style={{ color: 'var(--muted-foreground)' }} />
            </button>
          )}
          <span style={{ fontSize: 11.5, color: 'var(--muted-foreground)' }}>
            Currency in <strong style={{ color: 'var(--foreground)' }}>USD</strong>
          </span>
          <Link
            to={`/copilot?symbol=${sym}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 10px', border: '1px solid var(--primary)', borderRadius: 4,
              fontSize: 11.5, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none',
            }}
          >
            <ArrowUpRight size={11} />
            {sym} Pro Research
          </Link>
        </div>

        {/* Price row + right rail */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
          {/* Price block */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span
                className={priceFlash === 'up' ? 'price-flash-up' : priceFlash === 'down' ? 'price-flash-down' : undefined}
                style={{ fontSize: 36, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, color: 'var(--foreground)' }}
              >
                {q?.price != null ? q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—'}
              </span>
              {q?.price != null && dp != null && (
                <span style={{ fontSize: 17, fontWeight: 700, color: dpColor, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {`${dp > 0 ? '+' : ''}${(q.price - (q.previousClose ?? q.price)).toFixed(2)} (${dp > 0 ? '+' : ''}${dp.toFixed(2)}%)`}
                  {dp < 0
                    ? <svg width="10" height="10" viewBox="0 0 10 10" fill={dpColor}><path d="M5 9 L0 1 L10 1 Z" /></svg>
                    : <svg width="10" height="10" viewBox="0 0 10 10" fill={dpColor}><path d="M5 1 L10 9 L0 9 Z" /></svg>
                  }
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--ds-gain)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ds-gain)' }} />
              </div>
              <span style={{ fontSize: 11.5, color: 'var(--muted-foreground)' }}>
                Real-time Data · {clock}
              </span>
            </div>
          </div>

          {/* Right rail: Fair Value, Day's Range, 52wk Range */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 220 }}>
            {/* Fair Value */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--foreground)' }}>Fair Value</span>
                <Info size={11} style={{ color: 'var(--muted-foreground)' }} />
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}>Unlock Value</span>
              </div>
              <div style={{ position: 'relative', height: 5, borderRadius: 3, background: 'linear-gradient(to right, var(--ds-loss), #B85C2A, #C9A227, var(--ds-gain))', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: `${rangePct}%`, top: 0, bottom: 0, width: 2, background: 'var(--foreground)', transform: 'translateX(-50%)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  🔒 <span style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}>Unlock Value</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>P</span>
                </span>
              </div>
            </div>

            {/* Day's Range */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 600 }}>Day's Range</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', minWidth: 48 }}>{dayLow?.toFixed(2) ?? '—'}</span>
                <div style={{ flex: 1, position: 'relative', height: 4, background: 'var(--border)', borderRadius: 2 }}>
                  <div style={{ position: 'absolute', left: `${dayRangePct}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 8, height: 8, borderRadius: '50%', background: 'var(--foreground)', border: '2px solid var(--background)' }} />
                </div>
                <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', minWidth: 48, textAlign: 'right' }}>{dayHigh?.toFixed(2) ?? '—'}</span>
              </div>
            </div>

            {/* 52wk Range */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 600 }}>52 wk Range</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', minWidth: 48 }}>{rangeLow.toFixed(2)}</span>
                <div style={{ flex: 1, position: 'relative', height: 4, background: 'var(--border)', borderRadius: 2 }}>
                  <div style={{ position: 'absolute', left: `${rangePct}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 8, height: 8, borderRadius: '50%', background: 'var(--foreground)', border: '2px solid var(--background)' }} />
                </div>
                <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', minWidth: 48, textAlign: 'right' }}>{rangeHigh.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI strategies banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px', marginBottom: 0,
          border: '1px solid #B85C2A', borderRadius: 6, background: 'rgba(184,92,42,0.04)',
        }}>
          <TriangleAlert size={15} style={{ color: '#B85C2A', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--foreground)' }}>
            <strong>{sym}</strong> is not included in our{' '}
            <span style={{ color: '#B85C2A', fontWeight: 600, cursor: 'pointer' }}>AI-picked strategies</span>.
            {' '}See which stocks are.
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Review Strategies
          </span>
        </div>
      </div>

      {/* ── MAIN TABS ─────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid var(--border)', marginTop: 16, marginBottom: 0 }}>
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {mainTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); handleScrollTo(tab.toLowerCase().replace(/\s+&\s+/g, '-').replace(/\s+/g, '-')); }}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: activeTab === tab ? '3px solid var(--primary)' : '3px solid transparent',
                padding: '10px 16px 9px',
                fontSize: 13, fontWeight: activeTab === tab ? 700 : 500,
                color: activeTab === tab ? 'var(--primary)' : 'var(--muted-foreground)',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (activeTab !== tab) e.currentTarget.style.color = 'var(--foreground)'; }}
              onMouseLeave={e => { if (activeTab !== tab) e.currentTarget.style.color = 'var(--muted-foreground)'; }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ── SUB TABS ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {subTabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => handleScrollTo(tab.toLowerCase().replace(/\s+/g, '-'))}
            style={{
              background: 'transparent', border: 'none',
              borderBottom: i === 0 ? '2px solid var(--primary)' : '2px solid transparent',
              padding: '7px 14px 6px',
              fontSize: 12, fontWeight: i === 0 ? 600 : 400,
              color: i === 0 ? 'var(--primary)' : 'var(--muted-foreground)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── 2. ADVANCED CHART AREA ─────────────────────────────────────── */}
      <div id="chart">
        <InstrumentAdvancedChart symbol={sym} earningsDates={earningsDates} />
      </div>

      {/* ── 3. KEY STATISTICS ──────────────────────────────────────────── */}
      <div id="overview">
        <InstrumentKeyStatistics symbol={sym} quote={q} />
      </div>

      {/* ── 4. KEY INTELLIGENCE GRID ───────────────────────────────────── */}
      <div id="intelligence" style={{ marginBottom: 28 }}>
        <div style={{ paddingBottom: 6, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Quant Intelligence Grid</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }} className="inst-overview-grid">
          {/* Volatility state */}
          <div className="ds-panel" style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Shield size={14} style={{ color: 'var(--primary)' }} />
              <span className="ds-label">Volatility State</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {analytics?.vol ? `${analytics.vol.toFixed(1)}%` : '—'}
            </div>
            <p className="ds-caption" style={{ marginTop: 6, lineHeight: 1.4 }}>
              Rolling annualised realised volatility. Current regime state aligns within standard limits.
            </p>
          </div>

          {/* Macro sensitivity */}
          <div className="ds-panel" style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Activity size={14} style={{ color: 'var(--primary)' }} />
              <span className="ds-label">Macro Sensitivity</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {relationsContext?.macroRegimes?.[0]?.label ?? 'Stable'}
            </div>
            <p className="ds-caption" style={{ marginTop: 6, lineHeight: 1.4 }}>
              Sensitivity to liquidity environments and inflation rates based on pricing correlations.
            </p>
          </div>

          {/* Narrative Exposure */}
          <div className="ds-panel" style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Award size={14} style={{ color: 'var(--primary)' }} />
              <span className="ds-label">Narrative Exposure</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {relationsContext?.narratives?.[0]?.themeLabel ?? 'Moderate'}
            </div>
            <p className="ds-caption" style={{ marginTop: 6, lineHeight: 1.4 }}>
              Asset pricing aligned with prominent market themes and AI agent observatories.
            </p>
          </div>
        </div>
      </div>

      {/* ── 5. TECHNICAL ANALYSIS ──────────────────────────────────────── */}
      <div id="technicals">
        <InstrumentTechnicalAnalysis symbol={sym} />
      </div>

      {/* ── 6. ANALYST RATINGS ─────────────────────────────────────────── */}
      <div id="ratings">
        <InstrumentAnalystRatings symbol={sym} currentPrice={q?.price} />
      </div>

      {/* ── 7. EARNINGS ────────────────────────────────────────────────── */}
      <div id="earnings">
        <InstrumentEarningsChart symbol={sym} />
      </div>

      {/* ── 8. INCOME STATEMENT ────────────────────────────────────────── */}
      <div id="income-statement">
        <InstrumentIncomeStatement symbol={sym} />
      </div>

      {/* ── 9. OWNERSHIP ───────────────────────────────────────────────── */}
      <div id="ownership">
        <InstrumentOwnership symbol={sym} />
      </div>

      {/* ── 10. FINANCIAL STATEMENTS ───────────────────────────────────── */}
      <div id="financials">
        <InstrumentFinancialReport symbol={sym} />
      </div>

      {/* ── 11. NEWS + RESEARCH INTELLIGENCE ──────────────────────────── */}
      <div id="news">
        <InstrumentLayeredNews
          symbol={sym}
          artifacts={artifacts.items}
          briefings={briefings.items}
          relationsContext={relationsContext}
          onOpenArtifact={(id) => {
            const art = artifacts.items.find(a => a.id === id);
            if (art) toast.info(`Viewing artifact "${art.title}"`);
          }}
        />
      </div>

      {/* ── 11. REGIME INTELLIGENCE ────────────────────────────────────── */}
      <div id="peers" style={{ marginBottom: 28 }}>
        <RegimeIntelligencePanel symbol={sym} flat />
      </div>

      <Disclaimer />

      {/* Floating toolbar removed — actions live in the hero row */}

      {/* WATCHLISTS POPUP MODAL */}
      {watchlistOpen && (
        <div className="ds-modal-backdrop" onClick={() => setWatchlistOpen(false)}>
          <div className="ds-modal-container" onClick={e => e.stopPropagation()}>
            <div className="ds-modal-header">
              <h3 className="ds-modal-title">Manage Watchlists</h3>
              <button className="ds-modal-close" onClick={() => setWatchlistOpen(false)}>✕</button>
            </div>
            <div className="ds-modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {watchlists.length === 0 ? (
                  <p className="ds-caption" style={{ textAlign: 'center', padding: '12px 0' }}>No watchlists found. Create one below.</p>
                ) : (
                  watchlists.map(wl => {
                    const hasSym = wl.symbols.includes(sym);
                    return (
                      <div key={wl.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--secondary)', borderRadius: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{wl.name}</span>
                        <button
                          onClick={() => hasSym ? handleRemoveFromWatchlist(wl) : handleAddToWatchlist(wl)}
                          className={hasSym ? "ds-btn-outline" : "ds-btn-primary"}
                          style={{ height: 24, fontSize: 10.5, padding: '0 10px', borderRadius: 4 }}
                        >
                          {hasSym ? 'Remove' : 'Add'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Create new watchlist */}
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <div className="ds-form-group">
                  <label className="ds-form-label">Create Watchlist & Add {sym}</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <input
                      type="text"
                      placeholder="Watchlist name…"
                      className="ds-input"
                      value={newWlName}
                      onChange={e => setNewWlName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateWatchlist(); }}
                    />
                    <button onClick={handleCreateWatchlist} className="ds-btn-primary" style={{ padding: '0 12px', borderRadius: 6, height: 36 }}>
                      Create
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default InstrumentDetail;
