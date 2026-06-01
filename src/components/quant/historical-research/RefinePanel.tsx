/**
 * RefinePanel — editable mirror of the resolved research plan.
 *
 * Open the panel, edit any field (intent, assets, benchmark, window,
 * comparisons, overlays, reasoning focus), and Apply to re-run the pipeline
 * with the edited plan. Internally we hold a draft that the user can Reset
 * back to the baseline plan at any time.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, X, Plus, RotateCcw, Play } from 'lucide-react';
import type {
  ResearchPlan,
  ResearchIntent,
  ResearchComparison,
  ResearchOverlay,
} from '../../../services/historicalResearchService';

const INTENTS: { id: ResearchIntent; label: string }[] = [
  { id: 'compare',              label: 'Compare' },
  { id: 'regime_behavior',      label: 'Regime behavior' },
  { id: 'relationship',         label: 'Relationship' },
  { id: 'single_asset_history', label: 'Single asset' },
  { id: 'anomaly_search',       label: 'Anomaly search' },
];

const COMPARISONS: { id: ResearchComparison; label: string }[] = [
  { id: 'normalized',          label: 'Normalized' },
  { id: 'rolling_correlation', label: 'Rolling correlation' },
  { id: 'relative_strength',   label: 'Relative strength' },
  { id: 'drawdown',            label: 'Drawdown' },
];

const OVERLAYS: { id: ResearchOverlay; label: string }[] = [
  { id: 'inflation_regime',  label: 'Inflation regime' },
  { id: 'rate_cycle',        label: 'Rate cycle' },
  { id: 'recession',         label: 'Recession' },
  { id: 'volatility_regime', label: 'Volatility regime' },
];

const LOOKBACK_PRESETS = [1, 3, 5, 10, 20] as const;

interface Props {
  plan: ResearchPlan;
  busy: boolean;
  defaultOpen?: boolean;
  /** Optional external control of the open/collapsed state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onApply: (next: ResearchPlan) => void;
}

export const RefinePanel: React.FC<Props> = ({
  plan, busy, defaultOpen = false, open: openProp, onOpenChange, onApply,
}) => {
  const [openInternal, setOpenInternal] = useState(defaultOpen);
  const open = openProp ?? openInternal;
  const setOpen = (v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === 'function' ? (v as (p: boolean) => boolean)(open) : v;
    if (openProp === undefined) setOpenInternal(next);
    onOpenChange?.(next);
  };
  const [draft, setDraft] = useState<ResearchPlan>(plan);
  const [assetInput, setAssetInput] = useState('');
  const [windowMode, setWindowMode] = useState<'lookback' | 'custom'>(
    plan.timeframe.start && plan.timeframe.end ? 'custom' : 'lookback',
  );

  // Reset draft whenever the baseline plan changes (e.g. new report).
  useEffect(() => {
    setDraft(plan);
    setWindowMode(plan.timeframe.start && plan.timeframe.end ? 'custom' : 'lookback');
  }, [plan]);

  const dirty = useMemo(() => !plansEqual(plan, draft), [plan, draft]);

  // ── mutators ───────────────────────────────────────────────────────────
  const addAsset = (raw: string) => {
    const sym = raw.trim().toUpperCase();
    if (!sym) return;
    setDraft((d) => d.assets.includes(sym) ? d : { ...d, assets: [...d.assets, sym] });
    setAssetInput('');
  };
  const removeAsset = (sym: string) => {
    setDraft((d) => ({ ...d, assets: d.assets.filter((a) => a !== sym) }));
  };
  const toggleComparison = (c: ResearchComparison) => {
    setDraft((d) => ({
      ...d,
      comparisons: d.comparisons.includes(c)
        ? d.comparisons.filter((x) => x !== c)
        : [...d.comparisons, c],
    }));
  };
  const toggleOverlay = (o: ResearchOverlay) => {
    setDraft((d) => ({
      ...d,
      overlays: d.overlays.includes(o) ? d.overlays.filter((x) => x !== o) : [...d.overlays, o],
    }));
  };

  const reset = () => {
    setDraft(plan);
    setWindowMode(plan.timeframe.start && plan.timeframe.end ? 'custom' : 'lookback');
  };
  const apply = () => {
    // Normalize the timeframe payload before sending: lookback mode wipes
    // start/end; custom keeps them and zeroes lookbackYears.
    const tf = windowMode === 'lookback'
      ? { start: null, end: null, lookbackYears: draft.timeframe.lookbackYears }
      : { start: draft.timeframe.start, end: draft.timeframe.end, lookbackYears: draft.timeframe.lookbackYears };
    onApply({ ...draft, timeframe: tf });
  };

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <section style={wrap}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={headerBtn}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--foreground)' }}>Refine</span>
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{summarize(draft)}</span>
        </span>
        {dirty && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase',
            color: 'var(--primary)',
          }}>● unsaved edits</span>
        )}
      </button>

      {open && (
        <div style={body}>
          {/* Intent */}
          <Field label="Intent">
            <select
              value={draft.intent}
              onChange={(e) => setDraft((d) => ({ ...d, intent: e.target.value as ResearchIntent }))}
              style={selectStyle}
            >
              {INTENTS.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          </Field>

          {/* Assets */}
          <Field label="Assets" wide>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {draft.assets.map((a) => (
                <span key={a} style={chip}>
                  {a}
                  <button onClick={() => removeAsset(a)} aria-label={`Remove ${a}`} style={chipX}>
                    <X size={10} />
                  </button>
                </span>
              ))}
              <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <input
                  value={assetInput}
                  onChange={(e) => setAssetInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addAsset(assetInput); }
                  }}
                  placeholder="Add ticker"
                  style={inlineInput}
                />
                <button onClick={() => addAsset(assetInput)} style={addBtn} aria-label="Add ticker">
                  <Plus size={12} />
                </button>
              </div>
            </div>
          </Field>

          {/* Benchmark */}
          <Field label="Benchmark">
            <input
              value={draft.benchmark ?? ''}
              onChange={(e) => setDraft((d) => ({
                ...d, benchmark: e.target.value.toUpperCase().trim() || null,
              }))}
              placeholder="None"
              style={inputStyle}
            />
          </Field>

          {/* Window */}
          <Field label="Window" wide>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Radio
                  checked={windowMode === 'lookback'}
                  onChange={() => setWindowMode('lookback')}
                  label="Lookback"
                />
                <div style={{ display: 'inline-flex', gap: 4, opacity: windowMode === 'lookback' ? 1 : 0.45 }}>
                  {LOOKBACK_PRESETS.map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => {
                        setWindowMode('lookback');
                        setDraft((d) => ({ ...d, timeframe: { ...d.timeframe, lookbackYears: y } }));
                      }}
                      style={{
                        ...presetBtn,
                        background: draft.timeframe.lookbackYears === y && windowMode === 'lookback'
                          ? 'var(--muted)' : 'transparent',
                        color: draft.timeframe.lookbackYears === y && windowMode === 'lookback'
                          ? 'var(--foreground)' : 'var(--muted-foreground)',
                      }}
                    >
                      {y}Y
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Radio
                  checked={windowMode === 'custom'}
                  onChange={() => setWindowMode('custom')}
                  label="Custom"
                />
                <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', opacity: windowMode === 'custom' ? 1 : 0.45 }}>
                  <input
                    type="date"
                    value={draft.timeframe.start ?? ''}
                    onChange={(e) => {
                      setWindowMode('custom');
                      setDraft((d) => ({ ...d, timeframe: { ...d.timeframe, start: e.target.value || null } }));
                    }}
                    style={dateInput}
                  />
                  <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>→</span>
                  <input
                    type="date"
                    value={draft.timeframe.end ?? ''}
                    onChange={(e) => {
                      setWindowMode('custom');
                      setDraft((d) => ({ ...d, timeframe: { ...d.timeframe, end: e.target.value || null } }));
                    }}
                    style={dateInput}
                  />
                </div>
              </div>
            </div>
          </Field>

          {/* Comparisons */}
          <Field label="Comparisons" wide>
            <div style={togglesRow}>
              {COMPARISONS.map((c) => (
                <Toggle
                  key={c.id}
                  checked={draft.comparisons.includes(c.id)}
                  onChange={() => toggleComparison(c.id)}
                  label={c.label}
                />
              ))}
            </div>
          </Field>

          {/* Overlays */}
          <Field label="Overlays" wide>
            <div style={togglesRow}>
              {OVERLAYS.map((o) => (
                <Toggle
                  key={o.id}
                  checked={draft.overlays.includes(o.id)}
                  onChange={() => toggleOverlay(o.id)}
                  label={o.label}
                />
              ))}
            </div>
            <div style={hintRow}>
              Overlays inform reasoning context. Visual overlays render in a follow-up release.
            </div>
          </Field>

          {/* Reasoning focus */}
          <Field label="Reasoning focus" wide>
            <input
              value={draft.reasoning_focus}
              onChange={(e) => setDraft((d) => ({ ...d, reasoning_focus: e.target.value }))}
              placeholder="What should the reasoning emphasize?"
              style={inputStyle}
            />
          </Field>

          {/* Actions */}
          <div style={actionsRow}>
            <button
              type="button"
              onClick={reset}
              disabled={!dirty || busy}
              style={{ ...secondaryBtn, opacity: !dirty || busy ? 0.45 : 1 }}
            >
              <RotateCcw size={12} /> Reset
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!dirty || busy || draft.assets.length === 0}
              style={{
                ...primaryBtn,
                opacity: !dirty || busy || draft.assets.length === 0 ? 0.45 : 1,
                cursor: !dirty || busy || draft.assets.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              <Play size={12} /> Apply
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

// ─── small primitives ────────────────────────────────────────────────────

const Field: React.FC<{ label: string; wide?: boolean; children: React.ReactNode }> = ({ label, wide, children }) => (
  <div style={{ gridColumn: wide ? '1 / -1' : undefined }}>
    <div style={{
      fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase',
      color: 'var(--muted-foreground)', marginBottom: 6,
    }}>{label}</div>
    {children}
  </div>
);

const Toggle: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({ checked, onChange, label }) => (
  <label style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 12, color: 'var(--foreground)',
    cursor: 'pointer', userSelect: 'none',
  }}>
    <span
      onClick={onChange}
      role="checkbox"
      aria-checked={checked}
      style={{
        width: 14, height: 14,
        border: '1px solid ' + (checked ? 'var(--primary)' : 'var(--border)'),
        background: checked ? 'var(--primary)' : 'transparent',
        borderRadius: 3,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
          <path d="M2.5 6.2 L5 8.7 L9.5 3.5" stroke="var(--primary-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )}
    </span>
    {label}
  </label>
);

const Radio: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({ checked, onChange, label }) => (
  <label style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 12, color: 'var(--foreground)',
    cursor: 'pointer', userSelect: 'none',
  }}>
    <span
      onClick={onChange}
      role="radio"
      aria-checked={checked}
      style={{
        width: 14, height: 14, borderRadius: '50%',
        border: '1px solid ' + (checked ? 'var(--primary)' : 'var(--border)'),
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {checked && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }} />}
    </span>
    {label}
  </label>
);

