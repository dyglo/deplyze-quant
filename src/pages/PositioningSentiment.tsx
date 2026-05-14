import React, { useMemo, useState } from 'react';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import { FreshnessBadge } from '../components/quant/FreshnessBadge';
import { useDrawer } from '../components/quant/DataDrawer';
import { useHeadlines, useNews } from '../hooks/useMarket';
import { useWebResearch } from '../hooks/useResearch';
import { HeadlineDrawerBody } from '../components/quant/HeadlineDrawerBody';
import { scoreText, aggregate, type SentimentLabel } from '../lib/sentiment';

const PRESETS = [
  { id: 'macro', label: 'Macro',   query: 'global markets risk-on risk-off sentiment' },
  { id: 'tech',  label: 'Tech',    query: 'tech stocks AAPL NVDA MSFT sentiment' },
  { id: 'fx',    label: 'FX',      query: 'dollar DXY euro yen sentiment' },
  { id: 'crypto',label: 'Crypto',  query: 'bitcoin ethereum crypto sentiment' },
] as const;

type PresetId = typeof PRESETS[number]['id'];

const LABEL_COLOR: Record<SentimentLabel, string> = {
  positive: '#4E6040',
  negative: 'var(--primary)',
  neutral:  'var(--muted-foreground)',
};

interface HeadlineRow {
  id: string;
  title: string;
  snippet?: string;
  url: string;
  source: string;
  publishedAt?: number;
  label: SentimentLabel;
  score: number;
}

