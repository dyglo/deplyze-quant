import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface WorkspaceCardBadge {
  label: string;
  variant: 'low' | 'neutral' | 'critical' | 'blue';
}

interface Props {
  title: string;
  question: string;
  route: string;
  icon: React.ReactNode;
  badge?: WorkspaceCardBadge;
  preview?: React.ReactNode;
  description?: string;
}

const BADGE_STYLES: Record<WorkspaceCardBadge['variant'], { bg: string; color: string }> = {
  low:      { bg: 'rgba(78,96,64,0.12)',    color: '#4E6040' },
  neutral:  { bg: 'rgba(138,134,128,0.12)', color: '#8A8680' },
  critical: { bg: 'rgba(193,95,60,0.12)',   color: 'var(--primary)' },
  blue:     { bg: 'rgba(106,155,204,0.1)',   color: 'var(--chart-3)' },
};

export const WorkspaceCard: React.FC<Props> = ({
  title, question, route, icon, badge, preview, description,
}) => {
  const navigate = useNavigate();
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(route)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(route)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--card)' : 'var(--background)',
        border: `1px solid ${hovered ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 12,
        padding: '18px 20px',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
        boxShadow: hovered ? '0 4px 20px rgba(193,95,60,0.07)' : '0 1px 4px rgba(0,0,0,0.04)',
        display: 'flex', flexDirection: 'column', gap: 12,
        userSelect: 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: hovered ? 'rgba(193,95,60,0.1)' : 'var(--muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: hovered ? 'var(--primary)' : 'var(--muted-foreground)',
            transition: 'background 0.15s, color 0.15s',
            flexShrink: 0,
          }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>
              {title}
            </div>
            {badge && (
              <span style={{
                display: 'inline-block', marginTop: 3,
                fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                textTransform: 'uppercase',
                background: BADGE_STYLES[badge.variant].bg,
                color: BADGE_STYLES[badge.variant].color,
                padding: '1px 6px', borderRadius: 4,
              }}>
                {badge.label}
              </span>
            )}
          </div>
        </div>
        <ChevronRight
          size={14}
          style={{
            color: hovered ? 'var(--primary)' : 'var(--border)',
            transition: 'color 0.15s, transform 0.15s',
            transform: hovered ? 'translateX(2px)' : 'none',
            marginTop: 4, flexShrink: 0,
          }}
        />
      </div>

      {preview && (
        <div style={{
          borderRadius: 7, overflow: 'hidden',
          background: 'var(--muted)',
          border: '1px solid var(--border)',
          minHeight: 64,
        }}>
          {preview}
        </div>
      )}

      <p style={{
        fontSize: 11, fontWeight: 500,
        color: 'var(--muted-foreground)',
        margin: 0, lineHeight: 1.5,
        fontStyle: 'italic',
      }}>
        {question}
      </p>

      {description && (
        <p style={{ fontSize: 10, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.5 }}>
          {description}
        </p>
      )}
    </div>
  );
};
