/**
 * AwarenessSnapshotControl — subtle freshness-and-snapshot affordance for
 * the V5 P3 backend store. Lives in the page header strip.
 *
 *   "Snapshot fresh — 2h ago"          [ Snapshot now ]
 *
 * When a cached snapshot exists for the portfolio the freshness text
 * comes from `snapshot.generated_at`. When it doesn't, the text reads
 * "No backend snapshot yet" and the button persists the current
 * frontend-computed payload.
 *
 * Failure-soft: a 503 (engine not configured) renders the button
 * disabled with the explanation "Backend not configured".
 */

import React from 'react';
import { Loader2, Save, Check } from 'lucide-react';
import type { AwarenessSnapshot } from '../../../services/portfolioAwarenessService';

interface Props {
  snapshot: AwarenessSnapshot | null;
  loading: boolean;
  snapshotting: boolean;
  error: Error | null;
  onSnapshot: () => void;
}

function ageString(generatedAt: string | null | undefined): string | null {
  if (!generatedAt) return null;
  const t = new Date(generatedAt).getTime();
  if (!isFinite(t)) return null;
  const minutes = Math.max(0, (Date.now() - t) / 60_000);
  if (minutes < 1) return 'fresh';
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const AwarenessSnapshotControl: React.FC<Props> = ({
  snapshot,
  loading,
  snapshotting,
  error,
  onSnapshot,
}) => {
  const age = ageString(snapshot?.generated_at);
  const disabled = snapshotting || loading;
  const isBackendUnreachable = !!error && /5\d\d/.test(error.message);

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--muted-foreground)',
      }}>
        {loading
          ? 'Loading snapshot…'
          : snapshot
            ? `Snapshot · ${age ?? 'unknown'}`
            : isBackendUnreachable
              ? 'Snapshot unavailable'
              : 'No saved snapshot'}
      </span>

      <button
        onClick={onSnapshot}
        disabled={disabled}
        title={
          isBackendUnreachable
            ? 'Snapshot is unavailable right now'
            : 'Save this awareness view'
        }
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 6,
          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
          border: '1px solid var(--border)',
          background: disabled ? 'var(--muted)' : 'var(--card)',
          color: disabled ? 'var(--muted-foreground)' : 'var(--foreground)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {snapshotting ? (
          <>
            <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
            Snapshotting
          </>
        ) : snapshot ? (
          <>
            <Save size={10} />
            Snapshot now
          </>
        ) : (
          <>
            <Check size={10} />
            Persist snapshot
          </>
        )}
      </button>
    </div>
  );
};
