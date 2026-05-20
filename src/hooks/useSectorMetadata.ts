/**
 * useSectorMetadata — auto-fill sector/industry for symbols whose
 * Firestore holdings are missing classification metadata.
 *
 * Calls `fetchCompanyProfile` from the fundamentals service (one request
 * per symbol, parallel, all settled). Results are cached in-memory across
 * renders by symbol. Failures degrade silently — returns the symbols we
 * could enrich.
 *
 * Used by the Portfolio Awareness Return Decomposition section so the
 * sector donut + sector-attribution table render even when holdings lack
 * a sector field.
 */

import { useEffect, useRef, useState } from 'react';
import { fetchCompanyProfile } from '../services/fundamentalsService';

export interface SectorClassification {
  symbol: string;
  sector: string | null;
  industry: string | null;
}

const cache: Map<string, SectorClassification> = new Map();
const inflight: Map<string, Promise<SectorClassification>> = new Map();

async function loadOne(symbol: string): Promise<SectorClassification> {
  const cached = cache.get(symbol);
  if (cached) return cached;
  const pending = inflight.get(symbol);
  if (pending) return pending;
  const job = (async () => {
    try {
      const profile = await fetchCompanyProfile(symbol);
      const entry: SectorClassification = {
        symbol,
        sector: profile?.sector ?? null,
        industry: profile?.industry ?? null,
      };
      cache.set(symbol, entry);
      return entry;
    } catch {
      const entry: SectorClassification = { symbol, sector: null, industry: null };
      cache.set(symbol, entry);
      return entry;
    } finally {
      inflight.delete(symbol);
    }
  })();
  inflight.set(symbol, job);
  return job;
}

export interface UseSectorMetadataResult {
  /** Sector by symbol, only present for symbols we successfully resolved. */
  bySymbol: Record<string, SectorClassification>;
  loading: boolean;
}

export function useSectorMetadata(symbols: string[]): UseSectorMetadataResult {
  const [bySymbol, setBySymbol] = useState<Record<string, SectorClassification>>(() => {
    const seed: Record<string, SectorClassification> = {};
    for (const s of symbols) {
      const c = cache.get(s);
      if (c) seed[s] = c;
    }
    return seed;
  });
  const [loading, setLoading] = useState<boolean>(() => symbols.some(s => !cache.has(s)));
  const lastKey = useRef<string>('');

  useEffect(() => {
    const key = symbols.slice().sort().join(',');
    if (key === lastKey.current) return;
    lastKey.current = key;
    if (symbols.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.allSettled(symbols.map(s => loadOne(s))).then(results => {
      if (cancelled) return;
      const next: Record<string, SectorClassification> = {};
      for (const r of results) {
        if (r.status === 'fulfilled') next[r.value.symbol] = r.value;
      }
      setBySymbol(prev => ({ ...prev, ...next }));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [symbols]);

  return { bySymbol, loading };
}
