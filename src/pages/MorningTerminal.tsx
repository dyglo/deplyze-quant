/**
 * MorningTerminal — V5 Phase 1 personalized institutional homepage surface.
 *
 * Answers the five briefing questions in calm, evidence-backed language:
 *   1. What changed overnight?
 *   2. What changed in my portfolio?
 *   3. What changed in my watchlists?
 *   4. Which narratives strengthened or weakened?
 *   5. What deserves attention first?
 *
 * Design constraints (deep-research-report §"Personalized Morning Terminal"):
 *   - No hype, no emojis, no retail urgency, no buy/sell language.
 *   - Every observation exposes a "why was this shown" affordance.
 *   - Dismiss / "less like this" controls per item; mute by category.
 *   - Empty state is calm — "no observations cross today's threshold" beats
 *     fake activity.
 *
 * Rollout: ships at /morning. Homepage (/) continues to point at the
 * Intelligence Terminal. When the team is comfortable, the / route can be
 * flipped to MorningTerminal as the default authenticated landing — that
 * is a one-line change in App.tsx.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Info, EyeOff, Volume2 } from 'lucide-react';

import { useMorningBriefing, useUserProfile } from '../hooks/usePersonalization';
import type { BriefingSection, RankedItem } from '../services/personalizationService';
import { logDismiss, logEvent, logFeedback, logPageView, logValueAction } from '../lib/telemetry';

const PAGE_PLACEMENT = 'MorningTerminal';

// ─── Shell ────────────────────────────────────────────────────────────────────

export const MorningTerminal: React.FC = () => {
  const briefing = useMorningBriefing();
  const profile = useUserProfile();

  useEffect(() => {
    logPageView(PAGE_PLACEMENT, { surface: 'morning_terminal' });
  }, []);

  useEffect(() => {
    if (briefing.data) {
      logEvent({
        event_type: 'briefing_open',
        event_category: 'briefing',
        placement: PAGE_PLACEMENT,
        entity_id: briefing.data.briefing_id,
      });
    }
  }, [briefing.data?.briefing_id]);

  const sections = useMemo<BriefingSection[]>(() => {
    if (!briefing.data) return [];
    const raw = briefing.data.sections;
    return Array.isArray(raw) ? raw : [];
  }, [briefing.data]);

  if (briefing.loading) {
    return <Shell><LoadingState /></Shell>;
  }
  if (briefing.error) {
    return <Shell><ErrorState message={briefing.error.message} onRetry={briefing.refetch} /></Shell>;
  }
  if (!briefing.data) {
    return <Shell><DisabledState /></Shell>;
  }

  const itemCount = sections.reduce((n, s) => n + (s.items?.length ?? 0), 0);
  const updated = briefing.data.materialized_at ?? briefing.data.generated_at;

  return (
    <Shell>
      <Header
        title={briefing.data.title ?? 'Personalized Morning Terminal'}
        summary={briefing.data.summary}
        updatedAt={updated}
        rankerVersion={briefing.data.ranker_version}
        regimeStyle={profile.data?.regime_style ?? undefined}
      />
      {itemCount === 0 ? (
        <EmptySections />
      ) : (
        <div style={styles.sectionList}>
          {sections.map((s) => (
            <Section key={s.key} briefingId={briefing.data!.briefing_id} section={s} />
          ))}
        </div>
      )}
      <Footer briefing={briefing.data} />
    </Shell>
  );
};

// ─── Layout ──────────────────────────────────────────────────────────────────

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={styles.shell}>
    <div style={styles.content}>{children}</div>
  </div>
);

const Header: React.FC<{
  title: string;
  summary?: string;
  updatedAt?: string | null;
  rankerVersion?: string;
  regimeStyle?: string;
}> = ({ title, summary, updatedAt, rankerVersion, regimeStyle }) => (
  <header style={styles.header}>
    <div>
      <p style={styles.eyebrow}>Personalized institutional briefing</p>
      <h1 style={styles.title}>{title}</h1>
      {summary && <p style={styles.summary}>{summary}</p>}
    </div>
    <div style={styles.headerMeta}>
      {regimeStyle && <Pill label={`Profile · ${regimeStyle}`} />}
      {rankerVersion && <Pill label={`Ranker · ${rankerVersion}`} />}
      {updatedAt && <Pill label={`Updated · ${new Date(updatedAt).toLocaleTimeString()}`} />}
    </div>
  </header>
);

const Section: React.FC<{ briefingId: string; section: BriefingSection }> = ({ briefingId, section }) => {
  const [open, setOpen] = useState(true);
  const onToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      logEvent({
        event_type: 'briefing_section_open',
        event_category: 'briefing',
        placement: PAGE_PLACEMENT,
        entity_id: section.key,
        properties: { briefing_id: briefingId },
      });
    }
  };

  if (!section.items || section.items.length === 0) {
    return null;
  }

  return (
    <section style={styles.section}>
      <button type="button" style={styles.sectionHeader} onClick={onToggle} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={styles.sectionLabel}>{section.label}</span>
        <span style={styles.sectionCount}>{section.items.length}</span>
      </button>
      {open && (
        <ul style={styles.itemList}>
          {section.items.map((item) => (
            <ItemCard key={item.artifact_id} item={item} sectionKey={section.key} />
          ))}
        </ul>
      )}
    </section>
  );
};

const ItemCard: React.FC<{ item: RankedItem; sectionKey: string }> = ({ item, sectionKey }) => {
  const [whyOpen, setWhyOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const onExpand = () => {
    logValueAction('expand', {
      category: 'briefing',
      placement: PAGE_PLACEMENT,
      artifact_id: item.artifact_id,
    });
  };

  const onDismiss = () => {
    setDismissed(true);
    logDismiss({
      category: 'briefing',
      placement: PAGE_PLACEMENT,
      artifact_id: item.artifact_id,
      reason: sectionKey,
    });
  };

  const onLessLikeThis = () => {
    void logFeedback({
      kind: 'relevance',
      artifact_id: item.artifact_id,
      signal: 'less_like_this',
      properties: { section: sectionKey, kind: item.kind },
    });
  };

  const onMuteCategory = () => {
    void logFeedback({
      kind: 'mute',
      category: item.kind,
      signal: 'mute',
      properties: { artifact_id: item.artifact_id },
    });
  };

  if (dismissed) return null;

  return (
    <li style={styles.itemCard}>
      <div style={styles.itemHeaderRow}>
        <div style={styles.itemTitleColumn}>
          <p style={styles.itemTitle}>{item.title ?? 'Observation'}</p>
          <div style={styles.metaRow}>
            {item.severity && <SeverityChip severity={item.severity} />}
            {typeof item.confidence === 'number' && (
              <span style={styles.confidence}>
                Confidence {confidenceLabel(item.confidence)}
              </span>
            )}
            {(item.symbols ?? []).slice(0, 4).map((s) => (
              <span key={s} style={styles.symbolChip}>{s.toUpperCase()}</span>
            ))}
          </div>
        </div>
        <div style={styles.itemActions}>
          <IconButton title="Why was this shown?" onClick={() => setWhyOpen((v) => !v)}>
            <Info size={13} />
          </IconButton>
          <IconButton title="Less like this" onClick={onLessLikeThis}>
            <Volume2 size={13} style={{ opacity: 0.7 }} />
          </IconButton>
          <IconButton title="Dismiss" onClick={onDismiss}>
            <EyeOff size={13} />
          </IconButton>
        </div>
      </div>
      {item.summary && (
        <p style={styles.itemBody} onClick={onExpand}>
          {item.summary}
        </p>
      )}
      {whyOpen && (
        <WhyShown item={item} onMuteCategory={onMuteCategory} />
      )}
    </li>
  );
};

const WhyShown: React.FC<{ item: RankedItem; onMuteCategory: () => void }> = ({ item, onMuteCategory }) => {
  const reasons = item.reason_codes ?? [];
  const comps = item.component_scores ?? {};
  return (
    <div style={styles.whyShown}>
      <div style={styles.whyTitle}>Why this surfaced</div>
      {reasons.length > 0 && (
        <ul style={styles.reasonList}>
          {reasons.map((r) => (
            <li key={r} style={styles.reasonItem}>{humanizeReason(r)}</li>
          ))}
        </ul>
      )}
      <div style={styles.scoreGrid}>
        {Object.entries(comps).map(([k, v]) => (
          <ScoreBar key={k} label={humanizeComponent(k)} value={typeof v === 'number' ? v : 0} />
        ))}
      </div>
      <div style={styles.whyFooter}>
        <span style={styles.whyMeta}>
          base score {item.base_score.toFixed(3)} · ranker rules-first · all evidence sourced from V4 intelligence layer
        </span>
        <button type="button" style={styles.muteCategory} onClick={onMuteCategory}>
          Mute {item.kind}
        </button>
      </div>
    </div>
  );
};

const Footer: React.FC<{ briefing: { lineage_id?: string; candidate_set_size?: number } }> = ({ briefing }) => (
  <footer style={styles.footer}>
    <span>
      Candidate pool: {briefing.candidate_set_size ?? '—'} · lineage {briefing.lineage_id ?? '—'}
    </span>
    <span style={styles.footerNote}>
      Briefing personalizes research relevance. It does not recommend trades or allocations.
    </span>
  </footer>
);

const EmptySections: React.FC = () => (
  <div style={styles.empty}>
    <p style={styles.emptyTitle}>No new institutional observations cross today’s relevance threshold.</p>
    <p style={styles.emptyBody}>
      The system is still analysing overnight V4 outputs. Check the Intelligence Terminal for the
      unfiltered feed.
    </p>
  </div>
);

const DisabledState: React.FC = () => (
  <div style={styles.empty}>
    <p style={styles.emptyTitle}>Personalization is not yet enabled for this environment.</p>
    <p style={styles.emptyBody}>
      The Morning Terminal will populate once the personalization engine is provisioned.
    </p>
  </div>
);

const LoadingState: React.FC = () => (
  <div style={styles.loading}>
    <p style={styles.eyebrow}>Personalized institutional briefing</p>
    <p style={styles.loadingMessage}>Synthesising overnight intelligence…</p>
  </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div style={styles.empty}>
    <p style={styles.emptyTitle}>Could not load briefing.</p>
    <p style={styles.emptyBody}>{message}</p>
    <button type="button" style={styles.retry} onClick={onRetry}>Retry</button>
  </div>
);

// ─── Atoms ───────────────────────────────────────────────────────────────────

const Pill: React.FC<{ label: string }> = ({ label }) => <span style={styles.pill}>{label}</span>;

const SeverityChip: React.FC<{ severity: string }> = ({ severity }) => {
  const tone =
    severity === 'high' ? styles.sevHigh :
    severity === 'medium' ? styles.sevMed :
    severity === 'low' ? styles.sevLow :
    styles.sevInfo;
  return <span style={{ ...styles.severityChip, ...tone }}>{severity}</span>;
};

const IconButton: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({
  title, onClick, children,
}) => (
  <button type="button" title={title} aria-label={title} style={styles.iconButton} onClick={onClick}>
    {children}
  </button>
);

const ScoreBar: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div style={styles.scoreRow}>
      <span style={styles.scoreLabel}>{label}</span>
      <div style={styles.scoreTrack}>
        <div style={{ ...styles.scoreFill, width: `${pct}%` }} />
      </div>
      <span style={styles.scoreValue}>{value.toFixed(2)}</span>
    </div>
  );
};

// ─── Reason / component humanization ─────────────────────────────────────────

function humanizeReason(code: string): string {
  switch (code) {
    case 'affects_portfolio':         return 'Affects holdings in your portfolio';
    case 'touches_portfolio':         return 'Touches a portfolio position';
    case 'watchlist_overlap':         return 'Overlaps with a watchlist symbol';
    case 'active_investigation':      return 'Continues an active investigation';
    case 'elevated_severity':         return 'Elevated severity from V4 intelligence';
    case 'high_confidence_source':    return 'High-confidence source';
    case 'v4_agent_grounded':         return 'Grounded in V4 agent output';
    case 'historical_analog':         return 'Backed by a historical analog match';
    case 'narrative_shift':           return 'Reflects a narrative shift';
    default:                          return code.replaceAll('_', ' ');
  }
}

function humanizeComponent(key: string): string {
  switch (key) {
    case 'portfolio_impact':             return 'Portfolio impact';
    case 'watchlist_match':              return 'Watchlist match';
    case 'investigation_continuation':   return 'Investigation continuation';
    case 'regime_urgency':               return 'Regime urgency';
    case 'confidence':                   return 'Confidence';
    case 'novelty':                      return 'Novelty';
    case 'recency':                      return 'Recency';
    case 'source_quality':               return 'Source quality';
    default:                             return key.replaceAll('_', ' ');
  }
}

function confidenceLabel(c: number): string {
  if (c >= 0.7) return 'High';
  if (c >= 0.4) return 'Medium';
  return 'Low';
}

// ─── Styles ──────────────────────────────────────────────────────────────────
// Inline because Deplyze pages don't use a CSS-in-JS lib. Tokens come from
// global CSS vars (--background, --foreground, --primary etc.) for theme
// parity with the rest of the institutional terminal.

const styles: Record<string, React.CSSProperties> = {
  shell: { background: 'var(--background)', minHeight: '100%', padding: '1.5rem 2rem 3rem' },
  content: { maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  eyebrow: {
    fontSize: '0.6875rem', letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--muted-foreground)', margin: 0,
  },
  title: { fontSize: '1.5rem', fontWeight: 600, color: 'var(--foreground)', margin: '0.25rem 0 0.5rem', letterSpacing: '-0.015em' },
  summary: { fontSize: '0.9375rem', color: 'var(--foreground)', margin: 0, lineHeight: 1.5, maxWidth: 760 },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' },
  headerMeta: { display: 'flex', flexWrap: 'wrap', gap: '0.375rem', justifyContent: 'flex-end' },
  pill: {
    fontSize: '0.6875rem', padding: '0.125rem 0.5rem', borderRadius: 6,
    border: '1px solid var(--border)', color: 'var(--muted-foreground)',
    background: 'var(--card)',
  },
  sectionList: { display: 'flex', flexDirection: 'column', gap: '0.875rem' },
  section: { border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden' },
  sectionHeader: {
    width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
    padding: '0.75rem 1rem', background: 'transparent', border: 'none',
    color: 'var(--foreground)', cursor: 'pointer', textAlign: 'left',
  },
  sectionLabel: { fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '-0.005em' },
  sectionCount: {
    marginLeft: 'auto', fontSize: '0.6875rem', color: 'var(--muted-foreground)',
    background: 'var(--muted)', padding: '0.0625rem 0.5rem', borderRadius: 999,
  },
  itemList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 0 },
  itemCard: {
    padding: '0.875rem 1rem', borderTop: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', gap: '0.5rem',
  },
  itemHeaderRow: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem' },
  itemTitleColumn: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  itemTitle: { margin: 0, fontSize: '0.9375rem', fontWeight: 500, color: 'var(--foreground)', lineHeight: 1.35 },
  metaRow: { display: 'flex', flexWrap: 'wrap', gap: '0.375rem', alignItems: 'center' },
  itemActions: { display: 'flex', gap: '0.25rem' },
  iconButton: {
    border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted-foreground)',
    width: 24, height: 24, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  itemBody: {
    margin: 0, fontSize: '0.875rem', color: 'var(--foreground)', lineHeight: 1.55,
    cursor: 'pointer',
  },
  severityChip: { fontSize: '0.625rem', padding: '0.0625rem 0.4375rem', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.04em' },
  sevHigh: { background: 'rgba(220,60,60,0.10)', color: '#dc3c3c' },
  sevMed: { background: 'rgba(255,176,46,0.10)', color: '#c98b1f' },
  sevLow: { background: 'rgba(120,160,255,0.10)', color: '#5b7fcc' },
  sevInfo: { background: 'var(--muted)', color: 'var(--muted-foreground)' },
  confidence: { fontSize: '0.6875rem', color: 'var(--muted-foreground)' },
  symbolChip: {
    fontSize: '0.625rem', fontWeight: 600, color: 'var(--foreground)',
    background: 'var(--muted)', padding: '0.0625rem 0.4375rem', borderRadius: 6,
  },
  whyShown: {
    marginTop: '0.25rem', padding: '0.75rem 0.875rem', background: 'var(--muted)',
    borderRadius: 8, display: 'flex', flexDirection: 'column', gap: '0.5rem',
  },
  whyTitle: { fontSize: '0.6875rem', fontWeight: 600, color: 'var(--foreground)', letterSpacing: '0.04em', textTransform: 'uppercase' },
  reasonList: { listStyle: 'disc', paddingInlineStart: '1.125rem', margin: 0, color: 'var(--foreground)', fontSize: '0.8125rem' },
  reasonItem: { lineHeight: 1.5 },
  scoreGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 0.875rem' },
  scoreRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  scoreLabel: { fontSize: '0.6875rem', color: 'var(--muted-foreground)', width: 150 },
  scoreTrack: { flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' },
  scoreFill: { height: '100%', background: 'var(--primary)' },
  scoreValue: { fontSize: '0.6875rem', color: 'var(--foreground)', width: 36, textAlign: 'right' },
  whyFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' },
  whyMeta: { fontSize: '0.6875rem', color: 'var(--muted-foreground)' },
  muteCategory: {
    fontSize: '0.6875rem', padding: '0.1875rem 0.5rem', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)',
    cursor: 'pointer',
  },
  footer: {
    display: 'flex', justifyContent: 'space-between', gap: '0.75rem',
    fontSize: '0.6875rem', color: 'var(--muted-foreground)',
    borderTop: '1px solid var(--border)', paddingTop: '0.75rem',
  },
  footerNote: { fontStyle: 'italic' },
  empty: {
    padding: '2rem', textAlign: 'center', borderRadius: 10,
    border: '1px dashed var(--border)', background: 'var(--card)',
    display: 'flex', flexDirection: 'column', gap: '0.375rem', alignItems: 'center',
  },
  emptyTitle: { margin: 0, fontSize: '0.9375rem', color: 'var(--foreground)', fontWeight: 500 },
  emptyBody: { margin: 0, fontSize: '0.8125rem', color: 'var(--muted-foreground)', maxWidth: 520, lineHeight: 1.5 },
  retry: {
    marginTop: '0.5rem', fontSize: '0.75rem', padding: '0.375rem 0.875rem', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', cursor: 'pointer',
  },
  loading: { padding: '3rem 0', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  loadingMessage: { fontSize: '0.9375rem', color: 'var(--muted-foreground)', margin: 0 },
};
