/**
 * MorningTerminal — V5.1 Institutional morning brief.
 *
 * Section order:
 *   A. PageHeader       — market session status + provenance pills
 *   B. RegimeBanner     — regime-aware tinted panel with confidence arc
 *   C. ColdStatePrompt  — only when user has no portfolio/watchlist data
 *   D. PortfolioPulse   — horizontal stat row (if portfolio data available)
 *   E. WatchlistTable   — compact table (if watchlist movers exist)
 *   F. IntelligenceFeed — always shown, minimum 3 items guaranteed
 *   G. ResearchQueue    — only when active investigations exist
 *   H. CopilotEntry     — integrated intelligence entry point
 *
 * Design: premium institutional research terminal. Dark/light mode aware.
 * Platform tokens: --primary (amber/orange), --foreground, --muted-foreground,
 * --border, --card, --background, --muted.
 */

import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, ExternalLink, AlertTriangle,
  BookOpen, MessageSquare, ArrowRight, Activity, Layers, Zap,
} from 'lucide-react';

import { useStructuredBriefing } from '../hooks/usePersonalization';
import type { StructuredBriefing } from '../services/personalizationService';
import { logPageView, logEvent } from '../lib/telemetry';

const PAGE_PLACEMENT = 'MorningTerminal';

// ─── Market session helper ────────────────────────────────────────────────────

type SessionStatus = 'Pre-market' | 'Market open' | 'After-hours' | 'Market closed';

function getMarketSession(): SessionStatus {
  const now = new Date();
  // US Eastern time offset from UTC (approximate; ignores DST edge)
  const etOffsetHours = -5; // EST; EDT would be -4
  const etHour = ((now.getUTCHours() + etOffsetHours) + 24) % 24;
  const etMin = now.getUTCMinutes();
  const totalMin = etHour * 60 + etMin;
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat adjusted to ET
  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) return 'Market closed';
  // 04:00–09:29 ET = pre-market
  if (totalMin >= 240 && totalMin < 570) return 'Pre-market';
  // 09:30–16:00 ET = open
  if (totalMin >= 570 && totalMin < 960) return 'Market open';
  // 16:00–20:00 ET = after-hours
  if (totalMin >= 960 && totalMin < 1200) return 'After-hours';
  return 'Market closed';
}

function formatBriefDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

// ─── Markdown strip ───────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/#{1,6}\s?/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

// ─── Regime classification ────────────────────────────────────────────────────

type RegimeClass = 'transition' | 'expansion' | 'contraction' | 'neutral';

function classifyRegime(label: string = ''): RegimeClass {
  const l = label.toLowerCase();
  if (l.includes('transition') || l.includes('rotation')) return 'transition';
  if (l.includes('expansion') || l.includes('recovery') || l.includes('growth')) return 'expansion';
  if (l.includes('contraction') || l.includes('risk-off') || l.includes('recession')) return 'contraction';
  return 'neutral';
}

const REGIME_TINT: Record<RegimeClass, React.CSSProperties> = {
  transition:  { background: 'rgba(201, 139, 31, 0.07)', borderColor: 'rgba(201, 139, 31, 0.35)' },
  expansion:   { background: 'rgba(34, 197, 94, 0.06)',  borderColor: 'rgba(34, 197, 94, 0.30)' },
  contraction: { background: 'rgba(220, 60, 60, 0.06)',  borderColor: 'rgba(220, 60, 60, 0.28)' },
  neutral:     {},
};

const REGIME_ACCENT: Record<RegimeClass, string> = {
  transition:  '#c98b1f',
  expansion:   '#22c55e',
  contraction: '#dc3c3c',
  neutral:     'var(--muted-foreground)',
};

// ─── Confidence arc ───────────────────────────────────────────────────────────

