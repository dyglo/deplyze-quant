/**
 * ProgressTrace — agentic step trace for Historical Research.
 *
 * Renders the four-step pipeline as a vertical list with per-step timing,
 * micro-narration detail, and a single animated row (the active one). When the
 * run is complete the trace collapses into a compact summary with a "show
 * trace" toggle so the user can re-inspect what the agent did.
 *
 * Motion budget is intentionally small: one slow opacity pulse on the active
 * row's leading dot, plus a 200ms opacity fade-in on substep updates. No
 * spinners, no shimmer, no marching progress bars.
 */

import React, { useEffect, useState } from 'react';
import type { ProgressStep, ProgressSubstep } from '../../../hooks/useHistoricalResearch';

interface Props {
  steps: ProgressStep[];
  busy: boolean;
  totalElapsedMs?: number;
  defaultExpanded?: boolean;
}

export const ProgressTrace: React.FC<Props> = ({
  steps,
  busy,
  totalElapsedMs,
  defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // Tick while busy so the active-row elapsed clock advances.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 200);
    return () => window.clearInterval(id);
  }, [busy]);

  const total = totalElapsedMs ?? computeTotal(steps, busy);
  const done = !busy && steps.every((s) => s.state === 'done' || s.state === 'failed' || s.state === 'pending');
  const allDone = !busy && steps.every((s) => s.state === 'done');

  // Collapsed footer for completed runs.
  if (!busy && !expanded) {
    return (
      <div style={collapsedRow}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Glyph state={allDone ? 'done' : 'failed'} />
          <span style={{ color: 'var(--foreground)' }}>
            {allDone ? 'Investigation complete' : 'Investigation finished with errors'}
          </span>
          <Sep />
          <Mono>{fmtMs(total)}</Mono>
          <Sep />
          <Mono>{steps.length} steps</Mono>
        </span>
        <button onClick={() => setExpanded(true)} style={linkBtn}>show trace</button>
      </div>
    );
  }

  return (
    <section style={containerStyle}>
      <header style={headerStyle}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <PulseDiamond active={busy} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)' }}>
            {busy ? 'Investigation in progress' : (allDone ? 'Investigation complete' : 'Investigation finished')}
          </span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Mono>{fmtMs(total)}</Mono>
          {done && (
            <button onClick={() => setExpanded(false)} style={linkBtn}>hide</button>
          )}
        </span>
      </header>
      <ul style={listStyle}>
        {steps.map((s) => (
          <Row key={s.id} step={s} />
        ))}
      </ul>
      <Keyframes />
    </section>
  );
};

// ─── Rows ─────────────────────────────────────────────────────────────────

const Row: React.FC<{ step: ProgressStep }> = ({ step }) => {
  const elapsed = step.startedAt != null && step.endedAt != null
    ? step.endedAt - step.startedAt
    : (step.startedAt != null ? performance.now() - step.startedAt : undefined);

  return (
    <li style={{ ...rowStyle, opacity: step.state === 'pending' ? 0.55 : 1 }}>
      <span style={{ width: 18, display: 'inline-flex', justifyContent: 'center' }}>
        <Glyph state={step.state} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          gap: 12,
        }}>
          <span style={{
            fontSize: 13,
            fontWeight: 500,
            color: step.state === 'failed' ? 'var(--destructive, #c75450)' : 'var(--foreground)',
          }}>
            {step.label}
          </span>
          {step.state === 'active' || step.state === 'done' || step.state === 'failed' ? (
            <Mono dim={step.state === 'active'}>{elapsed != null ? fmtMs(elapsed) : ''}</Mono>
          ) : null}
        </div>

        {step.detail && step.state !== 'pending' && (
          <FadeIn key={step.detail}>
            <div style={detailStyle}>{step.detail}</div>
          </FadeIn>
        )}

        {step.error && (
          <div style={{ ...detailStyle, color: 'var(--destructive, #c75450)' }}>
            {step.error}
          </div>
        )}

        {step.substeps && step.substeps.length > 0 && (
          <div style={substepRow}>
            {step.substeps.map((ss) => <Chip key={ss.key} sub={ss} />)}
          </div>
        )}
      </div>
    </li>
  );
};

