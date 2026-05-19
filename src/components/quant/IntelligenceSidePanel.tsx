import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, ExternalLink, Bookmark, MessageSquare, TrendingUp, TrendingDown } from 'lucide-react';
import { useQuote, useOHLCV, useNews } from '../../hooks/useMarket';
import { useInstrumentRegime } from '../../hooks/useInstrumentRegime';
import { useAgentOutputs } from '../../hooks/useAgentIntelligence';
import { IntelligenceObservationCard } from './IntelligenceObservationCard';
import { AssetIcon } from './AssetIcon';
import { Sparkline } from './Sparkline';
import { RegimeBadge } from './RegimeBadge';
import { NewsList } from './NewsList';
import {
  computeVolatilityState,
  computeMomentumScore,
  computeAnomalyTag,
} from '../../services/screenerService';
import type { ScreenerRow } from '../../services/screenerService';

// Only equity/etf assets have reliable OHLCV on the gateway
const OHLCV_ASSET_CLASSES = new Set<ScreenerRow['assetClass']>(['equity', 'etf', 'index']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n?: number | null): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

// ─── Intelligence explanation ─────────────────────────────────────────────────

function deriveExplanation(
  row: ScreenerRow | null,
  regimeLabel?: string,
  changePercent?: number,
): string {
  const cp = changePercent ?? row?.changePercent ?? 0;
  const abs = Math.abs(cp);
  const dir = cp >= 0 ? 'advancing' : 'declining';
  const volState = computeVolatilityState(cp);

  const regimeLine = regimeLabel
    ? ` Current regime classification: ${regimeLabel}.`
    : '';

  if (abs > 5) {
    return `This instrument is ${dir} sharply — a ${abs.toFixed(1)}% move represents exceptional single-session volatility. Possible catalysts include earnings, guidance revisions, macro shocks, or regulatory events. Review recent headlines for confirmation.${regimeLine}`;
  }
  if (abs > 2.5) {
    return `A ${abs.toFixed(1)}% session move indicates active price discovery with elevated institutional participation likely. Monitor volume for confirmation of directional conviction.${regimeLine}`;
  }
  if (abs > 1) {
    return `Moderate ${dir} pressure of ${abs.toFixed(2)}% — within normal institutional trading ranges but worth monitoring for continuation signals.${regimeLine}`;
  }
  if (abs < 0.3) {
    return `Minimal session movement of ${abs.toFixed(2)}%. The instrument is in low-volatility equilibrium — potential for a breakout or compression event if volume begins to build.${regimeLine}`;
  }
  return `Session performance of ${cp >= 0 ? '+' : ''}${cp.toFixed(2)}% with ${volState} volatility. No material anomalies detected at current levels.${regimeLine}`;
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

const StatTile: React.FC<{ label: string; value: string | undefined; emphasis?: boolean }> = ({ label, value, emphasis }) => (
  <div className="ds-surface" style={{ padding: '8px 10px', borderRadius: 8 }}>
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 3 }}>
      {label}
    </div>
    <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: emphasis ? 'var(--primary)' : 'var(--foreground)' }}>
      {value ?? '—'}
    </div>
  </div>
);

// ─── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  row: ScreenerRow | null;
  onClose: () => void;
  onSave?: (symbol: string) => void;
  isSaved?: boolean;
}

