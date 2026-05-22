/**
 * FollowUpInput — single-line composer for follow-up questions on a completed
 * investigation. Submits a string; the parent decides whether to route the
 * question through `/followup-ask` (grounded Q&A) or `/followup-refine`
 * (re-run pipeline with a new plan).
 */

import React, { useState } from 'react';
import { Send, Sparkles } from 'lucide-react';

interface Props {
  busy: boolean;
  onAsk: (q: string) => void;
  /** Optional starter chips shown when the thread is empty. */
  starters?: string[];
}

export const FollowUpInput: React.FC<Props> = ({ busy, onAsk, starters }) => {
  const [text, setText] = useState('');

  const submit = () => {
    const q = text.trim();
    if (!q || busy) return;
    onAsk(q);
    setText('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={inputRow}>
        <Sparkles size={14} style={{ color: 'var(--muted-foreground)', flex: '0 0 auto' }} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder={busy ? 'Thinking…' : 'Ask a follow-up about this investigation…'}
          disabled={busy}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !text.trim()}
          style={{ ...sendBtn, opacity: !text.trim() || busy ? 0.5 : 1 }}
          aria-label="Ask follow-up"
        >
          <Send size={14} />
        </button>
      </div>
      {starters && starters.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {starters.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => onAsk(s)}
              style={chipBtn}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  );
};

const inputRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--card)',
};
const inputStyle: React.CSSProperties = {
  flex: 1,
  border: 'none', outline: 'none', background: 'transparent',
  color: 'var(--foreground)', fontSize: 13,
  minWidth: 0,
};
const sendBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--foreground)',
  cursor: 'pointer',
};
const chipBtn: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid var(--border)',
  borderRadius: 999,
  background: 'transparent',
  color: 'var(--muted-foreground)',
  fontSize: 11,
  cursor: 'pointer',
};
