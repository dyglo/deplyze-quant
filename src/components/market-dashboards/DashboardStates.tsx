import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// ─── Empty State ──────────────────────────────────────────────────────────────

export const DashboardEmptyState: React.FC<{
  icon?: React.ReactNode;
  message?: string;
  hint?: string;
}> = ({ icon, message = 'No data available', hint }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: '40px 16px',
    color: 'var(--muted-foreground)',
  }}>
    {icon && <div style={{ opacity: 0.35 }}>{icon}</div>}
    <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{message}</p>
    {hint && <p style={{ margin: 0, fontSize: 11 }}>{hint}</p>}
  </div>
);

// ─── Loading State ────────────────────────────────────────────────────────────

const SkeletonBar: React.FC<{ width?: string; height?: number }> = ({ width = '100%', height = 14 }) => (
  <div style={{
    width, height, borderRadius: 6,
    background: 'var(--muted)',
    animation: 'pulse 1.8s cubic-bezier(0.4,0,0.6,1) infinite',
  }} />
);

export const DashboardLoadingState: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <SkeletonBar width="14%" height={12} />
        <SkeletonBar width="30%" height={12} />
        <SkeletonBar width="12%" height={12} />
        <SkeletonBar width="12%" height={12} />
        <SkeletonBar width="18%" height={20} />
      </div>
    ))}
  </div>
);

// ─── Error State ──────────────────────────────────────────────────────────────

export const DashboardErrorState: React.FC<{
  message?: string;
  onRetry?: () => void;
}> = ({ message = 'Failed to load data', onRetry }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: '32px 16px',
    color: 'var(--muted-foreground)',
  }}>
    <AlertTriangle size={20} style={{ color: 'var(--primary)', opacity: 0.7 }} />
    <p style={{ margin: 0, fontSize: 12, fontWeight: 500 }}>{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--muted)', cursor: 'pointer',
          fontSize: 11, color: 'var(--foreground)',
        }}
      >
        <RefreshCw size={11} /> Retry
      </button>
    )}
  </div>
);

// ─── Source Freshness Badge ───────────────────────────────────────────────────

import type { FreshnessStatus } from '../../services/gatewayClient';
import { FreshnessBadge } from '../quant/FreshnessBadge';

export const SourceFreshnessBadge: React.FC<{
  source?: string;
  status: FreshnessStatus;
  fetchedAt: number | null;
}> = ({ source, status, fetchedAt }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
    {source && (
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--muted-foreground)', padding: '1px 6px',
        borderRadius: 999, border: '1px solid var(--border)', background: 'var(--muted)',
      }}>
        {source}
      </span>
    )}
    <FreshnessBadge status={status} fetchedAt={fetchedAt} compact />
  </div>
);
