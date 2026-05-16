/**
 * QuantArchivePanel — displays IntelligenceArtifact records persisted by
 * the quantArtifactService (tagged `quant-engine`) so analysts can browse
 * the historical regime / anomaly / correlation / analog archive in one
 * place, grouped by kind.
 */

import React from 'react';
import type { IntelligenceArtifact } from '../../types';
import type { QuantArtifactKind } from '../../lib/quant';

const KIND_LABEL: Record<string, string> = {
  volatility_event: 'Volatility events',
  regime_transition: 'Regime transitions',
  anomaly_event: 'Anomalies',
  correlation_breakdown: 'Correlation breakdowns',
  seasonal_signal: 'Seasonal signals',
  historical_analog: 'Historical analogs',
  benchmark_shift: 'Benchmark shifts',
  macro_alignment_change: 'Macro alignment',
};

function classifyKind(a: IntelligenceArtifact): QuantArtifactKind | 'unknown' {
  if (!a.tags) return 'unknown';
  for (const t of a.tags) {
    if (t in KIND_LABEL) return t as QuantArtifactKind;
  }
  return 'unknown';
}

export const QuantArchivePanel: React.FC<{
  artifacts: IntelligenceArtifact[];
  loading: boolean;
  onOpen?: (id: string) => void;
}> = ({ artifacts, loading, onOpen }) => {
  const quantArtifacts = artifacts.filter((a) => a.tags?.includes('quant-engine'));

  if (loading && !quantArtifacts.length) {
    return (
      <section className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
        <h2 className="ds-heading" style={{ margin: 0, marginBottom: 8 }}>Quant Intelligence Archive</h2>
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>Loading archive…</p>
      </section>
    );
  }

  if (!quantArtifacts.length) {
    return (
      <section className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
        <h2 className="ds-heading" style={{ margin: 0, marginBottom: 8 }}>Quant Intelligence Archive</h2>
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          No quant artifacts persisted yet. Open an instrument and tap "Persist regime to archive" on the regime panel —
          or wire the regime / anomaly hooks to `persistQuantArtifact` to start accumulating research memory.
        </p>
      </section>
    );
  }

  const grouped = quantArtifacts.reduce<Record<string, IntelligenceArtifact[]>>((acc, a) => {
    const kind = classifyKind(a);
    (acc[kind] ??= []).push(a);
    return acc;
  }, {});

  const orderedKinds = Object.keys(grouped).sort();

  return (
    <section className="ds-surface" style={{ padding: 16, borderRadius: 10, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 className="ds-heading" style={{ margin: 0 }}>Quant Intelligence Archive</h2>
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
          {quantArtifacts.length} artifact{quantArtifacts.length === 1 ? '' : 's'}
        </span>
      </div>

      {orderedKinds.map((kind) => {
        const items = grouped[kind];
        return (
          <div key={kind}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)',
              textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
            }}>
              {KIND_LABEL[kind] ?? kind} ({items.length})
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
              {items.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => onOpen?.(a.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      cursor: onOpen ? 'pointer' : 'default',
                      display: 'grid',
                      gap: 3,
                      color: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{a.title}</span>
                      <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10, whiteSpace: 'nowrap' }}>
                        {new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
                      {a.symbols?.length ? a.symbols.join(', ') : '—'}
                      {' · '}
                      conf {(a.confidence * 100).toFixed(0)}%
                      {' · '}
                      sig {(a.significance * 100).toFixed(0)}%
                    </div>
                  </button>
                </li>
              ))}
              {items.length > 6 && (
                <li className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10, paddingLeft: 10 }}>
                  +{items.length - 6} more in this group
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </section>
  );
};
