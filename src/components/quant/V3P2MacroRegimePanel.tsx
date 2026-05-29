/**
 * V3P2MacroRegimePanel — surfaces the four-kind macro regime classification
 * (liquidity / inflation / rates / growth) produced by the Wave G engine and
 * exposed at `/v1/macro/regimes`.
 *
 * This is a **panel inside an existing page**, not a new route. The macro
 * regime engine is deterministic — the panel just paints what's in the
 * warehouse and falls back to an empty-state if no recent classification is
 * available.
 */

import React, { useEffect, useState } from 'react';
import { fetchMacroRegimes, type MacroRegimeRow } from '../../services/v3p2Service';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

const KIND_ORDER: MacroRegimeRow['observation_type'][] = [
  'liquidity_regime',
  'inflation_regime',
  'rates_regime',
  'growth_regime',
];

const KIND_LABEL: Record<MacroRegimeRow['observation_type'], string> = {
  liquidity_regime: 'Liquidity',
  inflation_regime: 'Inflation',
  rates_regime: 'Rates',
  growth_regime: 'Growth',
};

function severityToTone(s: string | null): string {
  switch (s) {
    case 'high': return '#c15f3c';
    case 'med':
    case 'medium': return '#9e7e3a';
    default: return 'var(--muted-foreground)';
  }
}

function isoFromBQ(v: { value: string } | string | null | undefined): string | null {
  if (!v) return null;
  return typeof v === 'string' ? v : v.value;
}

export const V3P2MacroRegimePanel: React.FC = () => {
  const [state, setState] = useState<LoadState>('idle');
  const [rows, setRows] = useState<MacroRegimeRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchMacroRegimes()
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setState('loaded');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setState('error');
      });
    return () => { cancelled = true; };
  }, []);

  // Index by kind for a stable 4-cell grid.
  const byKind = new Map<MacroRegimeRow['observation_type'], MacroRegimeRow>();
  for (const r of rows) byKind.set(r.observation_type, r);

  return (
    <section style={{ marginBottom: 28 }}>
      <h2 className="ds-heading" style={{ margin: '0 0 6px' }}>
        Macro Regime Intelligence
      </h2>
      <p className="ds-caption" style={{ margin: '0 0 12px', color: 'var(--muted-foreground)', fontSize: 11 }}>
        Latest liquidity, inflation, rates, and growth regime classifications.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 12,
      }}>
        {KIND_ORDER.map((kind) => {
          const r = byKind.get(kind);
          return (
            <article
              key={kind}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: 12,
                background: 'var(--card)',
                minHeight: 120,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {KIND_LABEL[kind]}
                </span>
                {r ? (
                  <span style={{ fontSize: 10, color: severityToTone(r.severity) }}>
                    {r.severity ?? '—'}
                  </span>
                ) : null}
              </div>
              {state === 'loading' && !r && (
                <div className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>loading…</div>
              )}
              {state === 'error' && !r && (
                <div className="ds-caption" style={{ color: '#c15f3c' }}>unavailable</div>
              )}
              {!r && state === 'loaded' && (
                <div className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
                  no classification — run `/intelligence/macro-regime`
                </div>
              )}
              {r && (
                <>
                  <div style={{ fontSize: 18, fontWeight: 600, margin: '4px 0 6px', color: 'var(--foreground)' }}>
                    {r.regime_state}
                  </div>
                  <div className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 11, lineHeight: 1.45 }}>
                    {r.summary?.slice(0, 180) ?? r.title}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--muted-foreground)' }}>
                    <span>conf {(r.confidence * 100).toFixed(0)}%</span>
                    <span>{isoFromBQ(r.observation_time)?.slice(0, 10) ?? '—'}</span>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>

      {state === 'error' && (
        <p className="ds-caption" style={{ color: '#c15f3c', fontSize: 10, marginTop: 8 }}>
          {error}
        </p>
      )}
    </section>
  );
};