// ─── helpers ──────────────────────────────────────────────────────────────

function plansEqual(a: ResearchPlan, b: ResearchPlan): boolean {
  if (a.intent !== b.intent) return false;
  if (a.benchmark !== b.benchmark) return false;
  if (a.reasoning_focus !== b.reasoning_focus) return false;
  if (a.timeframe.lookbackYears !== b.timeframe.lookbackYears) return false;
  if ((a.timeframe.start ?? null) !== (b.timeframe.start ?? null)) return false;
  if ((a.timeframe.end ?? null) !== (b.timeframe.end ?? null)) return false;
  if (a.assets.length !== b.assets.length || a.assets.some((x, i) => x !== b.assets[i])) return false;
  if (!setsEqual(a.comparisons, b.comparisons)) return false;
  if (!setsEqual(a.overlays, b.overlays)) return false;
  return true;
}
function setsEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set<T>(a);
  return b.every((x) => s.has(x));
}

function summarize(p: ResearchPlan): string {
  const win = p.timeframe.start && p.timeframe.end
    ? `${p.timeframe.start} → ${p.timeframe.end}`
    : `${p.timeframe.lookbackYears}Y`;
  return [p.assets.slice(0, 4).join(' '), win].filter(Boolean).join(' · ') || 'no plan';
}

