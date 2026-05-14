/**
 * Serper adapter — Google Search API for fast news/web discovery.
 * Docs: https://serper.dev/api
 */

import { getJson, requireEnv } from './http';

const BASE = 'https://google.serper.dev';
function key() { return requireEnv('SERPER_API_KEY'); }

export interface SerperNewsItem {
  title: string;
  link: string;
  snippet: string;
  source: string;
  date?: string;
  imageUrl?: string;
  position: number;
}

interface SerperNewsResp {
  news?: SerperNewsItem[];
}

export async function searchNews(query: string, num = 10): Promise<SerperNewsItem[]> {
  const resp = await getJson<SerperNewsResp>('serper', `${BASE}/news`, {
    method: 'POST',
    headers: { 'X-API-KEY': key(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num }),
  });
  return resp.news ?? [];
}

export interface SerperOrganic {
  title: string;
  link: string;
  snippet: string;
  position: number;
  date?: string;
}

interface SerperWebResp {
  organic?: SerperOrganic[];
  answerBox?: { answer?: string; snippet?: string };
}

export async function searchWeb(query: string, num = 10): Promise<{
  organic: SerperOrganic[];
  answer?: string;
}> {
  const resp = await getJson<SerperWebResp>('serper', `${BASE}/search`, {
    method: 'POST',
    headers: { 'X-API-KEY': key(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num }),
  });
  return {
    organic: resp.organic ?? [],
    answer: resp.answerBox?.answer ?? resp.answerBox?.snippet,
  };
}
