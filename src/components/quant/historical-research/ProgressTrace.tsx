/**
 * ProgressTrace — reasoning timeline for the Historical Research pipeline.
 *
 * Renders a vertical timeline of the four pipeline steps. The active step
 * opens a live log panel that streams action lines (→ / ✓ / ✗) interspersed
 * with natural-language narrative commentary, creating an AI inner-monologue
 * effect similar to Claude's extended thinking or Manus AI's reasoning trace.
 *
 * Completed steps auto-collapse to a one-line summary; the user can re-expand
 * any step by clicking it. The entire trace can be hidden/shown via the header.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { ProgressStep, LogEntry } from '../../../hooks/useHistoricalResearch';

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
  const [traceVisible, setTraceVisible] = useState(defaultExpanded);
  // Tick while busy so the active-row elapsed clock advances.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [busy]);

  // Guard: nothing to show for a slim-hydrated result (steps stripped to []).
  if (steps.length === 0 && !busy) return null;

  const allDone = !busy && steps.every((s) => s.state === 'done');
  const total = totalElapsedMs ?? liveTotal(steps, busy);

  if (!busy && !traceVisible) {
    return (
      <div style={collapsedBar}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <StatusDot state={allDone ? 'done' : 'failed'} />
          <span style={{ fontSize: 12, color: 'var(--foreground)' }}>
            {allDone ? 'Deep Research complete' : 'Deep Research finished with errors'}
          </span>
          <Sep />
          <Mono>{fmtMs(total)}</Mono>
          <Sep />
          <Mono>{steps.length} steps</Mono>
        </span>
        <button onClick={() => setTraceVisible(true)} style={ghostBtn}>show trace</button>
      </div>
    );
  }

  return (
    <section style={container}>
      {/* Header */}
      <div style={header}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <PulseDiamond active={busy} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)' }}>
            {busy
              ? 'Investigating…'
              : allDone
                ? 'Deep Research complete'
                : 'Deep Research finished'}
          </span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <Mono>{fmtMs(total)}</Mono>
          {!busy && (
            <button onClick={() => setTraceVisible(false)} style={ghostBtn}>hide</button>
          )}
        </span>
      </div>

      {/* Timeline */}
      <ul style={timeline}>
        {steps.map((step, i) => (
          <StepRow
            key={step.id}
            step={step}
            isLast={i === steps.length - 1}
          />
        ))}
      </ul>

      <Keyframes />
    </section>
  );
};

// ─── StepRow ──────────────────────────────────────────────────────────────

