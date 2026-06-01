/**
 * FollowUpThread — renders the Q&A list that lives on a completed
 * report. Each turn shows the user's question and the grounded answer.
 *
 * Grounding is enforced gateway-side (the LLM is told to cite only the
 * observation list). The thread is plain text — no markdown — to match the
 * tone of the ReasoningPanel.
 */

import React from 'react';
import { User, Sparkles } from 'lucide-react';

export interface FollowupTurn {
  id: string;
  question: string;
  answer: string;
  ts: number;
}

interface Props {
  turns: FollowupTurn[];
  busy?: boolean;
}

export const FollowUpThread: React.FC<Props> = ({ turns, busy }) => {
  if (turns.length === 0 && !busy) {
    return (
      <div style={emptyStyle}>
        Ask a follow-up to dig into any chart, drawdown, or regime above. The model can only cite numbers that already appear in the Observations panel.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {turns.map((t) => (
        <div key={t.id} style={turnStyle}>
          <div style={row}>
            <span style={iconWrap}><User size={12} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={role}>You</div>
              <div style={text}>{t.question}</div>
            </div>
          </div>
          <div style={row}>
            <span style={iconWrap}><Sparkles size={12} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={role}>Research</div>
              <div style={text}>{t.answer}</div>
            </div>
          </div>
        </div>
      ))}
      {busy && (
        <div style={row}>
          <span style={iconWrap}><Sparkles size={12} /></span>
          <div style={{ ...text, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>Thinking…</div>
        </div>
      )}
    </div>
  );
};

const emptyStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--muted-foreground)',
  lineHeight: 1.55,
};
const turnStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10,
  paddingBottom: 12,
  borderBottom: '1px dashed var(--border)',
};
const row: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8 };
const iconWrap: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 6,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid var(--border)',
  color: 'var(--muted-foreground)',
  flex: '0 0 auto',
  marginTop: 1,
};
const role: React.CSSProperties = {
  fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase',
  color: 'var(--muted-foreground)', marginBottom: 2,
};
const text: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.55, color: 'var(--foreground)',
};
