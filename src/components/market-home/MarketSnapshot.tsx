import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useSWR } from '../../hooks/useSWR';
import { SectionCard } from './SectionCard';
import { SnapshotTable } from './SnapshotTable';
import {
  fetchSnapshot,
  SNAPSHOT_ASSET_CLASSES,
  type SnapshotAssetClass,
} from '../../services/marketHomeService';

export const MarketSnapshot: React.FC = () => {
  const [active, setActive] = useState<SnapshotAssetClass>('indices');
  const meta = SNAPSHOT_ASSET_CLASSES.find((m) => m.id === active)!;

  const { data, loading, error } = useSWR(
    () => fetchSnapshot(active),
    [active],
    { cacheKey: `marketHome:snapshot:${active}` },
  );

  return (
    <SectionCard
      title="Market Snapshot"
      subtitle="Live cross-asset quotes"
      action={meta.viewMore ? (
        <Link to={meta.viewMore} className="ds-transition-fast" style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 11, fontWeight: 600, color: 'var(--primary)', textDecoration: 'none',
        }}>
          View more <ArrowUpRight size={12} />
        </Link>
      ) : undefined}
    >
      <div role="tablist" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
        {SNAPSHOT_ASSET_CLASSES.map((m) => {
          const isActive = m.id === active;
          return (
            <button
              key={m.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(m.id)}
              className="ds-transition-fast"
              style={{
                fontSize: 11.5,
                fontWeight: isActive ? 700 : 500,
                padding: '5px 11px',
                borderRadius: 999,
                border: '1px solid',
                borderColor: isActive ? 'var(--primary)' : 'var(--border)',
                background: isActive ? 'color-mix(in srgb, var(--primary) 12%, var(--card))' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--muted-foreground)',
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <SnapshotTable rows={data ?? []} loading={loading} error={error?.message} />
    </SectionCard>
  );
};