const StepRow: React.FC<{ step: ProgressStep; isLast: boolean }> = ({ step, isLast }) => {
  const isActive = step.state === 'active';
  const log = step.log ?? [];
  const hasLog = log.length > 0;
  const [expanded, setExpanded] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Open when step goes active; stay open when done (user can collapse).
  useEffect(() => {
    if (step.state === 'active') setExpanded(true);
  }, [step.state]);

  // Auto-scroll log box to bottom as entries arrive.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  const elapsed =
    step.startedAt != null && step.endedAt != null
      ? step.endedAt - step.startedAt
      : step.startedAt != null && isActive
        ? performance.now() - step.startedAt
        : undefined;

  const showLog = expanded && hasLog;
  const canToggle = hasLog && (step.state === 'done' || step.state === 'failed');

  return (
    <li style={{ display: 'flex', listStyle: 'none', padding: 0 }}>
      {/* ── Left: rail + dot ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        width: 22, flex: '0 0 22px', paddingTop: 3,
      }}>
        <StatusDot state={step.state} />
        {!isLast && (
          <div style={{
            flex: 1, width: 1,
            background: step.state === 'pending' ? 'var(--border)' : 'var(--border)',
            minHeight: 12, marginTop: 4, marginBottom: 0,
            opacity: step.state === 'pending' ? 0.4 : 1,
          }} />
        )}
      </div>

      {/* ── Right: label + log ── */}
      <div style={{
        flex: 1,
        paddingLeft: 10,
        paddingBottom: isLast ? 4 : 20,
        opacity: step.state === 'pending' ? 0.45 : 1,
      }}>
        {/* Step header row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          minHeight: 22,
          cursor: canToggle ? 'pointer' : 'default',
        }}
          onClick={() => { if (canToggle) setExpanded((v) => !v); }}
        >
          <span style={{
            fontSize: 13,
            fontWeight: isActive ? 600 : 500,
            color: step.state === 'failed'
              ? 'var(--destructive, #c75450)'
              : step.state === 'pending'
                ? 'var(--muted-foreground)'
                : 'var(--foreground)',
          }}>
            {step.label}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {elapsed != null && (
              <Mono dim={isActive}>{fmtMs(elapsed)}</Mono>
            )}
            {canToggle && (
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)', userSelect: 'none' }}>
                {expanded ? '−' : '›'}
              </span>
            )}
          </span>
        </div>

        {/* Error line */}
        {step.error && (
          <div style={{
            fontSize: 11, color: 'var(--destructive, #c75450)',
            fontFamily: 'var(--font-mono, ui-monospace)',
            marginTop: 4,
          }}>
            {step.error}
          </div>
        )}

        {/* Log box */}
        {showLog && (
          <div ref={logRef} style={logBox}>
            {log.map((entry, idx) => (
              <LogLine
                key={idx}
                entry={entry}
                showCursor={isActive && idx === log.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </li>
  );
};

// ─── LogLine ──────────────────────────────────────────────────────────────

const LogLine: React.FC<{ entry: LogEntry; showCursor: boolean }> = ({ entry, showCursor }) => {
  if (entry.type === 'narrative') {
    return (
      <div style={narrativeLine}>
        {entry.text}
        {showCursor && <BlinkCursor />}
      </div>
    );
  }
  const color =
    entry.prefix === '✓' ? 'var(--primary)'
    : entry.prefix === '✗' ? 'var(--destructive, #c75450)'
    : 'var(--muted-foreground)';
  return (
    <div style={actionLine}>
      <span style={{ color, flex: '0 0 auto', userSelect: 'none' }}>{entry.prefix}</span>
      <span style={{ flex: 1 }}>{entry.text}</span>
      {showCursor && <BlinkCursor />}
    </div>
  );
};

// ─── Atoms ────────────────────────────────────────────────────────────────

const StatusDot: React.FC<{ state: ProgressStep['state'] }> = ({ state }) => {
  if (state === 'pending') return (
    <span style={{
      width: 8, height: 8, borderRadius: '50%', flex: '0 0 8px',
      border: '1.5px solid var(--muted-foreground)', opacity: 0.4,
    }} />
  );
  if (state === 'done') return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ flex: '0 0 14px' }}>
      <circle cx="7" cy="7" r="6.5" stroke="var(--primary)" strokeWidth="1" fill="none" />
      <path d="M4 7.2 L6.2 9.4 L10 5" stroke="var(--primary)" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
  if (state === 'failed') return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ flex: '0 0 14px' }}>
      <circle cx="7" cy="7" r="6.5" stroke="var(--destructive, #c75450)" strokeWidth="1" fill="none" />
      <path d="M4.5 4.5 L9.5 9.5 M9.5 4.5 L4.5 9.5" stroke="var(--destructive, #c75450)"
        strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
  // active
  return (
    <span style={{
      width: 10, height: 10, borderRadius: '50%', flex: '0 0 10px',
      background: 'var(--primary)',
      animation: 'hr-pulse 1.4s ease-in-out infinite',
      boxShadow: '0 0 0 2px color-mix(in srgb, var(--primary) 20%, transparent)',
    }} />
  );
};

const PulseDiamond: React.FC<{ active: boolean }> = ({ active }) => (
  <span aria-hidden style={{
    width: 8, height: 8,
    background: active ? 'var(--primary)' : 'var(--muted-foreground)',
    transform: 'rotate(45deg)',
    display: 'inline-block',
    animation: active ? 'hr-pulse 1.6s ease-in-out infinite' : undefined,
  }} />
);

const BlinkCursor: React.FC = () => (
  <span aria-hidden style={{
    display: 'inline-block',
    width: 1.5, height: '0.8em',
    background: 'var(--foreground)',
    marginLeft: 3,
    verticalAlign: 'text-bottom',
    animation: 'hr-blink 1s step-end infinite',
  }} />
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
  <span style={{ color: 'var(--muted-foreground)', opacity: 0.4 }}>·</span>
);

// ─── Styles ───────────────────────────────────────────────────────────────

const container: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--card)',
  overflow: 'hidden',
};

const header: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '10px 16px',
  borderBottom: '1px solid var(--border)',
};

const timeline: React.CSSProperties = {
  listStyle: 'none',
  padding: '14px 16px 10px',
  margin: 0,
  display: 'flex', flexDirection: 'column',
};

const logBox: React.CSSProperties = {
  marginTop: 8,
  padding: '8px 10px',
  background: 'color-mix(in srgb, var(--muted) 60%, transparent)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  maxHeight: 220,
  overflowY: 'auto',
  display: 'flex', flexDirection: 'column', gap: 3,
};

const narrativeLine: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--muted-foreground)',
  lineHeight: 1.55,
  paddingLeft: 2,
};

const actionLine: React.CSSProperties = {
  display: 'flex', gap: 7, alignItems: 'flex-start',
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
  fontSize: 11.5,
  color: 'var(--foreground)',
  lineHeight: 1.55,
};

const collapsedBar: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '9px 14px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--card)',
  fontSize: 12,
  color: 'var(--muted-foreground)',
};

const ghostBtn: React.CSSProperties = {
  background: 'transparent', border: 'none',
  color: 'var(--muted-foreground)',
  fontSize: 11, letterSpacing: 0.3,
  textTransform: 'uppercase',
  cursor: 'pointer', padding: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function liveTotal(steps: ProgressStep[], includeActive: boolean): number {
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

// ─── Keyframes ────────────────────────────────────────────────────────────

const Keyframes: React.FC = () => (
  <style>{`
    @keyframes hr-pulse {
      0%, 100% { opacity: 0.5; }
      50%       { opacity: 1;   }
    }
    @keyframes hr-blink {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0; }
    }
    @keyframes hr-fade {
      from { opacity: 0; transform: translateY(-2px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `}</style>
);
