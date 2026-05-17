/**
 * V3P2LatestBriefingsPanel — surfaces the latest deterministic briefings
 * (Wave K) from `research.generated_briefings`. Used inside Research Library.
 *
 * Briefings are deterministic, template-based, citation-bearing summaries.
 * This panel intentionally only shows headline + summary + period; the full
 * body is reachable via the existing Briefings page.
 */

import React, { useEffect, useState } from 'react';
import { fetchLatestBriefings, type BriefingLatestRow } from '../../services/v3p2Service';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

function isoFromBQ(v: { value: string } | string | null | undefined): string | null {
  if (!v) return null;
  return typeof v === 'string' ? v : v.value;
}

function typeLabel(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const V3P2LatestBriefingsPanel: React.FC = () => {
  const [state, setState] = useState<LoadState>('idle');
  const [rows, setRows] = useState<BriefingLatestRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchLatestBriefings()
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

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 className="ds-heading" style={{ margin: '0 0 6px' }}>
        Latest Briefings
        <span className="ds-caption" style={{ marginLeft: 8, color: 'var(--muted-foreground)', fontWeight: 400 }}>
          V3 Phase 2 · deterministic
        </span>
      </h2>
      <p className="ds-caption" style={{ margin: '0 0 12px', color: 'var(--muted-foreground)', fontSize: 11 }}>
        Latest deterministic briefings of each type from `research.generated_briefings`.
        Re-runs produce identical content per as-of date.
      </p>

      {state === 'loading' && (
        <div className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>loading…</div>
      )}
      {state === 'error' && (
        <div className="ds-caption" style={{ color: '#c15f3c' }}>unavailable — {error}</div>
      )}
      {state === 'loaded' && rows.length === 0 && (
        <div className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
          no briefings yet — run `/briefings/generate` in the quant engine to seed.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {rows.map((b) => (
          <article
            key={b.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: 12,
              background: 'var(--card)',
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              {typeLabel(b.briefing_type)}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--foreground)' }}>
              {b.title}
            </div>
            <p className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 11, lineHeight: 1.45, margin: '0 0 8px' }}>
              {b.summary}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted-foreground)' }}>
              <span>{isoFromBQ(b.period_start)?.slice(0, 10) ?? '—'} → {isoFromBQ(b.period_end)?.slice(0, 10) ?? '—'}</span>
              <span>{(b.related_symbols ?? []).length} symbols</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