const Chip: React.FC<{ sub: ProgressSubstep }> = ({ sub }) => (
  <FadeIn key={`${sub.key}:${sub.done}:${sub.failed ? 'f' : 'k'}`}>
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 8px',
        border: '1px solid var(--border)',
        borderRadius: 999,
        fontSize: 11,
        color: sub.failed ? 'var(--destructive, #c75450)' : 'var(--muted-foreground)',
        background: 'transparent',
        fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%',
          background: sub.failed
            ? 'var(--destructive, #c75450)'
            : (sub.done ? 'var(--primary)' : 'var(--muted-foreground)'),
          opacity: sub.done || sub.failed ? 1 : 0.4,
          animation: sub.done || sub.failed ? undefined : 'hr-pulse 1.4s ease-in-out infinite',
        }}
      />
      {sub.label}
    </span>
  </FadeIn>
);

// ─── Glyphs ───────────────────────────────────────────────────────────────

const Glyph: React.FC<{ state: ProgressStep['state'] }> = ({ state }) => {
  const common = { width: 12, height: 12, display: 'inline-block', borderRadius: '50%' } as const;
  if (state === 'pending') return <span style={{ ...common, border: '1.5px solid var(--muted-foreground)', opacity: 0.5 }} />;
  if (state === 'done') return <DoneCheck />;
  if (state === 'failed') return <FailX />;
  // active
  return (
    <span style={{
      ...common,
      background: 'var(--primary)',
      animation: 'hr-pulse 1.4s ease-in-out infinite',
    }} />
  );
};

const DoneCheck: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ display: 'block' }}>
    <path d="M2.5 6.2 L5 8.7 L9.5 3.5"
      stroke="var(--muted-foreground)" strokeWidth="1.6" strokeLinecap="round"
      strokeLinejoin="round" fill="none" />
  </svg>
);

const FailX: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ display: 'block' }}>
    <path d="M3 3 L9 9 M9 3 L3 9"
      stroke="var(--destructive, #c75450)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
  </svg>
);

const PulseDiamond: React.FC<{ active: boolean }> = ({ active }) => (
  <span
    aria-hidden
    style={{
      width: 8, height: 8,
      background: active ? 'var(--primary)' : 'var(--muted-foreground)',
      transform: 'rotate(45deg)',
      display: 'inline-block',
      animation: active ? 'hr-pulse 1.6s ease-in-out infinite' : undefined,
    }}
  />
);

// ─── Misc primitives ──────────────────────────────────────────────────────

const FadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ animation: 'hr-fade 220ms ease-out both' }}>{children}</div>
);

const Mono: React.FC<{ children: React.ReactNode; dim?: boolean }> = ({ children, dim }) => (
  <span style={{
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: 11,
    color: 'var(--muted-foreground)',
    opacity: dim ? 0.7 : 1,
  }}>{children}</span>
);

const Sep: React.FC = () => (
  <span style={{ color: 'var(--muted-foreground)', opacity: 0.5 }}>·</span>
);

// ─── styles ───────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--card)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
};

const listStyle: React.CSSProperties = {
  listStyle: 'none', padding: '8px 12px 12px', margin: 0,
  display: 'flex', flexDirection: 'column', gap: 8,
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 12,
  padding: '6px 4px',
};

const detailStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--muted-foreground)',
  marginTop: 2,
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
};

const substepRow: React.CSSProperties = {
  marginTop: 6,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const collapsedRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--card)',
  fontSize: 12,
  color: 'var(--muted-foreground)',
};

const linkBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--muted-foreground)',
  fontSize: 11,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  cursor: 'pointer',
  padding: 0,
};

// ─── helpers ──────────────────────────────────────────────────────────────

function computeTotal(steps: ProgressStep[], includeActive = false): number {
  let total = 0;
  for (const s of steps) {
    if (s.startedAt != null && s.endedAt != null) total += s.endedAt - s.startedAt;
    else if (includeActive && s.state === 'active' && s.startedAt != null) {
      total += performance.now() - s.startedAt;
    }
  }
  return total;
}

function fmtMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const Keyframes: React.FC = () => (
  <style>{`
    @keyframes hr-pulse {
      0%, 100% { opacity: 0.45; transform: var(--hr-pulse-transform, scale(1)); }
      50%      { opacity: 1;    transform: var(--hr-pulse-transform, scale(1)); }
    }
    @keyframes hr-fade {
      from { opacity: 0; transform: translateY(-1px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `}</style>
);
