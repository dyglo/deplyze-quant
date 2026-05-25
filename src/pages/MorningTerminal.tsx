/**
 * MorningTerminal — V5 Phase 2 personalized institutional homepage.
 *
 * Six sections rendered in order:
 *   A. RegimeBanner          — always shown
 *   B. PortfolioPulse        — if portfolio data available
 *   C. WatchlistOvernight    — if watchlist movers exist
 *   D. RankedFeed            — always shown (max 8 items)
 *   E. ResearchQueue         — if active investigations exist
 *   F. CopilotEntry          — always shown last
 *
 * Cold state: no portfolio/watchlist → shows global brief +
 * "Add holdings" prompt between RegimeBanner and RankedFeed.
 *
 * Design constraints: no emojis, no buy/sell language, no hype.
 * Every element must be explainable. Sections either show data or are omitted.
 */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, ExternalLink, AlertTriangle, BookOpen, MessageSquare } from 'lucide-react';

import { useStructuredBriefing } from '../hooks/usePersonalization';
import type { StructuredBriefing } from '../services/personalizationService';
import { logPageView, logEvent } from '../lib/telemetry';

const PAGE_PLACEMENT = 'MorningTerminal';

// ─── Shell ────────────────────────────────────────────────────────────────────

export const MorningRoutines: React.FC = () => {
  const briefing = useStructuredBriefing();

  useEffect(() => {
    logPageView(PAGE_PLACEMENT, { surface: 'morning_terminal' });
  }, []);

  useEffect(() => {
    if (briefing.data?.briefing_id) {
      logEvent({
        event_type: 'briefing_open',
        event_category: 'briefing',
        placement: PAGE_PLACEMENT,
        entity_id: briefing.data.briefing_id,
      });
    }
  }, [briefing.data?.briefing_id]);

  if (briefing.loading) return <Shell><LoadingState /></Shell>;
  if (briefing.error)  return <Shell><ErrorState message={briefing.error.message} onRetry={briefing.refetch} /></Shell>;
  if (!briefing.data)  return <Shell><DisabledState /></Shell>;

  const d = briefing.data;
  const isCold = !d.is_personalized;

  return (
    <Shell>
      <PageHeader briefing={d} />

      {/* A — Regime Banner */}
      <RegimeBanner regime={d.regime} />

      {/* Cold state prompt sits between regime and feed */}
      {isCold && <ColdStatePrompt />}

      {/* B — Portfolio Pulse */}
      {d.portfolio_pulse && <PortfolioPulse pulse={d.portfolio_pulse} />}

      {/* C — Watchlist Overnight */}
      {d.watchlist_overnight?.movers?.length ? (
        <WatchlistOvernight overnight={d.watchlist_overnight} />
      ) : null}

      {/* D — Ranked Feed */}
      <RankedFeed items={d.ranked_feed} isCold={isCold} />

      {/* E — Research Queue */}
      {d.research_queue?.length ? (
        <ResearchQueue queue={d.research_queue} />
      ) : null}

      {/* F — Copilot Entry */}
      <CopilotEntry />

      <PageFooter briefing={d} />
    </Shell>
  );
};

// ─── Page chrome ─────────────────────────────────────────────────────────────

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={s.shell}>
    <div style={s.content}>{children}</div>
  </div>
);

const PageHeader: React.FC<{ briefing: StructuredBriefing }> = ({ briefing }) => {
  const updated = briefing.materialized_at ?? briefing.generated_at;
  return (
    <header style={s.pageHeader}>
      <div>
        <p style={s.eyebrow}>Personalized institutional briefing</p>
        <h1 style={s.pageTitle}>Morning Routines</h1>
      </div>
      <div style={s.headerPills}>
        {briefing.ranker_version && <Pill label={`Ranker · ${briefing.ranker_version}`} />}
        {updated && <Pill label={`Updated · ${new Date(updated).toLocaleTimeString()}`} />}
        {briefing.cache_hit && <Pill label="cached" />}
      </div>
    </header>
  );
};

const PageFooter: React.FC<{ briefing: StructuredBriefing }> = ({ briefing }) => (
  <footer style={s.footer}>
    <span>
      Candidate pool: {briefing.candidate_set_size ?? '—'} · lineage {briefing.lineage_id ?? '—'}
    </span>
    <span style={s.footerNote}>
      Briefing personalises research relevance. It does not recommend trades or allocations.
    </span>
  </footer>
);

// ─── A — Regime Banner ────────────────────────────────────────────────────────

