/**
 * InvestigationsPanel — institutional workflow memory UI.
 *
 * Lets users create persistent investigations (theses, recurring research
 * threads, symbol/theme bundles) that the ranker treats as
 * investigation_continuation signal and that the Research Copilot uses for
 * grounding. Phase 1 scope is a list + create dialog + per-row patch
 * (status / unresolved questions). Resurfacing of new evidence into
 * investigations runs in the ranker itself.
 */

import React, { useEffect, useState } from 'react';
import { Plus, Hash, ChevronDown, ChevronRight } from 'lucide-react';

import { useInvestigations } from '../../hooks/usePersonalization';
import type { Investigation } from '../../services/personalizationService';
import { logEvent, logValueAction } from '../../lib/telemetry';

const PLACEMENT = 'InvestigationsPanel';

type Status = Investigation['status'];

export const InvestigationsPanel: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const [status, setStatus] = useState<Status>('active');
  const inv = useInvestigations(status);
  const [creating, setCreating] = useState(false);

  return (
    <section style={embedded ? styles.embedded : styles.standalone}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Workflow memory</p>
          <h2 style={styles.title}>Investigations</h2>
        </div>
        <div style={styles.headerActions}>
          <StatusTabs value={status} onChange={setStatus} />
          <button type="button" style={styles.newButton} onClick={() => setCreating(true)}>
            <Plus size={12} /> New
          </button>
        </div>
      </header>

      {creating && (
        <CreateInvestigation
          onClose={() => setCreating(false)}
          onCreated={async (input) => {
            await inv.create(input);
            logValueAction('investigation_create', {
              category: 'investigation',
              placement: PLACEMENT,
              properties: { symbol_count: input.symbols?.length ?? 0 },
            });
            setCreating(false);
          }}
        />
      )}

      {inv.loading && <p style={styles.muted}>Loading investigations…</p>}
      {inv.error && (
        <p style={styles.error}>
          Could not load investigations: {inv.error.message}
        </p>
      )}
      {!inv.loading && inv.data.length === 0 && (
        <p style={styles.empty}>
          No {status} investigations. Create one to capture an open thesis or recurring research thread.
        </p>
      )}

      <ul style={styles.list}>
        {inv.data.map((investigation) => (
          <InvestigationRow
            key={investigation.investigation_id}
            investigation={investigation}
            onPatch={async (patch) => {
              await inv.patch(investigation.investigation_id, patch);
              logEvent({
                event_type: 'investigation_update',
                event_category: 'investigation',
                placement: PLACEMENT,
                entity_id: investigation.investigation_id,
              });
              await inv.refetch();
            }}
          />
        ))}
      </ul>
    </section>
  );
};

