import { gatewayPost } from './gatewayClient';
import type { CopilotMessage } from '../types';

export interface CopilotContext {
  instruments?: string[];
  timeframe?: string;
  artifactIds?: string[];
}

export async function copilotChat(
  messages: Pick<CopilotMessage, 'role' | 'content'>[],
  context?: CopilotContext,
): Promise<string> {
  const r = await gatewayPost<{ reply: string }>('/copilot/chat', { messages, context });
  return r.reply;
}
