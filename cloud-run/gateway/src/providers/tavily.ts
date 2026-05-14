/**
 * Tavily adapter — AI-curated web search for market intelligence.
 * Docs: https://docs.tavily.com
 */

import { getJson, requireEnv } from './http';

const BASE = 'https://api.tavily.com';
function key() { return requireEnv('TAVILY_API_KEY'); }

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

interface TavilyResp {
  query: string;
  answer?: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    published_date?: string;
  }>;
}

export interface TavilySearch {
  query: string;
  answer?: string;
  results: TavilyResult[];
}

export async function search(query: string, opts: {
  searchDepth?: 'basic' | 'advanced';
  maxResults?: number;
  topic?: 'general' | 'news' | 'finance';
  days?: number;
  includeAnswer?: boolean;
} = {}): Promise<TavilySearch> {
  const body = {
    api_key: key(),
    query,
    search_depth: opts.searchDepth ?? 'basic',
    max_results: opts.maxResults ?? 8,
    topic: opts.topic ?? 'general',
    days: opts.days,
    include_answer: opts.includeAnswer ?? true,
  };
  const resp = await getJson<TavilyResp>('tavily', `${BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    query: resp.query,
    answer: resp.answer,
    results: resp.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
      publishedDate: r.published_date,
    })),
  };
}
