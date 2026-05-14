import React from 'react';
import { ExternalLink } from 'lucide-react';

export interface NewsListItem {
  id: string;
  headline: string;
  summary?: string;
  url: string;
  source: string;
  publishedAt: number;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const NewsList: React.FC<{ items: NewsListItem[]; max?: number }> = ({ items, max = 12 }) => (
  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
    {items.slice(0, max).map((n) => (
      <li key={n.id} className="ds-surface" style={{ padding: '10px 12px', borderRadius: 8 }}>
        <a href={n.url} target="_blank" rel="noreferrer" style={{
          display: 'block', textDecoration: 'none', color: 'inherit',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{n.source}</span>
            <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>{timeAgo(n.publishedAt)}</span>
          </div>
          <div className="ds-heading" style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span>{n.headline}</span>
            <ExternalLink size={11} style={{ color: 'var(--muted-foreground)' }} />
          </div>
          {n.summary ? (
            <p className="ds-caption" style={{ marginTop: 4, color: 'var(--muted-foreground)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {n.summary}
            </p>
          ) : null}
        </a>
      </li>
    ))}
  </ul>
);
