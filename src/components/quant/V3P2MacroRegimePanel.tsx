/**
 * V3P2MacroRegimePanel — the four-kind macro regime classification
 * (liquidity / inflation / rates / growth) produced by the Wave G engine and
 * exposed at `/v1/macro/regimes`.
 *
 * Each kind is a clickable card; opening one drills into a drawer with the
 * regime's full rationale, its driving series, a confidence trend, and the
 * recent transition history (so the classification reads as intelligence, not
 * a static status LED).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchMacroRegimes, fetchMacroObservations, type MacroRegimeRow, type MacroObservationRow } from '../../services/v3p2Service';
import { useDrawer } from './DataDrawer';
import { Sparkline } from './Sparkline';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

const KIND_ORDER: MacroRegimeRow['observation_type'][] = [
  'liquidity_regime', 'inflation_regime', 'rates_regime', 'growth_regime',
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
function tsOf(r: { observation_time: { value: string } | string }): number {
  return Date.parse(isoFromBQ(r.observation_time) ?? '') || 0;
}

export const V3P2MacroRegimePanel: React.FC = () => {
  const drawer = useDrawer();
  const [state, setState] = useState<LoadState>('idle');
  const [rows, setRows] = useState<MacroRegimeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const load = useCallback(() => {
    setState('loading');
    fetchMacroRegimes()
      .then((data) => { setRows(data); setState('loaded'); setFetchedAt(Date.now()); })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : String(e)); setState('error'); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchMacroRegimes()
      .then((data) => { if (!cancelled) { setRows(data); setState('loaded'); setFetchedAt(Date.now()); } })
      .catch((e: unknown) => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setState('error'); } });
    return () => { cancelled = true; };
  }, []);

  const byKind = new Map<MacroRegimeRow['observation_type'], MacroRegimeRow>();
  for (const r of rows) byKind.set(r.observation_type, r);

  const openRegime = (kind: MacroRegimeRow['observation_type'], r: MacroRegimeRow) => {
    drawer.open({
      title: `${KIND_LABEL[kind]} — ${r.regime_state}`,
      subtitle: 'Macro regime classification',
      width: 560,
      body: <RegimeDetailDrawerBody kind={kind} current={r} />,
    });
  };

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <h2 className="ds-heading" style={{ margin: '0 0 6px' }}>Macro Regime Intelligence</h2>
          <p className="ds-caption" style={{ margin: '0 0 12px', color: 'var(--muted-foreground)', fontSize: 11 }}>
            Liquidity, inflation, rates, and growth regimes. Click a card to drill into drivers, confidence trend, and transition history.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {fetchedAt && (
            <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
              {new Date(fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={load}
            disabled={state === 'loading'}
            title="Refresh regime classifications"
            style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--card)', color: 'var(--muted-foreground)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: state === 'loading' ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : undefined} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        {KIND_ORDER.map((kind) => {
          const r = byKind.get(kind);
          const clickable = !!r;
          return (
            <article
              key={kind}
              onClick={r ? () => openRegime(kind, r) : undefined}
              className={clickable ? 'ds-transition-fast' : undefined}
              style={{
                border: '1px solid var(--border)', borderRadius: 6, padding: 12,
                background: 'var(--card)', minHeight: 124,
                cursor: clickable ? 'pointer' : 'default',
                display: 'flex', flexDirection: 'column',
              }}
              onMouseEnter={(e) => { if (clickable) (e.currentTarget as HTMLElement).style.borderColor = 'var(--muted-foreground)'; }}
              onMouseLeave={(e) => { if (clickable) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
              title={clickable ? 'Click to drill into drivers + history' : undefined}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {KIND_LABEL[kind]}
                </span>
                {r ? <span style={{ fontSize: 10, color: severityToTone(r.severity) }}>{r.severity ?? '—'}</span> : null}
              </div>
              {state === 'loading' && !r && <div className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>loading…</div>}
              {state === 'error' && !r && <div className="ds-caption" style={{ color: '#c15f3c' }}>unavailable</div>}
              {!r && state === 'loaded' && (
                <div className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
                  No recent classification available.
                </div>
              )}
              {r && (
                <>
                  <div style={{ fontSize: 18, fontWeight: 600, margin: '4px 0 6px', color: 'var(--foreground)' }}>
                    {r.regime_state}
                  </div>
                  <div className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 11, lineHeight: 1.45, flex: 1 }}>
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
        <p className="ds-caption" style={{ color: '#c15f3c', fontSize: 10, marginTop: 8 }}>{error}</p>
      )}
    </section>
  );
};

/* ─── Regime detail drawer ──────────────────────────────────────────────── */

