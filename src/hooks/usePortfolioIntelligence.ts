import { useState, useEffect, useMemo } from 'react';
import { subscribeToPortfolioObservations, acknowledgeObservation } from '../services/portfolioService';
import { generatePortfolioObservations, type PortfolioIntelligenceInput, type LocalObservation } from '../lib/portfolio/intelligenceEngine';
import type { PortfolioIntelligenceObservation } from '../lib/portfolio/schemas';

export interface CombinedObservation {
  id: string;
  source: 'firestore' | 'local';
  kind: PortfolioIntelligenceObservation['kind'];
  severity: PortfolioIntelligenceObservation['severity'];
  title: string;
  narrative: string;
  evidence?: Array<{ label: string; value: string | number }>;
  createdAt?: number;
}

export function usePortfolioIntelligence(
  portfolioId: string | undefined,
  input: PortfolioIntelligenceInput | null,
): {
  observations: CombinedObservation[];
  acknowledge: (id: string) => void;
} {
  const [firestoreObs, setFirestoreObs] = useState<PortfolioIntelligenceObservation[]>([]);

  useEffect(() => {
    if (!portfolioId) { setFirestoreObs([]); return; }
    return subscribeToPortfolioObservations(portfolioId, setFirestoreObs);
  }, [portfolioId]);

  const localObs: LocalObservation[] = useMemo(
    () => (input ? generatePortfolioObservations(input) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      input?.holdings.length,
      input?.annVol,
      input?.shortVol,
      input?.longVol,
      input?.portfolioReturn30D,
      input?.benchmarkReturn30D,
      input?.hhi,
      input?.top3Weight,
      input?.rollingBeta,
      input?.fractionTrendingDown,
      input?.maxDrawdownPct,
      input?.recentCorr,
      input?.priorCorr,
      input?.worstScenarioImpact,
    ],
  );

  const observations: CombinedObservation[] = useMemo(() => {
    const fromFirestore: CombinedObservation[] = firestoreObs.map(o => ({
      id: o.id,
      source: 'firestore',
      kind: o.kind,
      severity: o.severity,
      title: o.title,
      narrative: o.narrative,
      evidence: o.evidence,
      createdAt: o.createdAt,
    }));

    const fromLocal: CombinedObservation[] = localObs.map(o => ({
      ...o,
      source: 'local',
    }));

    // Firestore observations first (user-created or externally written), then local
    return [...fromFirestore, ...fromLocal];
  }, [firestoreObs, localObs]);

  const acknowledge = (id: string) => {
    acknowledgeObservation(id).catch(() => {});
  };

  return { observations, acknowledge };
}