const RegimeBanner: React.FC<{ regime: StructuredBriefing['regime'] }> = ({ regime }) => {
  const urgent = regime?.shifted_recently;
  return (
    <section style={{ ...s.card, ...s.regimeBanner, ...(urgent ? s.regimeBannerUrgent : {}) }}>
      <div style={s.regimeBannerTop}>
        <div style={s.regimeMeta}>
          <span style={s.regimeLabel}>{regime?.label ?? 'Macro Regime'}</span>
          {typeof regime?.episode_day === 'number' && (
            <span style={s.regimeEpisode}>Day {regime.episode_day} of episode</span>
          )}
        </div>
        <div style={s.regimeConfidence}>
          <span style={s.confLabel}>τ</span>
          <span style={s.confValue}>{((regime?.confidence ?? 0) * 100).toFixed(0)}%</span>
        </div>
      </div>
      {regime?.summary && <p style={s.regimeSummary}>{regime.summary}</p>}
      {regime?.historical_analog && (
        <p style={s.regimeAnalog}>Historical analog: {regime.historical_analog}</p>
      )}
      <a href="/macro" style={s.cardLink}>
        explore regime <ExternalLink size={11} style={{ verticalAlign: 'middle' }} />
      </a>
    </section>
  );
};

// ─── Cold state prompt ────────────────────────────────────────────────────────

const ColdStatePrompt: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div style={s.coldPrompt}>
      <p style={s.coldText}>
        You're seeing the global morning brief. Add your holdings and Deplyze tracks
        what changed overnight for <em>your</em> positions.
      </p>
      <div style={s.coldActions}>
        <button style={s.coldBtn} onClick={() => navigate('/portfolio/overview')}>
          + Add holdings
        </button>
        <button style={s.coldBtnSecondary} onClick={() => navigate('/portfolio/holdings')}>
          + Add watchlist
        </button>
      </div>
    </div>
  );
};

// ─── B — Portfolio Pulse ──────────────────────────────────────────────────────

