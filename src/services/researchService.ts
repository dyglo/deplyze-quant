import { gatewayGet, gatewayPost } from './gatewayClient';

export interface WebResearch {
  query: string;
  answer?: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    publishedDate?: string;
  }>;
}

export async function researchWeb(opts: {
  q: string;
  topic?: 'general' | 'news' | 'finance';
  days?: number;
  depth?: 'basic' | 'advanced';
}): Promise<WebResearch> {
  return gatewayGet<WebResearch>('/research/web', opts);
}

export async function researchGoogle(q: string) {
  return gatewayGet<{
    organic: Array<{ title: string; link: string; snippet: string; position: number; date?: string }>;
    answer?: string;
  }>('/research/web/google', { q });
}

export async function synthesize(opts: {
  topic: string;
  evidence: Array<{ label: string; value: string | number; source?: string }>;
  category?: string;
}): Promise<string> {
  const r = await gatewayPost<{ narrative: string }>('/research/synthesize', opts);
  return r.narrative;
}