export const PositioningSentiment: React.FC = () => {
  const drawer = useDrawer();
  const [preset, setPreset] = useState<PresetId>('macro');
  const current = PRESETS.find((p) => p.id === preset)!;

  const finn = useNews({ category: 'general', limit: 20 });
  const serper = useHeadlines(current.query);
  const tavily = useWebResearch(current.query, { topic: 'finance', days: 7 });

  const rows: HeadlineRow[] = useMemo(() => {
    const out: HeadlineRow[] = [];
    for (const n of finn.data ?? []) {
      const text = `${n.headline}. ${n.summary ?? ''}`;
      const s = scoreText(text);
      out.push({
        id: `finn-${n.id}`, title: n.headline, snippet: n.summary, url: n.url,
        source: n.source, publishedAt: n.publishedAt, label: s.label, score: s.score,
      });
    }
    for (const h of serper.data ?? []) {
      const text = `${h.title}. ${h.snippet ?? ''}`;
      const s = scoreText(text);
      out.push({
        id: `serper-${h.link}`, title: h.title, snippet: h.snippet, url: h.link,
        source: h.source, publishedAt: h.date ? Date.parse(h.date) || undefined : undefined,
        label: s.label, score: s.score,
      });
    }
    for (const r of tavily.data?.results ?? []) {
      const text = `${r.title}. ${r.content ?? ''}`;
      const s = scoreText(text);
      let host = 'tavily';
      try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
      out.push({
        id: `tavily-${r.url}`, title: r.title, snippet: r.content, url: r.url,
        source: host, publishedAt: r.publishedDate ? Date.parse(r.publishedDate) || undefined : undefined,
        label: s.label, score: s.score,
      });
    }
    // Dedup by URL
    const seen = new Set<string>();
    return out.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)));
  }, [finn.data, serper.data, tavily.data]);

  const stats = useMemo(
    () => aggregate(rows.map((r) => ({ text: `${r.title} ${r.snippet ?? ''}`, source: r.source }))),
    [rows],
  );

  const groupedBySource = useMemo(() => {
    const m = new Map<string, HeadlineRow[]>();
    for (const r of rows) {
      if (!m.has(r.source)) m.set(r.source, []);
      m.get(r.source)!.push(r);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  }, [rows]);

  const loading = finn.loading || serper.loading || tavily.loading;
  const status = finn.status; // representative for the freshness badge

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Positioning & Sentiment"
        subtitle="Headline-mood proxy across Tavily, Serper, and Finnhub. COT positioning ingestion is pending — CFTC data is not yet wired."
        actions={<FreshnessBadge status={status} fetchedAt={finn.fetchedAt} compact />}
      />

      {/* COT pending banner */}
      <section className="ds-surface" style={{ padding: 12, borderRadius: 10, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>
          <p className="ds-heading" style={{ margin: 0 }}>COT positioning — pending</p>
          <p className="ds-caption" style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>
            CFTC weekly Commitments of Traders ingestion is not wired in V1. When available, net non-commercial
            positioning and z-scored extremes will appear here.
          </p>
        </div>
        <span style={{
          padding: '4px 10px', borderRadius: 999,
          background: 'var(--muted)', border: '1px solid var(--border)',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
        }}>not wired</span>
      </section>

      {/* Preset bar */}
      <nav style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => {
          const on = preset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              style={{
                padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                background: on ? 'rgba(193, 95, 60, 0.06)' : 'transparent',
                color: 'var(--foreground)', cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </nav>

      {/* Sentiment cards */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 18 }}>
        {(['positive', 'neutral', 'negative'] as SentimentLabel[]).map((lbl) => {
          const count = stats.counts[lbl];
          return (
            <article key={lbl} className="ds-surface" style={{ padding: 12, borderRadius: 10 }}>
              <div className="ds-label" style={{ color: LABEL_COLOR[lbl], textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.06em', fontWeight: 700 }}>
                {lbl}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', marginTop: 4 }}>
                {count}
              </div>
              <div className="ds-caption" style={{ color: 'var(--muted-foreground)', marginTop: 2 }}>
                headlines
              </div>
            </article>
          );
        })}
        <article className="ds-surface" style={{ padding: 12, borderRadius: 10 }}>
          <div className="ds-label" style={{ color: 'var(--muted-foreground)', textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.06em', fontWeight: 700 }}>
            Avg score
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: stats.avgScore >= 0 ? '#4E6040' : 'var(--primary)', marginTop: 4 }}>
            {stats.avgScore >= 0 ? '+' : ''}{stats.avgScore.toFixed(2)}
          </div>
          <div className="ds-caption" style={{ color: 'var(--muted-foreground)', marginTop: 2 }}>
            −1 (bear) … +1 (bull)
          </div>
        </article>
      </section>

      <p className="ds-caption" style={{ color: 'var(--muted-foreground)', marginBottom: 8 }}>
        <strong>Method:</strong> rule-based keyword scorer over headlines + snippets. Not an ML sentiment model.
        Useful as a coarse proxy; meaningful when source diversity is high.
      </p>

      {/* Tavily narrative */}
      {tavily.data?.answer && (
        <section className="ds-surface" style={{ padding: 12, borderRadius: 10, marginBottom: 18 }}>
          <div className="ds-label" style={{ color: 'var(--muted-foreground)', marginBottom: 4 }}>Web-research synthesis (Tavily)</div>
          <p className="ds-body" style={{ margin: 0, lineHeight: 1.55 }}>{tavily.data.answer}</p>
        </section>
      )}

      {loading && !rows.length && (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Loading headlines…</p>
      )}

      {/* Clusters by source */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {groupedBySource.map(([src, list]) => {
          const counts = list.reduce(
            (acc, r) => { acc[r.label]++; return acc; },
            { positive: 0, negative: 0, neutral: 0 } as Record<SentimentLabel, number>,
          );
          return (
            <article key={src} className="ds-surface" style={{ padding: 12, borderRadius: 10, display: 'grid', gap: 8 }}>
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="ds-heading" style={{ margin: 0 }}>{src}</span>
                <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>{list.length} items</span>
              </header>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['positive', 'neutral', 'negative'] as SentimentLabel[]).map((lbl) => (
                  <span key={lbl} style={{
                    padding: '2px 7px', borderRadius: 999,
                    border: `1px solid color-mix(in srgb, ${LABEL_COLOR[lbl]} 30%, transparent)`,
                    color: LABEL_COLOR[lbl], fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}>
                    {lbl[0]} {counts[lbl]}
                  </span>
                ))}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                {list.slice(0, 4).map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => drawer.open({
                        title: r.title,
                        subtitle: `${src} · ${r.label}`,
                        body: <HeadlineDrawerBody item={{
                          title: r.title, summary: r.snippet, url: r.url,
                          source: r.source, publishedAt: r.publishedAt,
                        }} />,
                      })}
                      style={{
                        textAlign: 'left', width: '100%', padding: 0,
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--foreground)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: LABEL_COLOR[r.label], flexShrink: 0 }} />
                        <span className="ds-body" style={{
                          fontSize: 12, lineHeight: 1.35,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {r.title}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <Disclaimer />
    </div>
  );
};
