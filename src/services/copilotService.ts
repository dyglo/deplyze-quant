import { gatewayPost } from './gatewayClient';
import type { CopilotMessage } from '../types';

export interface CopilotContext {
  instruments?: string[];
  timeframe?: string;
  artifactIds?: string[];
  /** Resolved awareness tone for the user. When present the gateway appends a
   *  one-line depth/posture instruction to the Copilot system prompt. */
  awareness_tone?: {
    depth: 'concise' | 'standard' | 'deep';
    posture: 'defensive' | 'neutral' | 'aggressive';
  } | null;
}

export async function copilotChat(
  messages: Pick<CopilotMessage, 'role' | 'content'>[],
  context?: CopilotContext,
): Promise<string> {
  const r = await gatewayPost<{ reply: string }>('/copilot/chat', { messages, context });
  return r.reply;
}
