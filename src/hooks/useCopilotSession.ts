import { useCallback, useState } from 'react';
import { copilotChat, type CopilotContext } from '../services/copilotService';
import type { CopilotMessage } from '../types';

let _id = 0;
const nextId = () => `m_${Date.now()}_${++_id}`;

export interface CopilotSession {
  messages: CopilotMessage[];
  sending: boolean;
  error: Error | null;
  send: (content: string, contextChips?: CopilotMessage['contextChips']) => Promise<void>;
  reset: () => void;
}

/**
 * useCopilotSession
 *
 * `contextResolver` is invoked every send. It returns a snapshot of the
 * caller's current page state (selected symbol, latest pulse quotes, macro
 * highlights, opened artifact) which we serialise as a synthetic `system`
 * message at the front of the dialogue. The gateway already enforces
 * compliance footers via the Gemini wrapper, so this is safe.
 */
export function useCopilotSession(
  initial: CopilotMessage[] = [],
  contextResolver?: () => { context: CopilotContext; snapshot?: string } | null,
): CopilotSession {
  const [messages, setMessages] = useState<CopilotMessage[]>(initial);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const send = useCallback(async (content: string, contextChips?: CopilotMessage['contextChips']) => {
    const userMsg: CopilotMessage = {
      id: nextId(), role: 'user', content, createdAt: Date.now(), contextChips,
    };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    setError(null);
    try {
      const resolved = contextResolver?.();
      const ctxFromChips: CopilotContext | undefined = contextChips ? {
        instruments: contextChips.filter((c) => c.kind === 'instrument').map((c) => c.value),
        timeframe: contextChips.find((c) => c.kind === 'timeframe')?.value,
        artifactIds: contextChips.filter((c) => c.kind === 'artifact').map((c) => c.value),
      } : undefined;
      const mergedCtx: CopilotContext | undefined = resolved || ctxFromChips ? {
        instruments: Array.from(new Set([
          ...(resolved?.context.instruments ?? []),
          ...(ctxFromChips?.instruments ?? []),
        ])),
        timeframe: resolved?.context.timeframe ?? ctxFromChips?.timeframe,
        artifactIds: Array.from(new Set([
          ...(resolved?.context.artifactIds ?? []),
          ...(ctxFromChips?.artifactIds ?? []),
        ])),
      } : undefined;

      const dialogue = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
      const head = resolved?.snapshot
        ? [{ role: 'system' as const, content: resolved.snapshot }]
        : [];

      const reply = await copilotChat([...head, ...dialogue], mergedCtx);
      const reply2: CopilotMessage = { id: nextId(), role: 'assistant', content: reply, createdAt: Date.now() };
      setMessages((prev) => [...prev, reply2]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSending(false);
    }
  }, [messages, contextResolver]);

  const reset = useCallback(() => { setMessages([]); setError(null); }, []);

  return { messages, sending, error, send, reset };
}
