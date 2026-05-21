/**
 * QuickBuild — structured-input alternative to the natural-language CommandBar.
 *
 * The user assembles a research plan directly: pick assets, pick a window,
 * pick comparisons. On submit, the page builds a `ResearchPlan` and invokes
 * the same pipeline (skipping the LLM /plan call) as if Refine had been
 * applied.
 *
 * Stateless re: investigation lifecycle — purely a form that produces a
 * `ResearchPlan` and a synthesized query string.
 */

import React, { useState } from 'react';
import { Plus, X, Play } from 'lucide-react';
import type {
  ResearchPlan,
  ResearchComparison,
  ResearchIntent,
} from '../../../services/historicalResearchService';

const COMPARISONS: { id: ResearchComparison; label: string }[] = [
  { id: 'normalized',          label: 'Normalized' },
  { id: 'rolling_correlation', label: 'Rolling correlation' },
  { id: 'relative_strength',   label: 'Relative strength' },
  { id: 'drawdown',            label: 'Drawdown' },
];

const LOOKBACK_OPTIONS = [1, 3, 5, 10, 20] as const;

interface Props {
  busy: boolean;
  onSubmit: (plan: ResearchPlan, query: string) => void;
}

type WindowMode = 'lookback' | 'custom';

export const QuickBuild: React.FC<Props> = ({ busy, onSubmit }) => {
  const [assets, setAssets] = useState<string[]>([]);
  const [assetInput, setAssetInput] = useState('');
  const [benchmark, setBenchmark] = useState('');
  const [windowMode, setWindowMode] = useState<WindowMode>('lookback');
  const [lookbackYears, setLookbackYears] = useState(10);
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>(new Date().toISOString().slice(0, 10));
  const [comparisons, setComparisons] = useState<ResearchComparison[]>(['normalized', 'rolling_correlation']);

  const addAsset = (raw: string) => {
    const sym = raw.trim().toUpperCase();
    if (!sym) return;
    setAssets((a) => a.includes(sym) ? a : [...a, sym]);
    setAssetInput('');
  };
  const removeAsset = (s: string) => setAssets((a) => a.filter((x) => x !== s));
  const toggleComparison = (c: ResearchComparison) =>
    setComparisons((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]);

  const customValid = customStart && customEnd && Date.parse(customStart) < Date.parse(customEnd);
  const canSubmit = assets.length > 0 && !busy && (windowMode === 'lookback' || customValid);
  const intent: ResearchIntent =
    assets.length === 1 ? 'single_asset_history'
    : comparisons.includes('rolling_correlation') && !comparisons.includes('normalized')
      ? 'relationship'
      : 'compare';

  const submit = () => {
    if (!canSubmit) return;
    const timeframe = windowMode === 'lookback'
      ? { start: null, end: null, lookbackYears }
      : { start: customStart, end: customEnd, lookbackYears };
    const plan: ResearchPlan = {
      intent,
      assets,
      benchmark: benchmark.trim().toUpperCase() || null,
      timeframe,
      comparisons,
      overlays: [],
      reasoning_focus: '',
    };
    const query = synthesizeQuery({
      assets, comparisons,
      windowLabel: windowMode === 'lookback' ? `${lookbackYears} years` : `${customStart} to ${customEnd}`,
    });
    onSubmit(plan, query);
  };

  return (
    <div style={wrap}>
      <div style={row}>
        <Label>Assets</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', flex: 1 }}>
          {assets.map((a) => (
            <span key={a} style={chip}>
              {a}
              <button type="button" onClick={() => removeAsset(a)} style={chipX} aria-label={`Remove ${a}`}>
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            value={assetInput}
            onChange={(e) => setAssetInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAsset(assetInput); } }}
            placeholder="Add ticker (Enter)"
            style={inlineInput}
          />
          <button type="button" onClick={() => addAsset(assetInput)} style={addBtn} aria-label="Add asset">
            <Plus size={12} />
          </button>
        </div>
      </div>

      <div style={row}>
        <Label>Benchmark</Label>
        <input
          value={benchmark}
          onChange={(e) => setBenchmark(e.target.value.toUpperCase())}
          placeholder="Optional (e.g. SPY)"
          style={{ ...inlineInput, width: 160 }}
        />
      </div>

      <div style={{ ...row, alignItems: 'flex-start' }}>
        <Label>Window</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Radio
              checked={windowMode === 'lookback'}
              onChange={() => setWindowMode('lookback')}
              label="Lookback"
            />
            <div style={{
              display: 'inline-flex', gap: 4,
              opacity: windowMode === 'lookback' ? 1 : 0.45,
            }}>
              {LOOKBACK_OPTIONS.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => { setWindowMode('lookback'); setLookbackYears(y); }}
                  style={{
                    ...preset,
                    background: lookbackYears === y && windowMode === 'lookback' ? 'var(--muted)' : 'transparent',
                    color: lookbackYears === y && windowMode === 'lookback' ? 'var(--foreground)' : 'var(--muted-foreground)',
                    fontWeight: lookbackYears === y && windowMode === 'lookback' ? 500 : 400,
                  }}
                >
                  {y}Y
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Radio
              checked={windowMode === 'custom'}
              onChange={() => setWindowMode('custom')}
              label="Custom"
            />
            <div style={{
              display: 'inline-flex', gap: 6, alignItems: 'center',
              opacity: windowMode === 'custom' ? 1 : 0.45,
            }}>
              <input
                type="date"
                value={customStart}
                onChange={(e) => { setWindowMode('custom'); setCustomStart(e.target.value); }}
                style={dateInput}
                max={customEnd || undefined}
              />
              <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>→</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => { setWindowMode('custom'); setCustomEnd(e.target.value); }}
                style={dateInput}
                min={customStart || undefined}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
            {windowMode === 'custom' && !customValid && (
              <span style={{ fontSize: 10.5, color: 'var(--destructive, #c75450)' }}>
                Start must precede end.
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={row}>
        <Label>Comparisons</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {COMPARISONS.map((c) => {
            const on = comparisons.includes(c.id);
            return (
              <label key={c.id} style={toggleLabel}>
                <span
                  onClick={() => toggleComparison(c.id)}
                  role="checkbox"
                  aria-checked={on}
                  style={{
                    width: 14, height: 14, borderRadius: 3,
                    border: '1px solid ' + (on ? 'var(--primary)' : 'var(--border)'),
                    background: on ? 'var(--primary)' : 'transparent',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {on && (
                    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
                      <path d="M2.5 6.2 L5 8.7 L9.5 3.5" stroke="var(--primary-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  )}
                </span>
                {c.label}
              </label>
            );
          })}
        </div>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 8,
        borderTop: '1px dashed var(--border)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
          {assets.length === 0
            ? 'Add at least one asset to investigate.'
            : `${assets.length} asset${assets.length === 1 ? '' : 's'} · ${
                windowMode === 'lookback' ? `${lookbackYears}Y window` : (customValid ? `${customStart} → ${customEnd}` : 'invalid window')
              } · ${comparisons.length} comparison${comparisons.length === 1 ? '' : 's'}`}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          style={{
            ...submitBtn,
            opacity: canSubmit ? 1 : 0.5,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          <Play size={12} />
          {busy ? 'Working…' : 'Investigate'}
        </button>
      </div>
    </div>
  );
};

function synthesizeQuery(opts: {
  assets: string[];
  comparisons: ResearchComparison[];
  windowLabel: string;
}): string {
  const verb = opts.assets.length === 1 ? 'history of' : 'compare';
  return `${verb} ${opts.assets.join(', ')} over ${opts.windowLabel}`;
}

const Radio: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({ checked, onChange, label }) => (
  <label style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 12, color: 'var(--foreground)',
    cursor: 'pointer', userSelect: 'none',
    width: 80, flex: '0 0 auto',
  }}>
    <span
      onClick={onChange}
      role="radio"
      aria-checked={checked}
      style={{
        width: 14, height: 14, borderRadius: '50%',
        border: '1px solid ' + (checked ? 'var(--primary)' : 'var(--border)'),
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flex: '0 0 auto',
      }}
    >
      {checked && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }} />}
    </span>
    {label}
  </label>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{
    width: 110,
    flex: '0 0 auto',
    fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
    color: 'var(--muted-foreground)',
  }}>{children}</span>
);

// ─── styles ───────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12,
  padding: '14px 16px',
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--card)',
};
const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  minHeight: 30,
};
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
const inlineInput: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: 12,
  outline: 'none',
  width: 130,
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
};
const addBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24,
  border: '1px solid var(--border)', borderRadius: 6,
  background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer',
};
const preset: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 11,
  cursor: 'pointer',
};
const dateInput: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: 12,
  width: 140,
  outline: 'none',
};
const toggleLabel: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 12, color: 'var(--foreground)',
  cursor: 'pointer', userSelect: 'none',
};
const submitBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 14px',
  border: '1px solid var(--primary)',
  borderRadius: 8,
  background: 'var(--primary)',
  color: 'var(--primary-foreground)',
  fontSize: 12.5,
  fontWeight: 500,
};