const ConfidenceArc: React.FC<{ value: number; color: string }> = ({ value, color }) => {
  const pct = Math.max(0, Math.min(1, value));
  const radius = 16;
  const stroke = 2.5;
  const circ = 2 * Math.PI * radius;
  const dashArray = circ * 0.75; // 270-degree arc
  const dashOffset = dashArray * (1 - pct);
  return (
    <svg width={42} height={42} viewBox="0 0 42 42" style={{ transform: 'rotate(135deg)', flexShrink: 0 }}>
      {/* Track */}
      <circle cx={21} cy={21} r={radius} fill="none"
        stroke="var(--border)" strokeWidth={stroke}
        strokeDasharray={`${dashArray} ${circ}`}
        strokeLinecap="round"
      />
      {/* Fill */}
      <circle cx={21} cy={21} r={radius} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dashArray * pct} ${circ}`}
        strokeDashoffset={0}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
    </svg>
  );
};

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
  if (!briefing.data)  return (
    <Shell>
      <ErrorState
        message="The briefing service returned no payload. Refresh to request a new morning brief."
        onRetry={briefing.refetch}
      />
    </Shell>
  );

  const d = briefing.data;
  const isCold = !d.is_personalized;

  return (
    <Shell>
      {/* A — Page Header */}
      <PageHeader briefing={d} />

      {/* B — Regime Banner */}
      <RegimeBanner regime={d.regime} />

      {/* C — Cold state (no portfolio/watchlist) */}
      {isCold && <ColdStatePrompt />}

      {/* D — Portfolio Pulse */}
      {d.portfolio_pulse && <PortfolioPulse pulse={d.portfolio_pulse} />}

      {/* E — Watchlist Overnight */}
      {d.watchlist_overnight?.movers?.length ? (
        <WatchlistTable overnight={d.watchlist_overnight} />
      ) : null}

      {/* F — Intelligence Feed */}
      <IntelligenceFeed items={d.ranked_feed} isCold={isCold} />

      {/* G — Research Queue */}
      {d.research_queue?.length ? (
        <ResearchQueue queue={d.research_queue} />
      ) : null}

      {/* H — Copilot Entry */}
      <CopilotEntry />

      <PageFooter briefing={d} />
    </Shell>
  );
};

// ─── A — Page Header ──────────────────────────────────────────────────────────

const PageHeader: React.FC<{ briefing: StructuredBriefing }> = ({ briefing }) => {
  const updated = briefing.materialized_at ?? briefing.generated_at;
  const session = useMemo(() => getMarketSession(), []);
  const sessionColor = session === 'Market open' ? '#22c55e'
    : session === 'Pre-market' ? '#c98b1f'
    : session === 'After-hours' ? '#5b7fcc'
    : 'var(--muted-foreground)';

  return (
    <header style={s.pageHeader}>
      <div style={s.pageHeaderLeft}>
        <span style={s.eyebrow}>MORNING ROUTINES</span>
        <div style={s.pageHeaderDate}>
          <span style={s.dateText}>{formatBriefDate()}</span>
          <span style={s.sessionDot} />
          <span style={{ ...s.sessionLabel, color: sessionColor }}>{session}</span>
        </div>
      </div>
      <div style={s.headerPills}>
        {briefing.ranker_version && <Pill label={`Ranker · ${briefing.ranker_version}`} />}
        {updated && <Pill label={`Updated · ${new Date(updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`} />}
        {briefing.cache_hit && <Pill label="cached" />}
      </div>
    </header>
  );
};

// ─── B — Regime Banner ────────────────────────────────────────────────────────

const RegimeBanner: React.FC<{ regime: StructuredBriefing['regime'] }> = ({ regime }) => {
  const regimeClass = classifyRegime(regime?.label);
  const tint = REGIME_TINT[regimeClass];
  const accent = REGIME_ACCENT[regimeClass];
  const confidence = regime?.confidence ?? 0;
  const confPct = Math.round(confidence * 100);

  // Parse regime label into name + optional sub-state
  const labelParts = (regime?.label ?? 'Macro Regime').split(':');
  const regimeName = labelParts[0].trim();

  // Parse sub-dimensions from the label if present (e.g. "Transition: Growth Recovery")
  const breakdown = useMemo(() => {
    const summary = (regime?.summary ?? '').toLowerCase();
    return [
      { label: 'Growth',    value: summary.includes('recovery') ? 'Recovery' : summary.includes('contraction') ? 'Contraction' : '—' },
      { label: 'Liquidity', value: summary.includes('tighten') ? 'Tightening' : summary.includes('contract') ? 'Contracting' : summary.includes('expand') ? 'Expanding' : '—' },
      { label: 'Inflation', value: summary.includes('sticky') ? 'Sticky' : summary.includes('declin') || summary.includes('fall') ? 'Declining' : '—' },
      { label: 'Volatility',value: summary.includes('compres') || summary.includes('low vol') ? 'Compressed' : summary.includes('elevat') || summary.includes('high vol') ? 'Elevated' : 'Normal' },
    ];
  }, [regime?.summary]);

  return (
    <section style={{ ...s.regimeBanner, ...tint }}>
      {/* Top row: eyebrow + name + confidence */}
      <div style={s.regimeBannerTop}>
        <div style={s.regimeLeft}>
          <span style={s.regimeEyebrow}>COMPOSITE REGIME</span>
          <span style={{ ...s.regimeName, color: accent }}>{regimeName}</span>
          {typeof regime?.episode_day === 'number' && (
            <span style={s.regimeEpisode}>
              Episode · Day {regime.episode_day}
            </span>
          )}
        </div>
        <div style={s.regimeRight}>
          <ConfidenceArc value={confidence} color={accent} />
          <div style={s.confTextBlock}>
            <span style={s.confTau}>τ</span>
            <span style={{ ...s.confValue, color: accent }}>{confPct}%</span>
            <span style={s.confNote}>
              {confPct >= 70 ? 'high' : confPct >= 45 ? 'moderate' : 'low'} confidence
            </span>
          </div>
        </div>
      </div>

      {/* Summary — markdown stripped */}
      {regime?.summary && (
        <p style={s.regimeSummary}>{stripMarkdown(regime.summary)}</p>
      )}

      {/* Sub-dimension chips */}
      <div style={s.regimeBreakdown}>
        {breakdown.map((item) => (
          <div key={item.label} style={s.breakdownChip}>
            <span style={s.breakdownLabel}>{item.label.toUpperCase()}</span>
            <span style={s.breakdownValue}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* Historical analog + explore link */}
      <div style={s.regimeFooter}>
        {regime?.historical_analog && (
          <span style={s.regimeAnalog}>Closest analog: {regime.historical_analog}</span>
        )}
        <a href="/macro" style={{ ...s.cardLink, marginLeft: 'auto' }}>
          explore regime <ArrowRight size={11} style={{ verticalAlign: 'middle' }} />
        </a>
      </div>
    </section>
  );
};

// ─── C — Cold State ───────────────────────────────────────────────────────────

const ColdStatePrompt: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div style={s.coldPrompt}>
      <div style={s.coldPromptInner}>
        <span style={s.coldEyebrow}>GLOBAL BRIEF</span>
        <p style={s.coldText}>
          You're seeing market-wide intelligence. Connect your portfolio and watchlist
          to surface what changed overnight for your specific positions and instruments.
        </p>
      </div>
      <div style={s.coldActions}>
        <button style={s.coldBtn} onClick={() => navigate('/portfolio/overview')}>
          Add portfolio
        </button>
        <button style={s.coldBtnGhost} onClick={() => navigate('/portfolio/holdings')}>
          Add watchlist
        </button>
      </div>
    </div>
  );
};

// ─── D — Portfolio Pulse ──────────────────────────────────────────────────────

const PortfolioPulse: React.FC<{ pulse: NonNullable<StructuredBriefing['portfolio_pulse']> }> = ({ pulse }) => {
  const pnlPos = pulse.pnl_delta_pct >= 0;
  const pnlPct = `${pnlPos ? '+' : ''}${(pulse.pnl_delta_pct * 100).toFixed(2)}%`;
  const pnlColor = pnlPos ? '#22c55e' : '#dc3c3c';

  return (
    <section style={s.card}>
      <div style={s.cardHeader}>
        <span style={s.cardEyebrow}>PORTFOLIO PULSE</span>
        <a href="/portfolio/overview" style={s.cardLink}>
          View portfolio <ArrowRight size={11} style={{ verticalAlign: 'middle' }} />
        </a>
      </div>
      <div style={s.pulseStatRow}>
        <div style={s.pulseStat}>
          <span style={s.statLabel}>P&amp;L Today</span>
          <span style={{ ...s.statValue, color: pnlColor }}>
            {pnlPos ? <TrendingUp size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} /> : <TrendingDown size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} />}
            {pnlPct}
          </span>
        </div>
        <div style={s.pulseStatDivider} />
        <div style={s.pulseStat}>
          <span style={s.statLabel}>Regime Compat.</span>
          <span style={s.statValue}>{pulse.regime_compatibility}<span style={s.statUnit}>/100</span></span>
        </div>
        <div style={s.pulseStatDivider} />
        <div style={s.pulseStat}>
          <span style={s.statLabel}>Flagged Today</span>
          <span style={{ ...s.statValue, color: pulse.flag_count > 2 ? '#dc3c3c' : pulse.flag_count > 0 ? '#c98b1f' : 'var(--foreground)' }}>
            {pulse.flag_count > 0 && <AlertTriangle size={13} style={{ verticalAlign: 'middle', marginRight: 3 }} />}
            {pulse.flag_count}
          </span>
        </div>
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
    </section>
  );
};

// ─── E — Watchlist Overnight ──────────────────────────────────────────────────

const WatchlistTable: React.FC<{ overnight: NonNullable<StructuredBriefing['watchlist_overnight']> }> = ({ overnight }) => (
  <section style={s.card}>
    <div style={s.cardHeader}>
      <span style={s.cardEyebrow}>WATCHLIST OVERNIGHT</span>
      <a href="/portfolio/holdings" style={s.cardLink}>
        View watchlist <ArrowRight size={11} style={{ verticalAlign: 'middle' }} />
      </a>
    </div>
    <table style={s.watchlistTable}>
      <thead>
        <tr>
          <th style={s.thCell}>Symbol</th>
          <th style={{ ...s.thCell, textAlign: 'right' }}>Change</th>
          <th style={s.thCell}>Signal</th>
          <th style={s.thCell}>Catalyst</th>
        </tr>
      </thead>
      <tbody>
        {overnight.movers.map((m) => {
          const pos = m.change_pct >= 0;
          return (
            <tr key={m.symbol} style={s.watchlistRow}
              onClick={() => window.location.href = `/instruments/${m.symbol}`}
            >
              <td style={s.tdCell}>
                <span style={s.symbolChip}>{m.symbol}</span>
              </td>
              <td style={{ ...s.tdCell, textAlign: 'right' }}>
                <span style={{ color: pos ? '#22c55e' : '#dc3c3c', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {pos ? '+' : ''}{(m.change_pct * 100).toFixed(2)}%
                </span>
              </td>
              <td style={s.tdCell}>
                {m.narrative_shift ? (
                  <span style={s.watchlistSignalBadge}>narrative shift</span>
                ) : (
                  <span style={s.watchlistMuted}>—</span>
                )}
              </td>
              <td style={s.tdCell}>
                <span style={s.watchlistMuted}>{m.catalyst_this_week ?? '—'}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </section>
);

// ─── F — Intelligence Feed ────────────────────────────────────────────────────

const REASON_TAG_COLORS: Record<string, { bg: string; color: string }> = {
  'regime signal':     { bg: 'rgba(201, 139, 31, 0.15)', color: '#c98b1f' },
  'watchlist match':   { bg: 'rgba(91, 127, 204, 0.15)', color: '#5b7fcc' },
  'portfolio exposure':{ bg: 'rgba(255, 176, 46, 0.15)', color: '#e8830f' },
  'high confidence':   { bg: 'rgba(34, 197, 94, 0.14)',  color: '#22c55e' },
  'macro shift':       { bg: 'rgba(168, 85, 247, 0.13)', color: '#a855f7' },
  'investigation match':{ bg: 'rgba(91, 127, 204, 0.15)', color: '#5b7fcc' },
};

const MIN_FEED_ITEMS = 3;

const IntelligenceFeed: React.FC<{
  items: StructuredBriefing['ranked_feed'];
  isCold: boolean;
}> = ({ items, isCold }) => {
  const visibleItems = items.length >= MIN_FEED_ITEMS
    ? items
    : items; // always show whatever exists; low-confidence separator added below

  return (
    <section style={s.card}>
      <div style={s.cardHeader}>
        <span style={s.cardEyebrow}>INTELLIGENCE FEED</span>
        {isCold && <span style={s.coldFeedBadge}>Global brief</span>}
      </div>
      {visibleItems.length === 0 ? (
        <div style={s.feedEmptyState}>
          <Activity size={16} style={{ color: 'var(--muted-foreground)', marginBottom: 6 }} />
          <p style={s.feedEmptyText}>Synthesising signal candidates — check back shortly.</p>
        </div>
      ) : (
        <ul style={s.feedList}>
          {visibleItems.map((item, idx) => (
            <FeedItem key={item.id} item={item} idx={idx} />
          ))}
        </ul>
      )}
    </section>
  );
};

const FeedItem: React.FC<{ item: StructuredBriefing['ranked_feed'][number]; idx: number }> = ({ item, idx }) => {
  const tagStyle = REASON_TAG_COLORS[item.reason_tag] ?? REASON_TAG_COLORS['regime signal'];
  const conf = Math.max(0, Math.min(1, item.confidence));
  return (
    <li style={{ ...s.feedItem, ...(idx === 0 ? { borderTop: 'none', paddingTop: 0 } : {}) }}>
      <div style={s.feedItemHeader}>
        <span style={{ ...s.reasonTagPill, background: tagStyle.bg, color: tagStyle.color }}>
          {item.reason_tag}
        </span>
        <span style={s.tauScore}>τ {conf.toFixed(2)}</span>
      </div>
      <p style={s.feedItemTitle}>{stripMarkdown(item.title)}</p>
      {item.explanation && (
        <p style={s.feedItemBody}>{stripMarkdown(item.explanation)}</p>
      )}
      <a href={item.cta_route} style={s.feedCta}>
        {item.cta_label} <ArrowRight size={10} style={{ verticalAlign: 'middle' }} />
      </a>
    </li>
  );
};

// ─── G — Research Queue ───────────────────────────────────────────────────────

const ResearchQueue: React.FC<{ queue: NonNullable<StructuredBriefing['research_queue']> }> = ({ queue }) => (
  <section style={s.card}>
    <div style={s.cardHeader}>
      <span style={s.cardEyebrow}>RESEARCH QUEUE</span>
    </div>
    <ul style={s.queueList}>
      {queue.map((inv, idx) => (
        <li key={inv.id} style={{ ...s.queueItem, ...(idx === 0 ? { borderTop: 'none', paddingTop: 0 } : {}) }}>
          <div style={s.queueItemHeader}>
            <span style={s.queueTitle}>{inv.title}</span>
            {inv.has_new_evidence && (
              <span style={s.newEvidenceBadge}>New evidence</span>
            )}
          </div>
          {inv.symbols.length > 0 && (
            <div style={s.queueSymbols}>
              {inv.symbols.slice(0, 5).map((sym) => (
                <span key={sym} style={s.symbolChip}>{sym}</span>
              ))}
            </div>
          )}
          <a href={`/research/i/${inv.id}`} style={s.cardLink}>
            Continue <ArrowRight size={10} style={{ verticalAlign: 'middle' }} />
          </a>
        </li>
      ))}
    </ul>
  </section>
);

// ─── H — Copilot Entry ────────────────────────────────────────────────────────

const CopilotEntry: React.FC = () => {
  const navigate = useNavigate();
  return (
    <section style={s.copilotSection}>
      <div style={s.copilotDivider} />
      <div style={s.copilotInner}>
        <MessageSquare size={14} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
        <button style={s.copilotInput} onClick={() => navigate('/copilot')}>
          Ask about this morning's brief…
        </button>
        <ArrowRight size={14} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
      </div>
    </section>
  );
};

// ─── Footer ───────────────────────────────────────────────────────────────────

const PageFooter: React.FC<{ briefing: StructuredBriefing }> = ({ briefing }) => (
  <footer style={s.footer}>
    <span>Candidate pool: {briefing.candidate_set_size ?? '—'} · lineage {briefing.lineage_id ?? '—'}</span>
    <span style={s.footerNote}>
      Briefing personalises research relevance. It does not recommend trades or allocations.
    </span>
  </footer>
);

// ─── Shell ────────────────────────────────────────────────────────────────────

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={s.shell}>
    <div style={s.content}>{children}</div>
  </div>
);

// ─── Atoms ────────────────────────────────────────────────────────────────────

const Pill: React.FC<{ label: string }> = ({ label }) => (
  <span style={s.pill}>{label}</span>
);

// ─── States ──────────────────────────────────────────────────────────────────

const LoadingState: React.FC = () => (
  <div style={s.stateBox}>
    <Layers size={20} style={{ color: 'var(--muted-foreground)', marginBottom: 8 }} />
    <p style={s.statePrimary}>Synthesising overnight intelligence…</p>
    <p style={s.stateSecondary}>Ranking signals against current regime context.</p>
  </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div style={s.stateBox}>
    <p style={s.statePrimary}>Briefing unavailable.</p>
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

// ─── Design tokens ────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  shell: {
    background: 'var(--background)',
    minHeight: '100%',
    padding: '1.5rem 2rem 3rem',
  },
  content: {
    maxWidth: 1040,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },

  // ── Page header ──────────────────────────────────────────────────────────
  pageHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
    marginBottom: '0.25rem',
  },
  pageHeaderLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  eyebrow: {
    fontSize: '0.625rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: 'var(--muted-foreground)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  pageHeaderDate: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  dateText: {
    fontSize: '1.375rem',
    fontWeight: 600,
    color: 'var(--foreground)',
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
  },
  sessionDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: 'var(--muted-foreground)',
    flexShrink: 0,
  },
  sessionLabel: {
    fontSize: '0.8125rem',
    fontWeight: 500,
    letterSpacing: '0.01em',
  },
  headerPills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
    justifyContent: 'flex-end',
    paddingTop: '0.375rem',
  },
  pill: {
    fontSize: '0.625rem',
    fontWeight: 500,
    padding: '0.1875rem 0.5rem',
    borderRadius: 5,
    border: '1px solid var(--border)',
    color: 'var(--muted-foreground)',
    background: 'var(--card)',
    fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '0.03em',
  },

  // ── Regime banner ────────────────────────────────────────────────────────
  regimeBanner: {
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '1.125rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },
  regimeBannerTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  regimeLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  regimeEyebrow: {
    fontSize: '0.5625rem',
    fontWeight: 700,
    letterSpacing: '0.13em',
    color: 'var(--muted-foreground)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  regimeName: {
    fontSize: '1.625rem',
    fontWeight: 700,
    letterSpacing: '-0.025em',
    lineHeight: 1.15,
  },
  regimeEpisode: {
    fontSize: '0.75rem',
    color: 'var(--muted-foreground)',
    letterSpacing: '0.01em',
    marginTop: '0.125rem',
  },
  regimeRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    flexShrink: 0,
  },
  confTextBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '0.0625rem',
  },
  confTau: {
    fontSize: '0.625rem',
    fontStyle: 'italic',
    color: 'var(--muted-foreground)',
    fontFamily: 'var(--font-mono, monospace)',
    lineHeight: 1,
  },
  confValue: {
    fontSize: '1.125rem',
    fontWeight: 700,
    lineHeight: 1.1,
    fontFamily: 'var(--font-mono, monospace)',
  },
  confNote: {
    fontSize: '0.5625rem',
    color: 'var(--muted-foreground)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-mono, monospace)',
  },
  regimeSummary: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--foreground)',
    lineHeight: 1.6,
    opacity: 0.9,
  },
  regimeBreakdown: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  breakdownChip: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    padding: '0.4375rem 0.75rem',
    background: 'rgba(128,128,128,0.07)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    minWidth: 90,
  },
  breakdownLabel: {
    fontSize: '0.5rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: 'var(--muted-foreground)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  breakdownValue: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--foreground)',
    letterSpacing: '-0.005em',
  },
  regimeFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  regimeAnalog: {
    fontSize: '0.75rem',
    color: 'var(--muted-foreground)',
    fontStyle: 'italic',
  },

  // ── Shared card ──────────────────────────────────────────────────────────
  card: {
    border: '1px solid var(--border)',
    borderRadius: 12,
    background: 'var(--card)',
    padding: '1rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  cardEyebrow: {
    fontSize: '0.5625rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: 'var(--muted-foreground)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  cardLink: {
    fontSize: '0.75rem',
    color: 'var(--primary)',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontWeight: 500,
  },

  // ── Cold state ───────────────────────────────────────────────────────────
  coldPrompt: {
    border: '1px dashed var(--border)',
    borderRadius: 12,
    padding: '1rem 1.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  coldPromptInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    flex: 1,
    minWidth: 240,
  },
  coldEyebrow: {
    fontSize: '0.5625rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: 'var(--muted-foreground)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  coldText: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--muted-foreground)',
    lineHeight: 1.55,
  },
  coldActions: {
    display: 'flex',
    gap: '0.5rem',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  coldBtn: {
    fontSize: '0.75rem',
    padding: '0.375rem 0.875rem',
    borderRadius: 7,
    border: '1px solid var(--primary)',
    background: 'var(--primary)',
    color: 'var(--primary-foreground)',
    cursor: 'pointer',
    fontWeight: 600,
    letterSpacing: '0.01em',
  },
  coldBtnGhost: {
    fontSize: '0.75rem',
    padding: '0.375rem 0.875rem',
    borderRadius: 7,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--foreground)',
    cursor: 'pointer',
    fontWeight: 500,
  },

  // ── Portfolio Pulse ──────────────────────────────────────────────────────
  pulseStatRow: {
    display: 'flex',
    gap: 0,
    flexWrap: 'wrap',
  },
  pulseStat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0 1.25rem 0 0',
    minWidth: 120,
  },
  pulseStatDivider: {
    width: 1,
    alignSelf: 'stretch',
    background: 'var(--border)',
    margin: '0 1.25rem 0 0',
  },
  statLabel: {
    fontSize: '0.5625rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: 'var(--muted-foreground)',
    fontFamily: 'var(--font-mono, monospace)',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--foreground)',
    display: 'inline-flex',
    alignItems: 'center',
    fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
  },
  statUnit: {
    fontSize: '0.6875rem',
    color: 'var(--muted-foreground)',
    fontWeight: 400,
    marginLeft: 2,
  },
  flagList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    borderTop: '1px solid var(--border)',
    paddingTop: '0.625rem',
  },
  flagItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.8125rem',
    color: 'var(--foreground)',
  },
  severityDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  flagReason: {
    color: 'var(--muted-foreground)',
    fontSize: '0.8125rem',
  },

  // ── Watchlist table ───────────────────────────────────────────────────────
  watchlistTable: {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
  },
  thCell: {
    fontSize: '0.5rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: 'var(--muted-foreground)',
    fontFamily: 'var(--font-mono, monospace)',
    textTransform: 'uppercase',
    padding: '0 0.5rem 0.5rem 0',
    borderBottom: '1px solid var(--border)',
    textAlign: 'left',
  },
  tdCell: {
    padding: '0.625rem 0.5rem 0.625rem 0',
    borderBottom: '1px solid var(--border)',
    fontSize: '0.8125rem',
    color: 'var(--foreground)',
    verticalAlign: 'middle',
  },
  watchlistRow: {
    cursor: 'pointer',
  },
  watchlistSignalBadge: {
    fontSize: '0.5625rem',
    padding: '0.125rem 0.4375rem',
    borderRadius: 5,
    background: 'rgba(201, 139, 31, 0.13)',
    color: '#c98b1f',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-mono, monospace)',
  },
  watchlistMuted: {
    color: 'var(--muted-foreground)',
    fontSize: '0.8125rem',
  },

  // ── Intelligence feed ────────────────────────────────────────────────────
  coldFeedBadge: {
    fontSize: '0.5625rem',
    padding: '0.125rem 0.5rem',
    borderRadius: 5,
    background: 'var(--muted)',
    color: 'var(--muted-foreground)',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-mono, monospace)',
  },
  feedEmptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '1.5rem 0',
    gap: '0.25rem',
  },
  feedEmptyText: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--muted-foreground)',
  },
  feedList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  feedItem: {
    padding: '0.875rem 0',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  feedItemHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  reasonTagPill: {
    fontSize: '0.5625rem',
    padding: '0.1875rem 0.5rem',
    borderRadius: 5,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-mono, monospace)',
  },
  tauScore: {
    fontSize: '0.6875rem',
    color: 'var(--muted-foreground)',
    fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '0.02em',
    flexShrink: 0,
  },
  feedItemTitle: {
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: 'var(--foreground)',
    lineHeight: 1.35,
    margin: 0,
    letterSpacing: '-0.005em',
  },
  feedItemBody: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--foreground)',
    opacity: 0.8,
    lineHeight: 1.55,
  },
  feedCta: {
    fontSize: '0.75rem',
    color: 'var(--primary)',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontWeight: 500,
    marginTop: '0.0625rem',
  },

  // ── Research queue ────────────────────────────────────────────────────────
  queueList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  queueItem: {
    padding: '0.875rem 0',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  queueItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  queueTitle: {
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: 'var(--foreground)',
    letterSpacing: '-0.005em',
  },
  newEvidenceBadge: {
    fontSize: '0.5625rem',
    padding: '0.125rem 0.4375rem',
    borderRadius: 5,
    background: 'rgba(255, 176, 46, 0.15)',
    color: '#c98b1f',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-mono, monospace)',
  },
  queueSymbols: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.25rem',
  },

  // ── Copilot entry ─────────────────────────────────────────────────────────
  copilotSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  copilotDivider: {
    height: 1,
    background: 'var(--border)',
  },
  copilotInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    border: '1px solid var(--border)',
    borderRadius: 10,
    background: 'var(--card)',
    cursor: 'pointer',
  },
  copilotInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontSize: '0.875rem',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    textAlign: 'left',
    padding: 0,
    fontFamily: 'inherit',
  },

  // ── Shared atoms ─────────────────────────────────────────────────────────
  symbolChip: {
    fontSize: '0.625rem',
    fontWeight: 700,
    color: 'var(--foreground)',
    background: 'var(--muted)',
    padding: '0.125rem 0.4375rem',
    borderRadius: 5,
    fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '0.03em',
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '0.75rem',
    fontSize: '0.625rem',
    color: 'var(--muted-foreground)',
    borderTop: '1px solid var(--border)',
    paddingTop: '0.75rem',
    fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '0.02em',
    flexWrap: 'wrap',
  },
  footerNote: {
    fontStyle: 'italic',
  },

  // ── States ────────────────────────────────────────────────────────────────
  stateBox: {
    padding: '3rem 2rem',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    alignItems: 'center',
  },
  statePrimary: {
    margin: 0,
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: 'var(--foreground)',
  },
  stateSecondary: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--muted-foreground)',
    maxWidth: 440,
    lineHeight: 1.55,
  },
  retryBtn: {
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    padding: '0.375rem 0.875rem',
    borderRadius: 7,
    border: '1px solid var(--border)',
    background: 'var(--background)',
    color: 'var(--foreground)',
    cursor: 'pointer',
  },
};
