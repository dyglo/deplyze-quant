import { researchWeb } from '../services/researchService';
import { useSWR } from './useSWR';

export function useWebResearch(query: string | null, opts: {
  topic?: 'general' | 'news' | 'finance';
  days?: number;
} = {}) {
  const key = query ? `research:${query}:${opts.topic ?? ''}:${opts.days ?? ''}` : undefined;
  return useSWR(
    () => (query ? researchWeb({ q: query, ...opts }) : Promise.resolve(null)),
    [query, opts.topic, opts.days],
    { cacheKey: key },
  );
}
