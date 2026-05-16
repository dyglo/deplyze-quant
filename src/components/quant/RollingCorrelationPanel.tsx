/**
 * RollingCorrelationPanel — Quant Lab tool for inspecting how the
 * correlation between two assets evolves through a rolling window.
 *
 * Built on the Wave A primitive `rollingPearson` plus the Wave C drift
 * detector. Surfaces the current vs baseline correlation, regime state
 * chip, and an inline rolling sparkline.
 */

import React, { useMemo, useState } from 'react';
import { useOHLCV } from '../../hooks/useMarket';
import { Sparkline } from './Sparkline';
import {
  alignClosesByTs,
  correlationDrift,
  logReturns,
  rollingPearson,
} from '../../lib/quant';

const WINDOWS = [21, 30, 60, 90] as const;
type Window = typeof WINDOWS[number];

const STATE_PILL: Record<NonNullable<ReturnType<typeof correlationDrift>>['state'], { bg: string; fg: string }> = {
  stable:     { bg: 'var(--muted)',                 fg: 'var(--muted-foreground)' },
  tightening: { bg: 'rgba(78, 96, 64, 0.10)',       fg: '#4E6040' },
  loosening:  { bg: 'rgba(50, 95, 140, 0.10)',      fg: '#325F8C' },
  breakdown:  { bg: 'rgba(193, 95, 60, 0.12)',      fg: 'var(--primary)' },
};

export interface RollingCorrelationPanelProps {
  defaultA?: string;
  defaultB?: string;
  onSaveSession?: (payload: {
    name: string;
    panel: 'alpha';
    symbols: string[];
    timeframe: string;
    summary: Record<string, string | number>;
  }) => void;
}

export const RollingCorrelationPanel: React.FC<RollingCorrelationPanelProps> = ({
  defaultA = 'SPY',
  defaultB = 'QQQ',
  onSaveSession,
}) => {
  const [a, setA] = useState(defaultA);
  const [b, setB] = useState(defaultB);
  const [draftA, setDraftA] = useState(defaultA);
  const [draftB, setDraftB] = useState(defaultB);
  const [window, setWindow] = useState<Window>(60);

  const aOhlcv = useOHLCV(a, '1day', 504);
  const bOhlcv = useOHLCV(b, '1day', 504);

  const result = useMemo(() => {
    const aBars = aOhlcv.data?.bars ?? [];
    const bBars = bOhlcv.data?.bars ?? [];
    if (aBars.length < window + 5 || bBars.length < window + 5) return null;
    const aligned = alignClosesByTs(aBars, bBars);
    if (aligned.ts.length < window + 5) return null;
    const aLR = logReturns(aligned.a);
    const bLR = logReturns(aligned.b);
    const series = rollingPearson(aLR, bLR, window);
    const drift = correlationDrift(aLR, bLR, window, Math.max(window * 2, 126));
    return { series, drift, sample: series.length };
  }, [aOhlcv.data, bOhlcv.data, window]);

  const loading = aOhlcv.loading || bOhlcv.loading;

  return (
    <section className="ds-surface" style={{ padding: 18, borderRadius: 10, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="ds-heading" style={{ margin: 0 }}>Rolling correlation</h2>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                background: window === w ? 'var(--primary)' : 'transparent',
                color: window === w ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                border: 'none', cursor: 'pointer',
              }}
            >{w}d</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Asset A</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              className="ds-input"
              style={{ padding: '6px 8px', fontSize: 12, flex: 1 }}
              value={draftA}
              onChange={(e) => setDraftA(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setA(draftA.toUpperCase()); }}
              onBlur={() => setA(draftA.toUpperCase())}
            />
          </div>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Asset B</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              className="ds-input"
              style={{ padding: '6px 8px', fontSize: 12, flex: 1 }}
              value={draftB}
              onChange={(e) => setDraftB(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setB(draftB.toUpperCase()); }}
              onBlur={() => setB(draftB.toUpperCase())}
            />
          </div>
        </label>
      </div>

      {loading && (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Loading {a} and {b} histories…
        </p>
      )}

      {!loading && !result && (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          Need ≥{window + 5} overlapping daily bars between {a} and {b}. Adjust window or pick more liquid symbols.
        </p>
      )}

      {result && result.drift && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <div className="ds-surface" style={{ padding: 10, borderRadius: 8 }}>
              <div className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Current</div>
              <div style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {result.drift.current >= 0 ? '+' : ''}{result.drift.current.toFixed(2)}
              </div>
            </div>
            <div className="ds-surface" style={{ padding: 10, borderRadius: 8 }}>
              <div className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Baseline</div>
              <div style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {result.drift.historical >= 0 ? '+' : ''}{result.drift.historical.toFixed(2)}
              </div>
            </div>
            <div className="ds-surface" style={{ padding: 10, borderRadius: 8 }}>
              <div className="ds-label" style={{ color: 'var(--muted-foreground)' }}>Δ (z-score)</div>
              <div style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {result.drift.delta >= 0 ? '+' : ''}{result.drift.delta.toFixed(2)}
                <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginLeft: 6, fontSize: 10 }}>
                  z {result.drift.zScore.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="ds-surface" style={{ padding: 10, borderRadius: 8 }}>
              <div className="ds-label" style={{ color: 'var(--muted-foreground)' }}>State</div>
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                fontSize: 11, fontWeight: 600, letterSpacing: 0.2, textTransform: 'uppercase',
                background: STATE_PILL[result.drift.state].bg,
                color: STATE_PILL[result.drift.state].fg,
                marginTop: 2,
              }}>{result.drift.state}</span>
            </div>
          </div>

          <div className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>
                {window}-day rolling Pearson · {result.series.length} points
              </span>
              <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
                range {Math.min(...result.series).toFixed(2)} → {Math.max(...result.series).toFixed(2)}
              </span>
            </div>
            <Sparkline values={result.series} width={520} height={70} strokeWidth={1.5} />
          </div>

          {onSaveSession && (
            <div>
              <button
                onClick={() => onSaveSession({
                  name: `${a}↔${b} ${window}d correlation`,
                  panel: 'alpha',
                  symbols: [a, b],
                  timeframe: '1day',
                  summary: {
                    current: result.drift!.current.toFixed(2),
                    baseline: result.drift!.historical.toFixed(2),
                    delta: result.drift!.delta.toFixed(2),
                    zScore: result.drift!.zScore.toFixed(2),
                    state: result.drift!.state,
                    window: `${window}d`,
                  },
                })}
                className="ds-btn-secondary"
                style={{ fontSize: 12 }}
              >
                Save snapshot
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};