const StatusTabs: React.FC<{ value: Status; onChange: (v: Status) => void }> = ({ value, onChange }) => {
  const tabs: Status[] = ['active', 'paused', 'resolved', 'archived'];
  return (
    <div style={styles.tabs} role="tablist">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={value === t}
          style={value === t ? styles.tabActive : styles.tab}
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
};

const InvestigationRow: React.FC<{
  investigation: Investigation;
  onPatch: (patch: Parameters<ReturnType<typeof useInvestigations>['patch']>[1]) => Promise<void> | void;
}> = ({ investigation, onPatch }) => {
  const [open, setOpen] = useState(false);

  return (
    <li style={styles.row}>
      <button type="button" style={styles.rowHeader} onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span style={styles.rowTitle}>{investigation.title}</span>
        <span style={styles.rowStatus}>{investigation.status}</span>
      </button>
      {investigation.thesis && (
        <p style={styles.rowThesis}>{investigation.thesis}</p>
      )}
      {(investigation.symbols ?? []).length > 0 && (
        <div style={styles.symbolStrip}>
          {investigation.symbols.slice(0, 12).map((s) => (
            <span key={s} style={styles.symbolChip}>
              <Hash size={9} /> {s.toUpperCase()}
            </span>
          ))}
        </div>
      )}
      {open && (
        <div style={styles.rowDetail}>
          {(investigation.unresolved_questions ?? []).length > 0 && (
            <>
              <p style={styles.subheading}>Unresolved questions</p>
              <ul style={styles.questionList}>
                {investigation.unresolved_questions.map((q, idx) => (
                  <li key={idx} style={styles.questionItem}>{q}</li>
                ))}
              </ul>
            </>
          )}
          <div style={styles.rowActions}>
            {investigation.status !== 'paused' && (
              <button type="button" style={styles.actionButton} onClick={() => onPatch({ status: 'paused' })}>
                Pause
              </button>
            )}
            {investigation.status === 'paused' && (
              <button type="button" style={styles.actionButton} onClick={() => onPatch({ status: 'active' })}>
                Resume
              </button>
            )}
            {investigation.status !== 'resolved' && (
              <button type="button" style={styles.actionButton} onClick={() => onPatch({ status: 'resolved' })}>
                Mark resolved
              </button>
            )}
            {investigation.status !== 'archived' && (
              <button type="button" style={styles.actionButton} onClick={() => onPatch({ status: 'archived' })}>
                Archive
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
};

const CreateInvestigation: React.FC<{
  onClose: () => void;
  onCreated: (input: {
    title: string;
    thesis?: string;
    symbols?: string[];
    themes?: string[];
    tags?: string[];
    unresolved_questions?: string[];
  }) => Promise<void> | void;
}> = ({ onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [thesis, setThesis] = useState('');
  const [symbolsRaw, setSymbolsRaw] = useState('');
  const [questionsRaw, setQuestionsRaw] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onCreated({
        title: title.trim(),
        thesis: thesis.trim() || undefined,
        symbols: symbolsRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
        unresolved_questions: questionsRaw.split('\n').map((s) => s.trim()).filter(Boolean),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form style={styles.createCard} onSubmit={handleSubmit}>
      <input
        autoFocus
        required
        placeholder="Investigation title — e.g. AI-capex narrative persistence"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={styles.input}
      />
      <textarea
        placeholder="Thesis (optional) — what are you tracking and why?"
        value={thesis}
        onChange={(e) => setThesis(e.target.value)}
        style={{ ...styles.input, minHeight: 60, resize: 'vertical' }}
      />
      <input
        placeholder="Symbols (comma-separated) — e.g. NVDA, AMD, TSM"
        value={symbolsRaw}
        onChange={(e) => setSymbolsRaw(e.target.value)}
        style={styles.input}
      />
      <textarea
        placeholder="Unresolved questions (one per line)"
        value={questionsRaw}
        onChange={(e) => setQuestionsRaw(e.target.value)}
        style={{ ...styles.input, minHeight: 60, resize: 'vertical' }}
      />
      <div style={styles.createActions}>
        <button type="button" style={styles.actionButton} onClick={onClose}>
          Cancel
        </button>
        <button type="submit" style={styles.primaryButton} disabled={busy || !title.trim()}>
          {busy ? 'Creating…' : 'Create investigation'}
        </button>
      </div>
    </form>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  standalone: { display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem 2rem', maxWidth: 980, margin: '0 auto' },
  embedded:   { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' },
  headerActions: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  eyebrow: { fontSize: '0.625rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-foreground)', margin: 0 },
  title: { fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0, letterSpacing: '-0.01em' },
  newButton: {
    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
    border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)',
    padding: '0.25rem 0.625rem', borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer',
  },
  tabs: { display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--card)' },
  tab:       { padding: '0.25rem 0.625rem', fontSize: '0.6875rem', background: 'transparent', color: 'var(--muted-foreground)', border: 'none', cursor: 'pointer', textTransform: 'capitalize' },
  tabActive: { padding: '0.25rem 0.625rem', fontSize: '0.6875rem', background: 'var(--muted)', color: 'var(--foreground)', border: 'none', cursor: 'pointer', textTransform: 'capitalize' },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.625rem' },
  row: { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)', padding: '0.625rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  rowHeader: { display: 'flex', alignItems: 'center', gap: '0.375rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, color: 'var(--foreground)' },
  rowTitle: { fontSize: '0.875rem', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowStatus: { fontSize: '0.625rem', color: 'var(--muted-foreground)', padding: '0.0625rem 0.4375rem', background: 'var(--muted)', borderRadius: 999, textTransform: 'capitalize' },
  rowThesis: { fontSize: '0.8125rem', color: 'var(--foreground)', margin: 0, lineHeight: 1.5 },
  symbolStrip: { display: 'flex', gap: '0.25rem', flexWrap: 'wrap' },
  symbolChip: { display: 'inline-flex', alignItems: 'center', gap: '0.125rem', fontSize: '0.625rem', fontWeight: 600, color: 'var(--foreground)', background: 'var(--muted)', padding: '0.0625rem 0.375rem', borderRadius: 6 },
  rowDetail: { display: 'flex', flexDirection: 'column', gap: '0.375rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' },
  subheading: { fontSize: '0.625rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-foreground)', margin: 0 },
  questionList: { margin: 0, paddingInlineStart: '1.125rem', display: 'flex', flexDirection: 'column', gap: '0.125rem', color: 'var(--foreground)', fontSize: '0.8125rem' },
  questionItem: { lineHeight: 1.45 },
  rowActions: { display: 'flex', gap: '0.375rem', flexWrap: 'wrap' },
  actionButton: { padding: '0.25rem 0.625rem', fontSize: '0.6875rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', cursor: 'pointer' },
  primaryButton: { padding: '0.3125rem 0.875rem', fontSize: '0.75rem', borderRadius: 6, border: '1px solid var(--primary)', background: 'var(--primary)', color: 'var(--primary-foreground)', cursor: 'pointer' },
  createCard: { display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)' },
  createActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.375rem' },
  input: { padding: '0.4375rem 0.625rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '0.8125rem', fontFamily: 'inherit' },
  muted: { fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 },
  error: { fontSize: '0.8125rem', color: '#dc3c3c', margin: 0 },
  empty: { fontSize: '0.8125rem', color: 'var(--muted-foreground)', padding: '1rem', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center', margin: 0 },
};

export default InvestigationsPanel;
