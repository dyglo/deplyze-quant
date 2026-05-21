import React, { useState } from 'react';
import { Info } from 'lucide-react';

export const InfoTip: React.FC<{ text: string }> = ({ text }) => {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Info size={12} style={{ color: 'var(--muted-foreground)', cursor: 'help' }} />
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            top: '100%', left: '50%', transform: 'translate(-50%, 6px)',
            zIndex: 5,
            padding: '6px 10px',
            background: 'var(--popover, var(--card))',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 11,
            lineHeight: 1.4,
            color: 'var(--foreground)',
            whiteSpace: 'normal',
            width: 220,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
};
