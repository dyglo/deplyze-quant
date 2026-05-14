import React from 'react';
import { ExternalLink } from 'lucide-react';

export interface HeadlinePayload {
  title: string;
  summary?: string;
  url: string;
  source: string;
  publishedAt?: number;
  symbols?: string[];
  image?: string;
}

function fmtDate(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export const HeadlineDrawerBody: React.FC<{ item: HeadlinePayload }> = ({ item }) => (
  <div style={{ display: 'grid', gap: 12 }}>
    {item.image && (
      <img
        src={item.image}
        alt=""
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
      />
    )}
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--primary)', padding: '2px 6px', borderRadius: 999,
        background: 'rgba(193,95,60,0.10)', border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
      }}>{item.source}</span>
      {item.publishedAt && (
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>{fmtDate(item.publishedAt)}</span>
      )}
      {item.symbols && item.symbols.length > 0 && (
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
          · {item.symbols.slice(0, 5).join(', ')}
        </span>
      )}
    </div>
    {item.summary && (
      <p className="ds-body" style={{ lineHeight: 1.5, color: 'var(--foreground)' }}>{item.summary}</p>
    )}
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        borderRadius: 8,
        background: 'var(--primary)',
        color: 'var(--primary-foreground)',
        textDecoration: 'none',
        fontSize: 12,
        fontWeight: 600,
        width: 'fit-content',
      }}
    >
      Open source <ExternalLink size={12} />
    </a>
  </div>
);