export const IntelligenceSidePanel: React.FC<Props> = ({ row, onClose, onSave, isSaved }) => {
  const symbol = row?.symbol ?? null;
  const navigate = useNavigate();

  // V4: symbol-level agent observations
  const symbolAgentOutputs = useAgentOutputs({
    symbol: symbol ?? undefined,
    limit: 4,
    days: 3,
  });

  const supportsOHLCV = !row || OHLCV_ASSET_CLASSES.has(row.assetClass);
  const supportsRegime = !row || OHLCV_ASSET_CLASSES.has(row.assetClass);

  const quote = useQuote(symbol);
  const ohlcv = useOHLCV(supportsOHLCV ? symbol : null, '1day', 90);
  const news = useNews({ symbol: symbol ?? undefined, limit: 5 });
  const regime = useInstrumentRegime(supportsRegime ? symbol : null);

  const closes = useMemo(() => (ohlcv.data?.bars ?? []).map((b) => b.close), [ohlcv.data]);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const change90 = first && last ? ((last - first) / first) * 100 : null;

  const q = quote.data;
  const cp = q?.changePercent ?? row?.changePercent ?? 0;
  const pos = cp > 0;
  const neg = cp < 0;
  const clr = pos ? '#4E6040' : neg ? 'var(--primary)' : 'var(--muted-foreground)';

  const volState = computeVolatilityState(cp);
  const momentumScore = computeMomentumScore(cp);
  const anomalyTag = computeAnomalyTag(cp, undefined);

  const explanation = deriveExplanation(
    row,
    regime.regime?.label,
    cp,
  );

  if (!symbol) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--card)',
      borderLeft: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <AssetIcon symbol={symbol} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--foreground)' }}>
            {symbol}
          </div>
          {row?.name && row.name !== symbol && (
            <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.name}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* Price */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', lineHeight: 1 }}>
              {q?.price != null ? fmtPrice(q.price) : row?.price != null ? fmtPrice(row.price) : '—'}
            </div>
            <div style={{ fontSize: 11, color: clr, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              {pos ? '▲' : neg ? '▼' : '·'} {Math.abs(cp).toFixed(2)}%
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Mini chart */}
        <section className="ds-surface" style={{ padding: 12, borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>
              90-Day Price
            </span>
            {change90 != null && (
              <span style={{ fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: change90 >= 0 ? '#4E6040' : 'var(--primary)' }}>
                {change90 >= 0 ? '+' : ''}{change90.toFixed(2)}%
              </span>
            )}
          </div>
          {ohlcv.loading ? (
            <div style={{ height: 80, background: 'var(--muted)', borderRadius: 6, animation: 'pulse 1.5s ease infinite' }} />
          ) : closes.length > 1 ? (
            <Sparkline values={closes} width={280} height={80} strokeWidth={1.5} />
          ) : (
            <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 11 }}>
              No history available
            </div>
          )}
        </section>

        {/* Quote stats */}
        {(q || row) && (
          <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <StatTile label="Open"  value={fmtPrice(q?.open  ?? row?.open)} />
            <StatTile label="High"  value={fmtPrice(q?.high  ?? row?.high)} />
            <StatTile label="Low"   value={fmtPrice(q?.low   ?? row?.low)} />
            <StatTile label="Prev"  value={fmtPrice(q?.previousClose ?? row?.previousClose)} />
          </section>
        )}

        {/* Intelligence badges */}
        <section>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 7 }}>
            Intelligence Signals
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {/* Volatility */}
            <span className={`ds-badge ${
              volState === 'extreme' ? 'ds-pill-critical'
              : volState === 'elevated' ? 'ds-pill-medium'
              : volState === 'low' ? 'ds-pill-neutral'
              : 'ds-pill-blue'
            }`} style={{ fontSize: 9, padding: '2px 8px', fontWeight: 600 }}>
              {volState === 'extreme' ? '⚡ Extreme Vol' : volState === 'elevated' ? '△ Elevated Vol' : volState === 'low' ? '◎ Low Vol' : '◉ Normal Vol'}
            </span>

            {/* Momentum direction */}
            {momentumScore !== 0 && (
              <span className={`ds-badge ${momentumScore > 0 ? 'ds-pill-low' : 'ds-pill-high'}`} style={{ fontSize: 9, padding: '2px 8px', fontWeight: 600 }}>
                {momentumScore > 60 ? '▲▲ Strong Momentum' : momentumScore > 20 ? '▲ Positive Momentum' : momentumScore < -60 ? '▼▼ Negative Momentum' : '▼ Weak Momentum'}
              </span>
            )}

            {/* Anomaly */}
            {anomalyTag && (
              <span className="ds-badge ds-pill-medium" style={{ fontSize: 9, padding: '2px 8px', fontWeight: 600 }}>
                ⚑ {anomalyTag}
              </span>
            )}

            {/* Regime */}
            {regime.regime?.label && (
              <RegimeBadge regime={regime.regime.label as import('../../types').RegimeLabel} />
            )}
          </div>
        </section>

        {/* Intelligence note */}
        <section className="ds-surface" style={{ padding: 12, borderRadius: 10, background: 'rgba(193, 95, 60, 0.03)', border: '1px solid rgba(193, 95, 60, 0.1)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            Why is this moving?
          </div>
          <p style={{ fontSize: 11, color: 'var(--foreground)', lineHeight: 1.6, margin: 0 }}>
            {explanation}
          </p>
          <p style={{ fontSize: 9, color: 'var(--muted-foreground)', marginTop: 6, marginBottom: 0, fontStyle: 'italic' }}>
            Pattern-based analysis · Not financial advice
          </p>
        </section>

        {/* Regime volatility events */}
        {regime.ready && regime.volatilityEvent && (
          <section>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 7 }}>
              Volatility Context
            </div>
            <div className="ds-surface" style={{ padding: 10, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--foreground)', lineHeight: 1.5 }}>
                {regime.volatilityEvent.narrative}
              </div>
              {regime.volatilityEvent.payload.percentileRank != null && (
                <div style={{ marginTop: 6, fontSize: 10, color: 'var(--muted-foreground)' }}>
                  Volatility at {(regime.volatilityEvent.payload.percentileRank * 100).toFixed(0)}th historical percentile.
                </div>
              )}
            </div>
          </section>
        )}

        {/* Recent news */}
        <section>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 7 }}>
            Recent Headlines
          </div>
          {news.loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ height: 44, background: 'var(--muted)', borderRadius: 6, animation: 'pulse 1.5s ease infinite' }} />
              ))}
            </div>
          ) : (() => {
            const newsItems = Array.isArray(news.data) ? news.data : [];
            if (newsItems.length === 0) {
              return <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: 0 }}>No recent headlines.</p>;
            }
            return (
              <NewsList items={newsItems.map((n) => ({
                id: n.id, headline: n.headline, summary: n.summary,
                url: n.url, source: n.source, publishedAt: n.publishedAt,
              }))} max={5} />
            );
          })()}
        </section>
      </div>

      {/* V4: Symbol-level agent observations */}
      {symbolAgentOutputs.data.length > 0 && (
        <section style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)' }}>
            Intelligence
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {symbolAgentOutputs.data.slice(0, 3).map(o => (
              <IntelligenceObservationCard key={o.artifact_id} output={o} compact />
            ))}
          </div>
        </section>
      )}

      {/* Quick actions footer */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        gap: 6,
        flexShrink: 0,
        background: 'var(--card)',
      }}>
        <Link
          to={`/instruments/${encodeURIComponent(symbol)}`}
          style={{
            flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            gap: 5, padding: '7px 10px', borderRadius: 7,
            background: 'var(--primary)', color: 'var(--primary-foreground)',
            textDecoration: 'none', fontSize: 11, fontWeight: 600,
          }}
        >
          Open <ExternalLink size={11} />
        </Link>
        <button
          onClick={() => onSave?.(symbol)}
          title={isSaved ? 'In saved list' : 'Save instrument'}
          style={{
            width: 32, height: 32, borderRadius: 7,
            border: `1px solid ${isSaved ? 'var(--primary)' : 'var(--border)'}`,
            background: isSaved ? 'rgba(193,95,60,0.08)' : 'var(--card)',
            color: isSaved ? 'var(--primary)' : 'var(--muted-foreground)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Bookmark size={13} fill={isSaved ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={() => navigate('/research-copilot', { state: { prefill: `Analyse ${symbol}: why is it moving today?` } })}
          title="Ask Copilot"
          style={{
            width: 32, height: 32, borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--card)',
            color: 'var(--muted-foreground)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <MessageSquare size={13} />
        </button>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }`}</style>
    </div>
  );
};
