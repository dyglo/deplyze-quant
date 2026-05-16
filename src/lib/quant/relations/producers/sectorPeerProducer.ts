/**
 * Sector + peer structural producer — taxonomy-derived edges that anchor
 * the radial layout even when correlation windows are too short to derive
 * numerical strengths. Engine-derived edges supersede when matching tuples
 * are emitted later.
 */
import type { RelationsNode } from '../types';
import { classifySymbol, SECTOR_ETF, INDUSTRY_ETF } from '../taxonomy';
import { edgeId, type Producer, type ProducerContext, type ProducerOutput } from './types';

const SECTOR_STRENGTH = 0.7;
const PEER_STRENGTH   = 0.5;

export const sectorPeerProducer: Producer = {
  id: 'sector-peer',
  run(ctx: ProducerContext): ProducerOutput {
    const nodes: RelationsNode[] = [];
    const edges: ProducerOutput['edges'] = [];
    const skipped: ProducerOutput['skipped'] = [];
    const now = Date.now();

    const entry = classifySymbol(ctx.focal.symbol);
    if (!entry) {
      skipped.push({ id: `peer:${ctx.focal.symbol}`, reason: 'unknown sector' });
      return { producer: 'sector-peer', nodes, edges, skipped };
    }

    nodes.push({
      id: ctx.focal.symbol, kind: 'company', label: ctx.focal.symbol,
      meta: entry.industry ?? entry.sector,
      sector: entry.sector, cluster: `sector:${entry.sector}`,
    });

    const sectorEtf = SECTOR_ETF[entry.sector];
    if (sectorEtf) {
      nodes.push({
        id: sectorEtf, kind: 'etf', label: sectorEtf,
        meta: `${entry.sector} sector ETF`, sector: entry.sector,
        cluster: `sector:${entry.sector}`,
      });
      edges.push({
        id: edgeId('sector-dependency', ctx.focal.symbol, sectorEtf),
        kind: 'sector-dependency',
        source: ctx.focal.symbol, target: sectorEtf,
        strength: SECTOR_STRENGTH,
        producedBy: 'sector-peer', derivedAt: now,
      });
    }

    if (entry.industry) {
      const industryEtf = INDUSTRY_ETF[entry.industry];
      if (industryEtf && industryEtf !== sectorEtf) {
        nodes.push({
          id: industryEtf, kind: 'etf', label: industryEtf,
          meta: `${entry.industry} ETF`, sector: entry.sector,
          cluster: `industry:${entry.industry}`,
        });
        edges.push({
          id: edgeId('sector-dependency', ctx.focal.symbol, industryEtf),
          kind: 'sector-dependency',
          source: ctx.focal.symbol, target: industryEtf,
          strength: SECTOR_STRENGTH + 0.1,
          producedBy: 'sector-peer', derivedAt: now,
        });
      }
    }

    for (const peer of Object.keys(ctx.peers)) {
      const peerEntry = classifySymbol(peer);
      nodes.push({
        id: peer, kind: 'company', label: peer,
        meta: peerEntry ? (peerEntry.industry ?? peerEntry.sector) : 'peer',
        sector: peerEntry?.sector ?? entry.sector,
        cluster: `sector:${entry.sector}`,
      });
      edges.push({
        id: edgeId('thematic', ctx.focal.symbol, peer),
        kind: 'thematic',
        source: ctx.focal.symbol, target: peer,
        strength: PEER_STRENGTH,
        producedBy: 'sector-peer', derivedAt: now,
      });
    }

    for (const bench of Object.keys(ctx.benchmarks)) {
      nodes.push({ id: bench, kind: 'benchmark', label: bench, meta: 'Benchmark', cluster: 'benchmarks' });
    }
    for (const macro of Object.keys(ctx.macros)) {
      nodes.push({
        id: macro, kind: macroKind(macro), label: macro,
        meta: macroMeta(macro), cluster: 'macro',
      });
    }
    return { producer: 'sector-peer', nodes, edges, skipped };
  },
};

function macroKind(symbol: string): RelationsNode['kind'] {
  switch (symbol) {
    case 'DXY':  return 'currency';
    case 'GLD':  return 'commodity';
    case 'TLT':  return 'treasury';
    case 'VIX':  return 'vol-regime';
    default:     return 'macro';
  }
}
function macroMeta(symbol: string): string {
  switch (symbol) {
    case 'DXY': return 'US dollar index';
    case 'GLD': return 'Gold';
    case 'TLT': return '20Y+ Treasury ETF';
    case 'VIX': return 'S&P 500 implied vol';
    default:    return 'Macro proxy';
  }
}
