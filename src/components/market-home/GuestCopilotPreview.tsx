import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { useAuthGate } from '../auth/AuthGate';
import { useCopilotSession } from '../../hooks/useCopilotSession';

/**
 * GuestCopilotPreview — a capped, read-only taste of the research assistant for
 * anonymous visitors. The `/copilot/chat` gateway route accepts anonymous
 * tokens (it is NOT behind requireFullAccount), so guests can ask a couple of
 * questions and see a real answer before being asked to create a workspace.
 *
 * Continuity model: the guest's anonymous session is preserved on upgrade, so
 * the conversation they start here carries into the full Copilot after signup.
 *
 * SCAFFOLD: this component is intentionally not yet mounted into a route. To
 * surface it, drop <GuestCopilotPreview /> into the guest branch of MarketHome
 * (e.g. inside a SectionBoundary) or a dedicated public /copilot teaser.
 */

const GUEST_MESSAGE_CAP = 2;

const SAMPLE_PROMPTS = [
  'Summarise the current macro regime in one paragraph.',
  'What does a steepening 2s10s usually imply for equities?',
];

export const GuestCopilotPreview: React.FC = () => {
  const { isGuest } = useAuth();
  const { requireAuth } = useAuthGate();
  const session = useCopilotSession();
  const [input, setInput] = useState('');

  // Only guests get the preview; full accounts use the real /copilot page.
  if (!isGuest) return null;

  const guestTurns = session.messages.filter((m) => m.role === 'user').length;
  const capped = guestTurns >= GUEST_MESSAGE_CAP;

  const upsell = () =>
    requireAuth({
      title: 'Continue with the research assistant',
      description: 'Create a free workspace to keep asking, save answers as research, and unlock full context. Your session carries over.',
    });

  const submit = (text: string) => {
    const q = text.trim();
    if (!q || session.sending) return;
    if (capped) { upsell(); return; }
    setInput('');
    void session.send(q);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      padding: '16px 18px', borderRadius: 12,
      background: 'var(--card)', border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--foreground)' }}>
          Ask the research assistant
        </p>
        <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)' }}>
          {Math.max(0, GUEST_MESSAGE_CAP - guestTurns)} free question{GUEST_MESSAGE_CAP - guestTurns === 1 ? '' : 's'} left
        </span>
      </div>

      {session.messages.length === 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => submit(p)}
              className="ds-transition-fast"
              style={{
                textAlign: 'left', fontSize: 11.5, lineHeight: 1.35,
                padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                background: 'var(--muted)', color: 'var(--foreground)',
                border: '1px solid var(--border)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {session.messages.map((m) => (
        <div
          key={m.id}
          style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '92%',
            fontSize: 12.5, lineHeight: 1.5,
            padding: '8px 12px', borderRadius: 10,
            background: m.role === 'user' ? 'var(--primary)' : 'var(--muted)',
            color: m.role === 'user' ? 'var(--primary-foreground)' : 'var(--foreground)',
          }}
        >
          {m.role === 'assistant'
            ? <div className="ds-markdown"><ReactMarkdown>{m.content}</ReactMarkdown></div>
            : m.content}
        </div>
      ))}

      {session.sending && (
        <span style={{ fontSize: 11.5, color: 'var(--muted-foreground)' }}>Thinking…</span>
      )}
      {session.error && (
        <span style={{ fontSize: 11.5, color: 'var(--destructive, #d33)' }}>
          The assistant is temporarily unavailable.
        </span>
      )}

      {capped ? (
        <button
          onClick={upsell}
          className="ds-transition-fast"
          style={{
            height: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--primary)', color: 'var(--primary-foreground)',
            fontSize: 12.5, fontWeight: 600,
          }}
        >
          Create Workspace to continue
        </button>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); submit(input); }}
          style={{ display: 'flex', gap: 8, alignItems: 'center' }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about markets, macro, or an instrument…"
            style={{
              flex: 1, height: 36, padding: '0 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--background)',
              color: 'var(--foreground)', fontSize: 12.5,
            }}
          />
          <button
            type="submit"
            disabled={session.sending || !input.trim()}
            aria-label="Send"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              height: 36, width: 36, borderRadius: 8, border: 'none',
              background: 'var(--primary)', color: 'var(--primary-foreground)',
              cursor: session.sending || !input.trim() ? 'default' : 'pointer',
              opacity: session.sending || !input.trim() ? 0.5 : 1,
            }}
          >
            <Send size={15} />
          </button>
        </form>
      )}
    </div>
  );
};
