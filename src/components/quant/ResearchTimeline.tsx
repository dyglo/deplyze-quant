import React from 'react';
import { Link } from 'react-router-dom';
import { Brain, FileText, FlaskConical, MessageSquare } from 'lucide-react';
import type { TimelineEvent } from '../../types';

const KIND_CONFIG = {
  artifact: { label: 'Intelligence', icon: Brain, color: 'var(--primary)' },
  briefing: { label: 'Briefing', icon: FileText, color: '#4e6eaf' },
  labSession: { label: 'Quant Lab', icon: FlaskConical, color: '#4E6040' },
  insight: { label: 'Copilot Insight', icon: MessageSquare, color: '#9e7e3a' },
} as const;

interface Props {
  events: TimelineEvent[];
  loading: boolean;
  onOpenArtifact?: (id: string) => void;
}

export const ResearchTimeline: React.FC<Props> = ({ events, loading, onOpenArtifact }) => {
  if (loading) {
    return <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '24px 0' }}>Loading timeline…</p>;
  }
  if (!events.length) {
    return (
      <div className="ds-empty" style={{ minHeight: 200 }}>
        <p className="ds-heading">No research history yet</p>
        <p className="ds-caption" style={{ maxWidth: 320, textAlign: 'center' }}>
          Generate briefings, save Quant Lab sessions, or save Copilot insights to build your research timeline.
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', paddingLeft: 24 }}>
      {/* Vertical line */}
      <div style={{
        position: 'absolute', left: 7, top: 8, bottom: 0,
        width: 2, background: 'var(--border)',
      }} />

      <div style={{ display: 'grid', gap: 12 }}>
        {events.map((event) => {
          const cfg = KIND_CONFIG[event.kind];
          const Icon = cfg.icon;
          return (
            <div key={`${event.kind}-${event.id}`} style={{ position: 'relative', paddingLeft: 20 }}>
              {/* Timeline dot */}
              <div style={{
                position: 'absolute', left: -19, top: 12,
                width: 10, height: 10, borderRadius: '50%',
                background: cfg.color, border: '2px solid var(--background)',
              }} />
              <TimelineRow event={event} cfg={cfg} Icon={Icon} onOpenArtifact={onOpenArtifact} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TimelineRow: React.FC<{
  event: TimelineEvent;
  cfg: { label: string; color: string };
  Icon: React.ElementType;
  onOpenArtifact?: (id: string) => void;
}> = ({ event, cfg, Icon, onOpenArtifact }) => {
  const timestamp = new Date(event.createdAt).toLocaleString();

  if (event.kind === 'artifact') {
    const a = event.data;
    return (
      <button
        onClick={() => onOpenArtifact?.(a.id)}
        className="ds-surface ds-transition"
        style={{ padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Icon size={12} style={{ color: cfg.color }} />
          <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{cfg.label} · {a.category}</span>
          <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginLeft: 'auto' }}>{timestamp}</span>
        </div>
        <p className="ds-body" style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{a.title}</p>
        {a.symbols?.length ? (
          <p className="ds-caption" style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>{a.symbols.join(', ')}</p>
        ) : null}
      </button>
    );
  }

  if (event.kind === 'briefing') {
    const b = event.data;
    return (
      <Link
        to={`/briefings/${b.id}`}
        className="ds-surface ds-transition"
        style={{ padding: '10px 12px', borderRadius: 8, textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Icon size={12} style={{ color: cfg.color }} />
          <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{cfg.label} · {b.kind}</span>
          <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginLeft: 'auto' }}>{timestamp}</span>
        </div>
        <p className="ds-body" style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{b.title}</p>
      </Link>
    );
  }

  if (event.kind === 'labSession') {
    const s = event.data;
    return (
      <div className="ds-surface" style={{ padding: '10px 12px', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Icon size={12} style={{ color: cfg.color }} />
          <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{cfg.label} · {s.panel}</span>
          <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginLeft: 'auto' }}>{timestamp}</span>
        </div>
        <p className="ds-body" style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{s.name}</p>
        <p className="ds-caption" style={{ margin: '4px 0 0', color: 'var(--muted-foreground)' }}>
          {s.symbols.join(', ')}
          {Object.entries(s.summary).slice(0, 2).map(([k, v]) => ` · ${k}: ${v}`).join('')}
        </p>
      </div>
    );
  }

  // insight
  const i = event.data;
  return (
    <div className="ds-surface" style={{ padding: '10px 12px', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Icon size={12} style={{ color: cfg.color }} />
        <span className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{cfg.label}</span>
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginLeft: 'auto' }}>{timestamp}</span>
      </div>
      <p className="ds-body" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        {i.content.slice(0, 200)}{i.content.length > 200 ? '…' : ''}
      </p>
    </div>
  );
};
