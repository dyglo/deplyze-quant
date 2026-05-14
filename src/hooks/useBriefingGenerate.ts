import { useCallback, useState } from 'react';
import { generateBriefing, type BriefingGenerateRequest } from '../services/briefingService';
import type { Briefing } from '../types';

export interface BriefingGenerateState {
  generating: boolean;
  error: Error | null;
  last: Briefing | null;
  run: (req: BriefingGenerateRequest) => Promise<Briefing | null>;
  reset: () => void;
}

export function useBriefingGenerate(): BriefingGenerateState {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [last, setLast] = useState<Briefing | null>(null);

  const run = useCallback(async (req: BriefingGenerateRequest) => {
    setGenerating(true);
    setError(null);
    try {
      const { briefing } = await generateBriefing(req);
      setLast(briefing);
      return briefing;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      return null;
    } finally {
      setGenerating(false);
    }
  }, []);

  const reset = useCallback(() => { setLast(null); setError(null); }, []);

  return { generating, error, last, run, reset };
}
