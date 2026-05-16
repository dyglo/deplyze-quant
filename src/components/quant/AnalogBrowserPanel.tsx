/**
 * AnalogBrowserPanel — Quant Lab tool for exploring the historical analog
 * matches for any symbol. Wraps `useHistoricalAnalogs` with parameters for
 * window length, step, and top-K so analysts can stress-test the
 * fingerprint over different lookbacks.
 */

import React, { useState } from 'react';
import { useHistoricalAnalogs } from '../../hooks/useHistoricalAnalogs';

const WINDOWS = [21, 42, 60, 90, 120] as const;
const STEPS = [5, 10, 21, 42] as const;
const TOP_K = [3, 5, 8, 10] as const;

const SimilarityBar: React.FC<{ value: number }> = ({ value }) => {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = value > 0.75 ? '#4E6040' : value > 0.55 ? '#C7884A' : 'var(--muted-foreground)';
  return (
    <div style={{ width: 90, height: 5, background: 'var(--muted)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color }} />
    </div>
  );
};

const ChipRow = <T extends number,>({ label, options, value, onChange }: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) => (
  <label style={{ display: 'grid', gap: 4 }}>
    <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
    <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', width: 'fit-content' }}>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: '4px 10px', fontSize: 11, fontWeight: 600,
            background: value === opt ? 'var(--primary)' : 'transparent',
            color: value === opt ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            border: 'none', cursor: 'pointer',
          }}
        >{opt}</button>
      ))}
    </div>
  </label>
);

export interface AnalogBrowserPanelProps {
  defaultSymbol?: string;
  onSaveSession?: (payload: {
    name: string;
    panel: 'alpha';
    symbols: string[];
    timeframe: string;
    summary: Record<string, string | number>;
  }) => void;
}

export const AnalogBrowserPanel: React.FC<AnalogBrowserPanelProps> = ({ defaultSymbol = 'SPY', onSaveSession }) => {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [draft, setDraft] = useState(defaultSymbol);
  const [window, setWindow] = useState<typeof WINDOWS[number]>(60);
  const [step, setStep] = useState<typeof STEPS[number]>(21);
  const [topK, setTopK] = useState<typeof TOP_K[number]>(5);

  const result = useHistoricalAnalogs(symbol, { window, step, topK });

  return (
    <section className="ds-surface" style={{ padding: 18, borderRadius: 10, display: 'grid', gap: 14 }}>
      <h2 className="ds-heading" style={{ margin: 0 }}>Historical analog browser</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Symbol</span>
          <input
            className="ds-input"
            style={{ padding: '6px 8px', fontSize: 12 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setSymbol(draft.toUpperCase()); }}
            onBlur={() => setSymbol(draft.toUpperCase())}
          />
        </label>
        <ChipRow label="Window (bars)" options={WINDOWS} value={window} onChange={setWindow} />
        <ChipRow label="Step (bars)"   options={STEPS}   value={step}   onChange={setStep} />
        <ChipRow label="Top K"         options={TOP_K}   value={topK}   onChange={setTopK} />
      </div>

      {result.loading && (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Pulling 10-year history for {symbol} and scoring fingerprints…
        </p>
      )}

      {!result.loading && !result.ready && (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Not enough history for {symbol} — found {result.barCount} bars, need ≥{window * 3}.
        </p>
      )}

      {result.ready && (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {result.matches.map((m) => (
              <li key={`${m.windowEnd}`} style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(140px, 1fr) auto auto auto',
                alignItems: 'center',
                gap: 12,
                fontSize: 12,
                padding: '8px 10px',
                background: 'var(--card)',
                borderRadius: 6,
                border: '1px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{m.label}</div>
                  <div className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
                    {new Date(m.windowStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    {' → '}
                    {new Date(m.windowEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <div className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10, textAlign: 'right' }}>
                  vol {(m.fingerprint.realisedVol * 100).toFixed(1)}%
                  <br />
                  drift {(m.fingerprint.meanReturn * 252 * 100).toFixed(1)}%/yr
                </div>
                <SimilarityBar value={m.similarity} />
                <span style={{
                  fontVariantNumeric: 'tabular-nums', fontWeight: 600, minWidth: 40, textAlign: 'right',
                  color: m.similarity > 0.75 ? '#4E6040' : 'var(--foreground)',
                }}>
                  {Math.round(m.similarity * 100)}%
                </span>
              </li>
            ))}
          </ul>

          {onSaveSession && (
            <div>
              <button
                onClick={() => onSaveSession({
                  name: `${symbol} analog browser ${window}d`,
                  panel: 'alpha',
                  symbols: [symbol],
                  timeframe: '1day',
                  summary: {
                    window: `${window}d`,
                    step: `${step}d`,
                    topK,
                    topMatch: result.matches[0]?.label ?? '',
                    topSimilarity: `${Math.round((result.matches[0]?.similarity ?? 0) * 100)}%`,
                    barsScanned: result.barCount,
                  },
                })}
                className="ds-btn-secondary"
                style={{ fontSize: 12 }}
              >
                Save snapshot
              </button>
            </div>
          )}

          <p className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10, margin: 0 }}>
            Fingerprint: realised vol, mean return, trend slope, skew, range compression, vol-of-vol.
            Cosine similarity on z-score-normalised vectors. Near-duplicate windows suppressed.
          </p>
        </>
      )}
    </section>
  );
};
