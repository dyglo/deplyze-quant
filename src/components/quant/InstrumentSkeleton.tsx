import React from 'react';

const SkeletonBlock: React.FC<{ h?: number | string; w?: number | string; style?: React.CSSProperties }> = ({
  h = 16, w = '100%', style,
}) => (
  <div
    className="ds-skeleton"
    style={{ height: h, width: w, borderRadius: 6, flexShrink: 0, ...style }}
  />
);

const SkeletonTile: React.FC = () => (
  <div className="ds-surface" style={{ padding: '12px 14px', borderRadius: 10, display: 'grid', gap: 8 }}>
    <SkeletonBlock h={10} w="60%" />
    <SkeletonBlock h={24} w="80%" />
    <SkeletonBlock h={10} w="40%" />
  </div>
);

const SkeletonMetricRow: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
    <SkeletonBlock h={10} w="45%" />
    <SkeletonBlock h={10} w="20%" />
  </div>
);

/** Full-page skeleton rendered while the quote / intel data resolves. */
export const InstrumentSkeleton: React.FC = () => (
  <div style={{ padding: '0 24px 48px', maxWidth: 1380, margin: '0 auto' }}>
    {/* Header placeholder */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '24px 0 20px' }}>
      <SkeletonBlock h={28} w={28} style={{ borderRadius: 8 }} />
      <SkeletonBlock h={22} w={180} />
    </div>

    {/* Quote stat tiles */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 10 }}>
      {Array.from({ length: 5 }).map((_, i) => <SkeletonTile key={i} />)}
    </div>

    {/* Analytics tiles */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
      {Array.from({ length: 4 }).map((_, i) => <SkeletonTile key={i} />)}
    </div>

    {/* Body */}
    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24 }}>
      {/* Left col */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
          <SkeletonBlock h={12} w={160} style={{ marginBottom: 12 }} />
          <SkeletonBlock h={240} />
        </div>
        <div className="ds-surface" style={{ padding: 16, borderRadius: 10 }}>
          <SkeletonBlock h={12} w={100} style={{ marginBottom: 10 }} />
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} h={12} w={`${70 + Math.random() * 25}%`} style={{ marginBottom: 8 }} />
          ))}
        </div>
      </div>

      {/* Right col */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Profile skeleton */}
        <div className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <SkeletonBlock h={32} w={32} style={{ borderRadius: 6 }} />
            <div style={{ flex: 1, display: 'grid', gap: 6 }}>
              <SkeletonBlock h={13} w="70%" />
              <SkeletonBlock h={10} w="50%" />
            </div>
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonBlock key={i} h={11} w={`${60 + i * 10}%`} style={{ marginBottom: 6 }} />
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} h={30} />)}
          </div>
        </div>

        {/* Metrics skeleton */}
        <div className="ds-surface" style={{ padding: 14, borderRadius: 10 }}>
          <SkeletonBlock h={12} w={100} style={{ marginBottom: 8 }} />
          <SkeletonBlock h={6} style={{ marginBottom: 12 }} />
          {Array.from({ length: 10 }).map((_, i) => <SkeletonMetricRow key={i} />)}
        </div>
      </div>
    </div>
  </div>
);