const PortfolioPulse: React.FC<{ pulse: NonNullable<StructuredBriefing['portfolio_pulse']> }> = ({ pulse }) => {
  const pnlPos = pulse.pnl_delta_pct >= 0;
  const pnlPct = `${pnlPos ? '+' : ''}${(pulse.pnl_delta_pct * 100).toFixed(2)}%`;
  return (
    <section style={s.card}>
      <SectionHeader icon={<TrendingUp size={14} />} title="Portfolio Pulse" />
      <div style={s.pulseRow}>
        <div style={s.pulseKpi}>
          <span style={s.kpiLabel}>Overnight P&amp;L</span>
          <span style={{ ...s.kpiValue, color: pnlPos ? 'var(--primary)' : '#dc3c3c' }}>
            {pnlPos ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            &nbsp;{pnlPct}
          </span>
        </div>
        <div style={s.pulseKpi}>
          <span style={s.kpiLabel}>Regime compatibility</span>
          <CompatBar score={pulse.regime_compatibility} />
        </div>
        {pulse.flag_count > 0 && (
          <div style={s.pulseKpi}>
            <span style={s.kpiLabel}>Flags today</span>
            <span style={{ ...s.kpiValue, color: pulse.flag_count > 2 ? '#dc3c3c' : '#c98b1f' }}>
              <AlertTriangle size={13} /> {pulse.flag_count}
            </span>
          </div>
        )}
      </div>
      {pulse.flags.length > 0 && (
        <ul style={s.flagList}>
          {pulse.flags.map((f, i) => (
            <li key={i} style={s.flagItem}>
              {f.symbol && <span style={s.symbolChip}>{f.symbol}</span>}
              <span style={{ ...s.severityDot, background: severityColor(f.severity) }} />
              <span style={s.flagReason}>{f.reason}</span>
            </li>
          ))}
        </ul>
      )}
      <a href="/portfolio/overview" style={s.cardLink}>
        view portfolio <ExternalLink size={11} style={{ verticalAlign: 'middle' }} />
      </a>
    </section>
  );
};

const CompatBar: React.FC<{ score: number }> = ({ score }) => {
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 70 ? 'var(--primary)' : pct >= 40 ? '#c98b1f' : '#dc3c3c';
  return (
    <div style={s.compatRow}>
      <div style={s.compatTrack}>
        <div style={{ ...s.compatFill, width: `${pct}%`, background: color }} />
      </div>
      <span style={{ ...s.kpiValue, color }}>{pct}</span>
    </div>
  );
};

// ─── C — Watchlist Overnight ──────────────────────────────────────────────────

const WatchlistOvernight: React.FC<{ overnight: NonNullable<StructuredBriefing['watchlist_overnight']> }> = ({ overnight }) => (
  <section style={s.card}>
    <SectionHeader icon={<TrendingUp size={14} />} title="Watchlist Overnight" />
    <ul style={s.moverList}>
      {overnight.movers.map((m) => {
        const pos = m.change_pct >= 0;
        return (
          <li key={m.symbol} style={s.moverItem}>
            <span style={s.symbolChip}>{m.symbol}</span>
            <span style={{ color: pos ? 'var(--primary)' : '#dc3c3c', fontSize: '0.8125rem', fontWeight: 600 }}>
              {pos ? '+' : ''}{(m.change_pct * 100).toFixed(2)}%
            </span>
            {m.narrative_shift && <Badge label="narrative shift" />}
            {m.catalyst_this_week && <Badge label={m.catalyst_this_week} />}
          </li>
        );
      })}
    </ul>
    <a href="/portfolio/holdings" style={s.cardLink}>
      view watchlist <ExternalLink size={11} style={{ verticalAlign: 'middle' }} />
    </a>
  </section>
);

// ─── D — Ranked Feed ──────────────────────────────────────────────────────────

const RankedFeed: React.FC<{
  items: StructuredBriefing['ranked_feed'];
  isCold: boolean;
}> = ({ items, isCold }) => (
  <section style={s.card}>
    <SectionHeader icon={<BookOpen size={14} />} title="Intelligence Feed" />
    {isCold && (
      <p style={s.coldFeedNote}>
        Global brief — add holdings to personalise the feed.
      </p>
    )}
    {items.length === 0 ? (
      <p style={s.emptyNote}>No observations cross today's relevance threshold.</p>
    ) : (
      <ul style={s.feedList}>
        {items.map((item) => (
          <FeedItem key={item.id} item={item} />
        ))}
      </ul>
    )}
  </section>
);

const FeedItem: React.FC<{ item: StructuredBriefing['ranked_feed'][number] }> = ({ item }) => {
  const pct = Math.max(0, Math.min(1, item.confidence)) * 100;
  return (
    <li style={s.feedItem}>
      <div style={s.feedItemHeader}>
        <div style={s.feedItemTitle}>{item.title}</div>
        <div style={s.feedItemMeta}>
          <Badge label={item.reason_tag} />
          <span style={s.confChip}>τ {pct.toFixed(0)}%</span>
        </div>
      </div>
      {item.explanation && <p style={s.feedItemBody}>{item.explanation}</p>}
      <a href={item.cta_route} style={s.feedCta}>
        {item.cta_label} <ExternalLink size={10} style={{ verticalAlign: 'middle' }} />
      </a>
    </li>
  );
};

// ─── E — Research Queue ───────────────────────────────────────────────────────

const ResearchQueue: React.FC<{ queue: NonNullable<StructuredBriefing['research_queue']> }> = ({ queue }) => (
  <section style={s.card}>
    <SectionHeader icon={<BookOpen size={14} />} title="Research Queue" />
    <ul style={s.queueList}>
      {queue.map((inv) => (
        <li key={inv.id} style={s.queueItem}>
          <div style={s.queueItemHeader}>
            <span style={s.queueTitle}>{inv.title}</span>
            {inv.has_new_evidence && <Badge label="new evidence" urgent />}
          </div>
          {inv.symbols.length > 0 && (
            <div style={s.queueSymbols}>
              {inv.symbols.slice(0, 5).map((sym) => (
                <span key={sym} style={s.symbolChip}>{sym}</span>
              ))}
            </div>
          )}
          <a href={`/research/i/${inv.id}`} style={s.cardLink}>
            continue research <ExternalLink size={10} style={{ verticalAlign: 'middle' }} />
          </a>
        </li>
      ))}
    </ul>
  </section>
);

// ─── F — Copilot Entry ────────────────────────────────────────────────────────

const CopilotEntry: React.FC = () => {
  const navigate = useNavigate();
  return (
    <section style={{ ...s.card, ...s.copilotCard }}>
      <SectionHeader icon={<MessageSquare size={14} />} title="Deplyze Assistant" />
      <p style={s.copilotHint}>
        Ask about this morning's brief, your portfolio, or any signal you see above.
      </p>
      <button style={s.copilotBtn} onClick={() => navigate('/copilot')}>
        Ask me about this morning's brief
      </button>
    </section>
  );
};

// ─── Shared atoms ─────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div style={s.sectionHeader}>
    <span style={s.sectionIcon}>{icon}</span>
    <span style={s.sectionTitle}>{title}</span>
  </div>
);

const Badge: React.FC<{ label: string; urgent?: boolean }> = ({ label, urgent }) => (
  <span style={{ ...s.badge, ...(urgent ? s.badgeUrgent : {}) }}>{label}</span>
);

