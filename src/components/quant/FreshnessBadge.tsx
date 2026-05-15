import React from 'react';
import type { FreshnessStatus } from '../../services/gatewayClient';
import { providerLabel } from '../../lib/providerLabels';

function relTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_COLOR: Record<FreshnessStatus, { dot: string; fg: string; bg: string }> = {
  live:   { dot: '#4E6040', fg: '#4E6040', bg: 'rgba(78,96,64,0.10)' },
  cached: { dot: 'var(--chart-3)', fg: 'var(--chart-3)', bg: 'rgba(120,120,140,0.10)' },
  stale:  { dot: 'var(--primary)', fg: 'var(--primary)', bg: 'rgba(193,95,60,0.10)' },
  error:  { dot: '#b04848', fg: '#b04848', bg: 'rgba(176,72,72,0.12)' },
};

export const FreshnessBadge: React.FC<{
  status: FreshnessStatus;
  fetchedAt: number | null;
  compact?: boolean;
}> = ({ status, fetchedAt, compact }) => {
  const c = STATUS_COLOR[status];
  const label = compact
    ? status.toUpperCase()
    : `${status.toUpperCase()} · ${relTime(fetchedAt)}`;
  return (
    <span
      title={fetchedAt ? new Date(fetchedAt).toLocaleString() : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        border: '1px solid color-mix(in srgb, currentColor 25%, transparent)',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {label}
    </span>
  );
};

export const SourceBadge: React.FC<{ source: string }> = ({ source }) => (
  <span
    style={{
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: 'var(--muted-foreground)',
      padding: '1px 6px',
      borderRadius: 999,
      border: '1px solid var(--border)',
      background: 'var(--muted)',
    }}
  >
    {providerLabel(source)}
  </span>
);
