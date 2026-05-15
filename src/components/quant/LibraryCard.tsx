import React from 'react';
import { Pin } from 'lucide-react';
import type { IntelligenceArtifact } from '../../types';
import { typeColor } from '../../hooks/useLibraryStats';

interface Props {
  artifact: IntelligenceArtifact;
  onOpen: (id: string) => void;
  isPinned: boolean;
}

function relativeTime(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

function resolveMs(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  return ts?.toMillis?.() ?? 0;
}

export const LibraryCard: React.FC<Props> = ({ artifact, onOpen, isPinned }) => {
  const type = artifact.artifactType ?? artifact.category;
  const color = typeColor(type);
  const ms = resolveMs(artifact.updatedAt ?? artifact.createdAt);
  const confidence = artifact.confidenceScore ?? artifact.confidence;
  const symbols = artifact.symbols ?? [];
  const displaySymbols = symbols.slice(0, 3);
  const extraSymbols = symbols.length - 3;

  return (
    <button
      onClick={() => onOpen(artifact.id)}
      className="ds-surface ds-transition"
      style={{
        padding: 12, borderRadius: 8, border: 'none',
        cursor: 'pointer', textAlign: 'left', width: '100%',
        display: 'grid', gap: 6,
      }}
    >
      {/* Row 1: type + freshness + pin */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          background: `${color}22`, color, borderRadius: 4,
          padding: '2px 6px', fontSize: 10, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0,
        }}>
          {type.replace(/_/g, ' ')}
        </span>
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginLeft: 'auto', flexShrink: 0 }}>
          {ms ? relativeTime(ms) : ''}
        </span>
        {isPinned && <Pin size={10} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
      </div>

      {/* Row 2: title */}
      <p style={{
        margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.4,
        color: 'var(--foreground)',
        display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {artifact.title}
      </p>

      {/* Row 3: symbols */}
      {displaySymbols.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {displaySymbols.map(s => (
            <span key={s} className="ds-badge" style={{ fontSize: 10 }}>{s}</span>
          ))}
          {extraSymbols > 0 && (
            <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>+{extraSymbols}</span>
          )}
        </div>
      )}

      {/* Row 4: confidence bar + tags */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {confidence != null && (
          <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2 }}>
            <div style={{
              width: `${Math.round(confidence * 100)}%`,
              height: '100%', background: color, borderRadius: 2,
            }} />
          </div>
        )}
        {artifact.tags?.slice(0, 2).map(t => (
          <span key={t} className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{t}</span>
        ))}
      </div>
    </button>
  );
};