// ─── styles ───────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--card)',
  overflow: 'hidden',
};
const headerBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  width: '100%', padding: '10px 14px',
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--foreground)',
};
const body: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '16px 24px',
  padding: '14px 14px 16px',
  borderTop: '1px solid var(--border)',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: 13,
  outline: 'none',
};
const inlineInput: React.CSSProperties = {
  ...inputStyle,
  width: 110,
  padding: '4px 8px',
  fontSize: 12,
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
};
const dateInput: React.CSSProperties = {
  ...inputStyle,
  padding: '4px 8px',
  fontSize: 12,
  width: 140,
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 4px 3px 8px',
  border: '1px solid var(--border)',
  borderRadius: 999,
  background: 'var(--muted)',
  fontSize: 12,
  color: 'var(--foreground)',
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
};
const chipX: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 16, height: 16, borderRadius: '50%',
  background: 'transparent', border: 'none',
  color: 'var(--muted-foreground)', cursor: 'pointer',
};
const addBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24,
  border: '1px solid var(--border)', borderRadius: 6,
  background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer',
};
const presetBtn: React.CSSProperties = {
  padding: '3px 8px',
  border: '1px solid var(--border)',
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
};
const togglesRow: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: 12,
};
const hintRow: React.CSSProperties = {
  marginTop: 6, fontSize: 11, color: 'var(--muted-foreground)',
};
const actionsRow: React.CSSProperties = {
  gridColumn: '1 / -1',
  display: 'flex', justifyContent: 'flex-end', gap: 8,
  paddingTop: 10,
  borderTop: '1px dashed var(--border)',
};
const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 12px',
  border: '1px solid var(--border)', borderRadius: 6,
  background: 'transparent', color: 'var(--muted-foreground)',
  fontSize: 12, cursor: 'pointer',
};
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 14px',
  border: '1px solid var(--primary)', borderRadius: 6,
  background: 'var(--primary)', color: 'var(--primary-foreground)',
  fontSize: 12, fontWeight: 500, cursor: 'pointer',
};
