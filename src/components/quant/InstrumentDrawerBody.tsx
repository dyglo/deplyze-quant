import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useOHLCV, useNews, useQuote } from '../../hooks/useMarket';
import { AssetIcon } from './AssetIcon';
import { FreshnessBadge, SourceBadge } from './FreshnessBadge';
import { Sparkline } from './Sparkline';
import { NewsList } from './NewsList';
import { ExternalLink } from 'lucide-react';

export const InstrumentDrawerBody: React.FC<{ symbol: string }> = ({ symbol }) => {
  const quote = useQuote(symbol);
  const ohlcv = useOHLCV(symbol, '1day', 90);
  const news = useNews({ symbol, limit: 6 });

  const closes = useMemo(() => (ohlcv.data?.bars ?? []).map((b) => b.close), [ohlcv.data]);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const change90 = first && last ? ((last - first) / first) * 100 : null;

  const q = quote.data;
  const dp = q?.changePercent;
  const deltaColor = dp == null ? 'var(--muted-foreground)' : dp > 0 ? '#4E6040' : dp < 0 ? 'var(--primary)' : 'var(--muted-foreground)';

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Header summary */}
      <section style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <AssetIcon symbol={symbol} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {q?.price != null ? q.price.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}
            </span>
            {dp != null && (
              <span style={{ fontSize: 13, color: deltaColor, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {dp > 0 ? '▲' : '▼'} {Math.abs(dp).toFixed(2)}%
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
            {q?.source && <SourceBadge source={q.source} />}
            <FreshnessBadge status={quote.status} fetchedAt={quote.fetchedAt} compact />
          </div>
        </div>
      </section>

      {/* Mini chart */}
      <section className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>90-day close</span>
          {change90 != null && (
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: change90 >= 0 ? '#4E6040' : 'var(--primary)',
            }}>
              {change90 >= 0 ? '+' : ''}{change90.toFixed(2)}%
            </span>
          )}
        </div>
        {ohlcv.loading ? (
          <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 11 }}>Loading…</div>
        ) : closes.length > 1 ? (
          <Sparkline values={closes} width={460} height={90} strokeWidth={1.5} />
        ) : (
          <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 11 }}>
            No daily series available for {symbol}.
          </div>
        )}
      </section>

      {/* Quote stats */}
      {q && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { l: 'Open',  v: q.open },
            { l: 'High',  v: q.high },
            { l: 'Low',   v: q.low },
            { l: 'Prev',  v: q.previousClose },
          ].map((s) => (
            <div key={s.l} className="ds-surface" style={{ padding: '8px 10px', borderRadius: 8 }}>
              <div className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{s.l}</div>
              <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {s.v != null ? s.v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Recent headlines */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 className="ds-heading" style={{ margin: 0 }}>Recent headlines</h3>
          <FreshnessBadge status={news.status} fetchedAt={news.fetchedAt} compact />
        </div>
        {news.loading ? (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Loading…</p>
        ) : (news.data ?? []).length === 0 ? (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>No symbol news in the last 7 days.</p>
        ) : (
          <NewsList items={(news.data ?? []).map((n) => ({
            id: n.id, headline: n.headline, summary: n.summary, url: n.url,
            source: n.source, publishedAt: n.publishedAt,
          }))} max={6} />
        )}
      </section>

      <div style={{ display: 'flex', gap: 8 }}>
        <Link
          to={`/instruments/${encodeURIComponent(symbol)}`}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Open instrument page <ExternalLink size={12} />
        </Link>
      </div>
    </div>
  );
};
