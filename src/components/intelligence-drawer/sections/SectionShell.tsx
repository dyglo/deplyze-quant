/**
 * SectionShell — shared chrome for intelligence drawer sections.
 *
 * Renders a consistent header (uppercase eyebrow + optional badge) and frames
 * the section's content with consistent spacing. Sections call this rather
 * than re-implementing their own header/padding.
 */
import React from 'react';

interface SectionShellProps {
  label: string;
  /** Right-aligned eyebrow content (e.g. a count or status). */
  badge?: React.ReactNode;
  children: React.ReactNode;
  /** Drop the top border for sections that follow tightly grouped content. */
  flush?: boolean;
}

export const SectionShell: React.FC<SectionShellProps> = ({ label, badge, children, flush }) => {
  return (
    <section
      style={{
        padding: '14px 16px',
        borderTop: flush ? 'none' : '1px solid var(--border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted-foreground)',
          }}
        >
          {label}
        </span>
        {badge && <div style={{ flexShrink: 0 }}>{badge}</div>}
      </div>
      {children}
    </section>
  );
};

export const SectionEmpty: React.FC<{ message: string }> = ({ message }) => (
  <p
    style={{
      margin: 0,
      fontSize: 11,
      color: 'var(--muted-foreground)',
      fontStyle: 'italic',
    }}
  >
    {message}
  </p>
);

export const SectionLoading: React.FC<{ rows?: number }> = ({ rows = 2 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        style={{
          height: 28,
          borderRadius: 6,
          background: 'var(--muted)',
          animation: 'pulse 1.6s ease infinite',
        }}
      />
    ))}
  </div>
);