const MONTH_MS = 30 * 86_400_000;

const RegimeDetailDrawerBody: React.FC<{
  kind: MacroRegimeRow['observation_type'];
  current: MacroRegimeRow;
}> = ({ kind, current }) => {
  const [history, setHistory] = useState<MacroObservationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMacroObservations({ observation_type: kind, limit: 24 })
      .then((rows) => { if (!cancelled) setHistory(rows); })
      .catch(() => { if (!cancelled) setHistory([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind]);

  const asc = [...history].sort((a, b) => tsOf(a) - tsOf(b));
  const confidenceSpark = asc.map((r) => r.confidence * 100);

  // Start of the current consecutive run of this regime_state.
  let runStartTs: number | null = asc.length ? tsOf(asc[asc.length - 1]) : null;
  for (let i = asc.length - 1; i > 0; i--) {
    if (asc[i].regime_state === asc[i - 1].regime_state) runStartTs = tsOf(asc[i - 1]);
    else break;
  }
  const monthsInRegime = runStartTs ? Math.max(0, (Date.now() - runStartTs) / MONTH_MS) : null;

  // Transitions (state changes), most recent first.
  const transitions: Array<{ from: string; to: string; ts: number }> = [];
  for (let i = 1; i < asc.length; i++) {
    if (asc[i].regime_state !== asc[i - 1].regime_state) {
      transitions.push({ from: asc[i - 1].regime_state, to: asc[i].regime_state, ts: tsOf(asc[i]) });
    }
  }
  transitions.reverse();

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--foreground)' }}>{current.regime_state}</span>
          <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
            confidence {(current.confidence * 100).toFixed(0)}%{current.severity ? ` · ${current.severity}` : ''}
          </span>
        </div>
        {monthsInRegime != null && (
          <div className="ds-caption" style={{ color: 'var(--muted-foreground)', marginTop: 4 }}>
            In this regime ~{monthsInRegime.toFixed(monthsInRegime < 10 ? 1 : 0)} months
            {runStartTs ? ` (since ${new Date(runStartTs).toLocaleDateString()})` : ''}
          </div>
        )}
      </div>

      <div>
        <h3 className="ds-heading" style={{ margin: '0 0 6px' }}>Rationale</h3>
        <p className="ds-body" style={{ color: 'var(--foreground)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {current.body?.trim() || current.summary || 'No detailed rationale available.'}
        </p>
      </div>

      {current.related_series?.length ? (
        <div>
          <h3 className="ds-heading" style={{ margin: '0 0 6px' }}>Driving series</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {current.related_series.map((s) => (
              <span key={s} className="ds-caption" style={{ padding: '2px 8px', borderRadius: 5, background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{s}</span>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 className="ds-heading" style={{ margin: 0 }}>Confidence trend</h3>
          {confidenceSpark.length > 1 && <Sparkline values={confidenceSpark} width={220} height={36} color="var(--primary)" />}
        </div>
        {loading ? (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Loading history…</p>
        ) : transitions.length === 0 ? (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
            No regime change in the last {asc.length} observations — stable.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 4 }}>
            {transitions.slice(0, 6).map((t) => (
              <div key={t.ts} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--foreground)' }}>{t.from} → <strong>{t.to}</strong></span>
                <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>{new Date(t.ts).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
