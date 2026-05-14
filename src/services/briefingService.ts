import { gatewayPost } from './gatewayClient';
import type { Briefing } from '../types';

export type BriefingGenerateKind =
  | 'daily-pulse'
  | 'daily-macro'
  | 'instrument-snapshot'
  | 'cross-asset'
  | 'sentiment';

export interface BriefingGenerateRequest {
  kind: BriefingGenerateKind;
  workspaceId: string;
  projectId: string;
  params?: { symbol?: string; symbols?: string[]; query?: string };
}

export async function generateBriefing(
  req: BriefingGenerateRequest,
): Promise<{ id: string; briefing: Briefing }> {
  return gatewayPost<{ id: string; briefing: Briefing }>('/briefings/generate', req);
}
