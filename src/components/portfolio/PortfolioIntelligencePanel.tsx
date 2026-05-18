import React, { useState } from 'react';
import { ChevronDown, ChevronUp, X, Activity, AlertTriangle, Info, Zap, TrendingDown, GitBranch, BarChart2 } from 'lucide-react';
import type { CombinedObservation } from '../../hooks/usePortfolioIntelligence';
import type { PortfolioIntelligenceKind, IntelligenceSeverity } from '../../lib/portfolio/schemas';

// ─── Severity styling ─────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<IntelligenceSeverity, { bg: string; border: string; dot: string; label: string }> = {
  high:   { bg: 'color-mix(in srgb, var(--destructive) 8%, transparent)',  border: 'color-mix(in srgb, var(--destructive) 22%, transparent)',  dot: 'var(--destructive)',  label: 'HIGH'   },
  medium: { bg: 'color-mix(in srgb, var(--chart-4)    8%, transparent)',   border: 'color-mix(in srgb, var(--chart-4)    22%, transparent)',   dot: 'var(--chart-4)',      label: 'MED'    },
  low:    { bg: 'color-mix(in srgb, var(--chart-2)    6%, transparent)',   border: 'color-mix(in srgb, var(--chart-2)    18%, transparent)',   dot: 'var(--chart-2)',      label: 'LOW'    },
  info:   { bg: 'color-mix(in srgb, var(--primary)    6%, transparent)',   border: 'color-mix(in srgb, var(--primary)    16%, transparent)',   dot: 'var(--primary)',      label: 'INFO'   },
};

const KIND_ICONS: Record<PortfolioIntelligenceKind, React.ReactNode> = {
  concentration_warning:  <BarChart2 size={11} />,
  correlation_shift:      <GitBranch size={11} />,
  regime_alignment:       <Activity size={11} />,
  volatility_anomaly:     <AlertTriangle size={11} />,
  benchmark_divergence:   <TrendingDown size={11} />,
  narrative_exposure:     <Info size={11} />,
  macro_sensitivity:      <Zap size={11} />,
  liquidity_sensitivity:  <Activity size={11} />,
  drawdown_clustering:    <TrendingDown size={11} />,
  breadth_deterioration:  <TrendingDown size={11} />,
  factor_rotation:        <GitBranch size={11} />,
};

// ─── Single observation card ──────────────────────────────────────────────────

const ObservationCard: React.FC<{
  obs: CombinedObservation;
  onAcknowledge: (id: string) => void;
}> = ({ obs, onAcknowledge }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[obs.severity];

  return (
    <div
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 7,
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Severity dot */}
        <div style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: cfg.dot,
          flexShrink: 0,
        }} />

        {/* Kind icon */}
        <span style={{ color: cfg.dot, flexShrink: 0, display: 'flex' }}>
          {KIND_ICONS[obs.kind]}
        </span>

        {/* Severity badge */}
        <span style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.07em',
          color: cfg.dot,
          flexShrink: 0,
        }}>
          {cfg.label}
        </span>

        {/* Title */}
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--foreground)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {obs.title}
        </span>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
          {expanded ? <ChevronUp size={11} style={{ color: 'var(--muted-foreground)' }} /> : <ChevronDown size={11} style={{ color: 'var(--muted-foreground)' }} />}
          {obs.source === 'firestore' && (
            <button
              onClick={(e) => { e.stopPropagation(); onAcknowledge(obs.id); }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
                color: 'var(--muted-foreground)',
              }}
              title="Dismiss"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '0 10px 10px' }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.65 }}>
            {obs.narrative}
          </p>
          {obs.evidence && obs.evidence.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {obs.evidence.map(e => (
                <div
                  key={e.label}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'var(--muted)',
                    border: '1px solid var(--border)',
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: 'var(--muted-foreground)' }}>{e.label}: </span>
                  <span style={{ fontWeight: 700, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>{e.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Panel ────────────────────────────────────────────────────────────────────

export const PortfolioIntelligencePanel: React.FC<{
  observations: CombinedObservation[];
  onAcknowledge: (id: string) => void;
  /** Limit visible without expanding the panel */
  previewCount?: number;
}> = ({ observations, onAcknowledge, previewCount = 2 }) => {
  const [open, setOpen] = useState(true);

  if (observations.length === 0) return null;

  const highCount  = observations.filter(o => o.severity === 'high').length;
  const medCount   = observations.filter(o => o.severity === 'medium').length;
  const shown      = open ? observations : observations.slice(0, previewCount);
  const hasMore    = !open && observations.length > previewCount;

  return (
    <div style={{
      margin: '12px 24px 0',
      border: '1px solid var(--border)',
      borderRadius: 9,
      overflow: 'hidden',
      background: 'var(--card)',
    }}>
      {/* Panel header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setOpen(o => !o)}
      >
        <Activity size={12} style={{ color: 'var(--primary)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', flex: 1 }}>
          Portfolio Intelligence
        </span>

        {/* Severity summary chips */}
        <div style={{ display: 'flex', gap: 5 }}>
          {highCount > 0 && (
            <span style={{
              padding: '1px 7px', borderRadius: 4, fontSize: 9, fontWeight: 800,
              background: 'color-mix(in srgb, var(--destructive) 12%, transparent)',
              color: 'var(--destructive)',
              border: '1px solid color-mix(in srgb, var(--destructive) 25%, transparent)',
            }}>
              {highCount} HIGH
            </span>
          )}
          {medCount > 0 && (
            <span style={{
              padding: '1px 7px', borderRadius: 4, fontSize: 9, fontWeight: 800,
              background: 'color-mix(in srgb, var(--chart-4) 10%, transparent)',
              color: 'var(--chart-4)',
              border: '1px solid color-mix(in srgb, var(--chart-4) 22%, transparent)',
            }}>
              {medCount} MED
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
            {observations.length} signal{observations.length !== 1 ? 's' : ''}
          </span>
        </div>

        {open ? <ChevronUp size={12} style={{ color: 'var(--muted-foreground)' }} /> : <ChevronDown size={12} style={{ color: 'var(--muted-foreground)' }} />}
      </div>

      {/* Observation list */}
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shown.map(obs => (
          <ObservationCard key={obs.id} obs={obs} onAcknowledge={onAcknowledge} />
        ))}
        {hasMore && (
          <button
            onClick={() => setOpen(true)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 10, color: 'var(--muted-foreground)', padding: '2px 0',
              textAlign: 'left',
            }}
          >
            +{observations.length - previewCount} more signal{observations.length - previewCount !== 1 ? 's' : ''} — click to expand
          </button>
        )}
      </div>
    </div>
  );
};
