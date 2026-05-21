/**
 * CommandBar — the landing's primary input, restyled to read as a search /
 * command surface (magnifier glyph, "press ? for commands" hint) rather than
 * a chat input. Replaces the previous QueryBar on the landing.
 *
 * Submit on Enter; Shift+Enter inserts a newline. Disabled while busy.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Search, ArrowRight, CornerDownLeft } from 'lucide-react';

interface Props {
  busy: boolean;
  initial?: string;
  onSubmit: (query: string) => void;
  placeholder?: string;
}

export const CommandBar: React.FC<Props> = ({
  busy, initial = '', onSubmit,
  placeholder = 'Search or ask a historical question — press ? to see prompts',
}) => {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [showHint, setShowHint] = useState(true);

  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => { setShowHint(!value); }, [value]);

  // Auto-grow textarea
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [value]);

  const submit = () => {
    const v = value.trim();
    if (!v || busy) return;
    onSubmit(v);
  };

  return (
    <div style={wrap}>
      <div style={iconWrap}>
        <Search size={16} style={{ color: 'var(--muted-foreground)' }} />
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        disabled={busy}
        style={textarea}
      />
      {showHint && !busy && (
        <span style={kbdHint}>
          <kbd style={kbd}>↵</kbd>
          <span style={{ opacity: 0.7 }}>to submit</span>
        </span>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy || !value.trim()}
        style={{
          ...submitBtn,
          opacity: !value.trim() || busy ? 0.5 : 1,
          cursor: busy || !value.trim() ? 'not-allowed' : 'pointer',
        }}
        aria-label="Submit"
      >
        {busy ? 'Working…' : (
          <>
            <span>Investigate</span>
            <ArrowRight size={13} />
          </>
        )}
      </button>
    </div>
  );
};

// ─── styles ───────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 14px',
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--card)',
  boxShadow: '0 1px 0 rgba(0,0,0,0.02)',
};

const iconWrap: React.CSSProperties = {
  width: 24, height: 24,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  flex: '0 0 auto',
};

const textarea: React.CSSProperties = {
  flex: 1,
  resize: 'none',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: 'var(--foreground)',
  font: 'inherit',
  fontSize: 14.5,
  lineHeight: 1.5,
  padding: '4px 0',
  minHeight: 24,
  maxHeight: 160,
};

const kbdHint: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 11,
  color: 'var(--muted-foreground)',
  flex: '0 0 auto',
};

const kbd: React.CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
  fontSize: 11,
  padding: '1px 6px',
  border: '1px solid var(--border)',
  borderRadius: 4,
  background: 'var(--muted)',
  color: 'var(--foreground)',
};

const submitBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 14px',
  border: '1px solid var(--primary)',
  borderRadius: 8,
  background: 'var(--primary)',
  color: 'var(--primary-foreground)',
  fontSize: 13,
  fontWeight: 500,
  flex: '0 0 auto',
};