const Pill: React.FC<{ label: string }> = ({ label }) => (
  <span style={s.pill}>{label}</span>
);

// ─── States ──────────────────────────────────────────────────────────────────

const LoadingState: React.FC = () => (
  <div style={s.stateBox}>
    <p style={s.eyebrow}>Personalized institutional briefing</p>
    <p style={s.statePrimary}>Synthesising overnight intelligence…</p>
  </div>
);

const DisabledState: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
    {/* Page header mirrors the live state so it doesn't feel broken */}
    <header style={s.pageHeader}>
      <div>
        <p style={s.eyebrow}>Personalized institutional briefing</p>
        <h1 style={s.pageTitle}>Morning Routines</h1>
      </div>
    </header>

    {/* Skeleton sections */}
    <div style={{ ...s.card, ...s.regimeBanner, opacity: 0.45 }}>
      <div style={s.regimeBannerTop}>
        <div style={s.regimeMeta}>
          <span style={{ ...s.regimeLabel, background: 'var(--muted)', color: 'transparent', borderRadius: 4, display: 'inline-block', width: 160 }}>——</span>
          <span style={{ ...s.regimeEpisode, background: 'var(--muted)', color: 'transparent', borderRadius: 4, display: 'inline-block', width: 80 }}>——</span>
        </div>
      </div>
      <div style={{ height: 12, background: 'var(--muted)', borderRadius: 4, width: '70%' }} />
    </div>

    <div style={{ ...s.card, opacity: 0.45 }}>
      <div style={{ height: 12, background: 'var(--muted)', borderRadius: 4, width: '40%', marginBottom: 8 }} />
      {[1, 2, 3].map(i => (
        <div key={i} style={{ padding: '0.75rem 0', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ height: 12, background: 'var(--muted)', borderRadius: 4, width: `${55 + i * 10}%` }} />
          <div style={{ height: 10, background: 'var(--muted)', borderRadius: 4, width: '80%' }} />
        </div>
      ))}
    </div>

    {/* Explanation card */}
    <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '1.25rem 1.375rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: 'var(--foreground)' }}>
        Your morning brief is being provisioned
      </p>
      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted-foreground)', lineHeight: 1.55 }}>
        Morning Routines delivers a personalised pre-market briefing — regime context, portfolio pulse,
        watchlist movers, and a ranked intelligence feed — each weekday before market open.
      </p>
      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--muted-foreground)', lineHeight: 1.55 }}>
        The first brief will appear here once the personalization engine deploys and runs its
        initial build. No action needed on your part.
      </p>
      <a href="/" style={{ fontSize: '0.8125rem', color: 'var(--primary)', textDecoration: 'none', marginTop: '0.25rem' }}>
        Go to Intelligence Terminal →
      </a>
    </div>
  </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div style={s.stateBox}>
    <p style={s.statePrimary}>Could not load briefing.</p>
    <p style={s.stateSecondary}>{message}</p>
    <button style={s.retryBtn} onClick={onRetry}>Retry</button>
  </div>
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function severityColor(sev: string): string {
  if (sev === 'high')   return '#dc3c3c';
  if (sev === 'medium') return '#c98b1f';
  return '#5b7fcc';
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  shell: { background: 'var(--background)', minHeight: '100%', padding: '1.5rem 2rem 3rem' },
  content: { maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' },

  pageHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.25rem' },
  eyebrow: { fontSize: '0.6875rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-foreground)', margin: 0 },
  pageTitle: { fontSize: '1.5rem', fontWeight: 600, color: 'var(--foreground)', margin: '0.25rem 0 0', letterSpacing: '-0.015em' },
  headerPills: { display: 'flex', flexWrap: 'wrap', gap: '0.375rem', justifyContent: 'flex-end', paddingTop: '0.25rem' },
  pill: { fontSize: '0.6875rem', padding: '0.125rem 0.5rem', borderRadius: 6, border: '1px solid var(--border)', color: 'var(--muted-foreground)', background: 'var(--card)' },

  card: { border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', padding: '1rem 1.125rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' },
  cardLink: { fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.125rem' },

  sectionHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.125rem' },
  sectionIcon: { color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center' },
  sectionTitle: { fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)', letterSpacing: '-0.005em' },

  // Regime banner
  regimeBanner: { borderLeft: '3px solid var(--border)' },
  regimeBannerUrgent: { borderLeft: '3px solid #c98b1f', background: 'rgba(255,176,46,0.04)' },
  regimeBannerTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' },
  regimeMeta: { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
  regimeLabel: { fontSize: '0.9375rem', fontWeight: 600, color: 'var(--foreground)' },
  regimeEpisode: { fontSize: '0.6875rem', color: 'var(--muted-foreground)' },
  regimeConfidence: { display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 },
  confLabel: { fontSize: '0.6875rem', fontStyle: 'italic', color: 'var(--muted-foreground)' },
  confValue: { fontSize: '0.9375rem', fontWeight: 600, color: 'var(--foreground)' },
  regimeSummary: { margin: 0, fontSize: '0.875rem', color: 'var(--foreground)', lineHeight: 1.55 },
  regimeAnalog: { margin: 0, fontSize: '0.75rem', color: 'var(--muted-foreground)', fontStyle: 'italic' },

  // Cold state
  coldPrompt: { border: '1px dashed var(--border)', borderRadius: 10, padding: '1rem 1.125rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  coldText: { margin: 0, fontSize: '0.875rem', color: 'var(--foreground)', lineHeight: 1.5 },
  coldActions: { display: 'flex', gap: '0.5rem' },
  coldBtn: { fontSize: '0.8125rem', padding: '0.375rem 0.875rem', borderRadius: 6, border: 'none', background: 'var(--primary)', color: 'var(--primary-foreground)', cursor: 'pointer', fontWeight: 500 },
  coldBtnSecondary: { fontSize: '0.8125rem', padding: '0.375rem 0.875rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', cursor: 'pointer' },

  // Portfolio pulse
  pulseRow: { display: 'flex', flexWrap: 'wrap', gap: '1.5rem' },
  pulseKpi: { display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 120 },
  kpiLabel: { fontSize: '0.6875rem', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  kpiValue: { fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' },
  compatRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  compatTrack: { width: 80, height: 5, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' },
  compatFill: { height: '100%', borderRadius: 2 },
  flagList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  flagItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--foreground)' },
  severityDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  flagReason: { color: 'var(--muted-foreground)', fontSize: '0.8125rem' },

  // Watchlist
  moverList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  moverItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },

  // Feed
  coldFeedNote: { margin: 0, fontSize: '0.8125rem', color: 'var(--muted-foreground)', fontStyle: 'italic' },
  emptyNote: { margin: 0, fontSize: '0.8125rem', color: 'var(--muted-foreground)' },
  feedList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 0 },
  feedItem: { padding: '0.75rem 0', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  feedItemHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' },
  feedItemTitle: { fontSize: '0.9375rem', fontWeight: 500, color: 'var(--foreground)', lineHeight: 1.35, flex: 1 },
  feedItemMeta: { display: 'flex', gap: '0.375rem', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' },
  feedItemBody: { margin: 0, fontSize: '0.8125rem', color: 'var(--foreground)', lineHeight: 1.5 },
  feedCta: { fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' },
  confChip: { fontSize: '0.6875rem', color: 'var(--muted-foreground)' },

  // Research queue
  queueList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  queueItem: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  queueItemHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  queueTitle: { fontSize: '0.9375rem', fontWeight: 500, color: 'var(--foreground)' },
  queueSymbols: { display: 'flex', flexWrap: 'wrap', gap: '0.25rem' },

  // Copilot
  copilotCard: { background: 'var(--muted)' },
  copilotHint: { margin: 0, fontSize: '0.8125rem', color: 'var(--muted-foreground)' },
  copilotBtn: {
    fontSize: '0.875rem', padding: '0.5rem 1rem', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)',
    cursor: 'pointer', fontWeight: 500, textAlign: 'left',
  },

  // Badges
  badge: { fontSize: '0.625rem', padding: '0.0625rem 0.4375rem', borderRadius: 6, background: 'var(--muted)', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  badgeUrgent: { background: 'rgba(255,176,46,0.15)', color: '#c98b1f' },

  // Shared chips
  symbolChip: { fontSize: '0.625rem', fontWeight: 600, color: 'var(--foreground)', background: 'var(--muted)', padding: '0.0625rem 0.4375rem', borderRadius: 6 },

  // Footer
  footer: { display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.6875rem', color: 'var(--muted-foreground)', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' },
  footerNote: { fontStyle: 'italic' },

  // States
  stateBox: { padding: '2.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' },
  statePrimary: { margin: 0, fontSize: '0.9375rem', fontWeight: 500, color: 'var(--foreground)' },
  stateSecondary: { margin: 0, fontSize: '0.8125rem', color: 'var(--muted-foreground)', maxWidth: 480, lineHeight: 1.5 },
  retryBtn: { marginTop: '0.5rem', fontSize: '0.75rem', padding: '0.375rem 0.875rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', cursor: 'pointer' },
};
