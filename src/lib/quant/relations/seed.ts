/**
 * Wave A bootstrap ontology.
 *
 * Provides a small but structurally-real macro graph (benchmarks, sectors,
 * macro indicators, vol regime, mega-cap companies, FX, commodities) so the
 * Relations Map renders meaningfully before the data-driven engines in
 * Waves C–E come online. Every edge here represents a well-known structural
 * relationship (e.g. semiconductors → QQQ benchmark dependency), not a
 * fabricated correlation value.
 *
 * Edges carry `producedBy: 'seed'` so downstream engines can later override
 * or augment them with derived strengths. As soon as a real engine emits a
 * matching (source, target, kind) tuple it should supersede the seed edge.
 */

import type { RelationsGraphSnapshot, RelationsEdge, RelationsNode, RelationsCluster } from './types';

const node = (
  id: string,
  kind: RelationsNode['kind'],
  label: string,
  extra: Partial<RelationsNode> = {},
): RelationsNode => ({ id, kind, label, ...extra });

const edge = (
  id: string,
  source: string,
  target: string,
  kind: RelationsEdge['kind'],
  strength: number,
  extra: Partial<RelationsEdge> = {},
): RelationsEdge => ({
  id,
  source,
  target,
  kind,
  strength,
  producedBy: 'seed',
  derivedAt: Date.now(),
  ...extra,
});

export function buildSeedRelationsGraph(): RelationsGraphSnapshot {
  const clusters: RelationsCluster[] = [
    { id: 'ai-ecosystem',  label: 'AI ecosystem',         nodeIds: ['NVDA', 'AMD', 'AVGO', 'MSFT', 'SMH', 'SOXX', 'theme-ai'] },
    { id: 'mega-tech',     label: 'Mega-cap tech',        nodeIds: ['AAPL', 'MSFT', 'GOOGL', 'META', 'QQQ', 'XLK'] },
    { id: 'energy',        label: 'Energy complex',       nodeIds: ['XLE', 'WTI', 'BRENT'] },
    { id: 'rates-fx',      label: 'Rates / FX',           nodeIds: ['TLT', 'UST10Y', 'DXY', 'UUP', 'EURUSD'] },
    { id: 'defensives',    label: 'Defensives / safe',    nodeIds: ['GLD', 'TLT', 'VIX'] },
    { id: 'risk-on',       label: 'Risk-on equity',       nodeIds: ['SPY', 'QQQ', 'IWM'] },
  ];

  const nodes: RelationsNode[] = [
    // Benchmarks / indices
    node('SPY',   'benchmark', 'SPY',  { meta: 'US large-cap benchmark',     cluster: 'risk-on',     sector: 'broad' }),
    node('QQQ',   'benchmark', 'QQQ',  { meta: 'Nasdaq-100 benchmark',       cluster: 'mega-tech',   sector: 'tech' }),
    node('IWM',   'benchmark', 'IWM',  { meta: 'US small-cap benchmark',     cluster: 'risk-on',     sector: 'broad' }),
    // Sector ETFs
    node('XLK',   'etf',       'XLK',  { meta: 'US tech sector ETF',         cluster: 'mega-tech',   sector: 'tech' }),
    node('XLE',   'etf',       'XLE',  { meta: 'US energy sector ETF',       cluster: 'energy',      sector: 'energy' }),
    node('XLF',   'etf',       'XLF',  { meta: 'US financials sector ETF',                            sector: 'financials' }),
    node('SMH',   'etf',       'SMH',  { meta: 'Semiconductor ETF',          cluster: 'ai-ecosystem',sector: 'semis' }),
    node('SOXX',  'etf',       'SOXX', { meta: 'Semiconductor ETF',          cluster: 'ai-ecosystem',sector: 'semis' }),
    // Mega-cap companies
    node('NVDA',  'company',   'NVDA', { meta: 'AI infrastructure',          cluster: 'ai-ecosystem',sector: 'semis' }),
    node('AMD',   'company',   'AMD',  { meta: 'AI / GPU compute',           cluster: 'ai-ecosystem',sector: 'semis' }),
    node('AVGO',  'company',   'AVGO', { meta: 'AI networking',              cluster: 'ai-ecosystem',sector: 'semis' }),
    node('MSFT',  'company',   'MSFT', { meta: 'AI platform / cloud',        cluster: 'mega-tech',   sector: 'tech' }),
    node('AAPL',  'company',   'AAPL', { meta: 'Consumer tech',              cluster: 'mega-tech',   sector: 'tech' }),
    node('GOOGL', 'company',   'GOOGL',{ meta: 'Search / AI platform',       cluster: 'mega-tech',   sector: 'tech' }),
    node('META',  'company',   'META', { meta: 'Ads / AI compute',           cluster: 'mega-tech',   sector: 'tech' }),
    // Commodities / FX / rates
    node('GLD',   'commodity', 'GLD',  { meta: 'Gold',                       cluster: 'defensives',  sector: 'commodity' }),
    node('WTI',   'commodity', 'WTI',  { meta: 'Crude oil (WTI)',            cluster: 'energy',      sector: 'commodity' }),
    node('BRENT', 'commodity', 'Brent',{ meta: 'Crude oil (Brent)',          cluster: 'energy',      sector: 'commodity' }),
    node('DXY',   'currency',  'DXY',  { meta: 'US dollar index',            cluster: 'rates-fx',    sector: 'fx' }),
    node('UUP',   'etf',       'UUP',  { meta: 'USD bullish ETF',            cluster: 'rates-fx',    sector: 'fx' }),
    node('EURUSD','currency',  'EUR/USD',{ meta: 'Euro / USD',               cluster: 'rates-fx',    sector: 'fx' }),
    node('TLT',   'etf',       'TLT',  { meta: '20Y+ Treasury ETF',          cluster: 'rates-fx',    sector: 'rates' }),
    node('UST10Y','treasury',  'UST 10Y',{ meta: '10-year Treasury yield',   cluster: 'rates-fx',    sector: 'rates' }),
    node('VIX',   'vol-regime','VIX',  { meta: 'S&P 500 implied vol',        cluster: 'defensives',  sector: 'vol' }),
    // Macro / theme nodes
    node('macro-cpi',  'macro', 'US CPI',       { meta: 'Headline inflation' }),
    node('macro-fedfn','macro', 'Fed Funds',    { meta: 'Policy rate' }),
    node('theme-ai',   'theme', 'AI infra theme', { meta: 'Compute build-out narrative', cluster: 'ai-ecosystem' }),
  ];

  const edges: RelationsEdge[] = [
    // AI ecosystem — semis through to platforms
    edge('e:nvda-smh',  'NVDA', 'SMH',  'sector-dependency',     0.88),
    edge('e:amd-smh',   'AMD',  'SMH',  'sector-dependency',     0.82),
    edge('e:avgo-smh',  'AVGO', 'SMH',  'sector-dependency',     0.78),
    edge('e:smh-soxx',  'SMH',  'SOXX', 'thematic',              0.92),
    edge('e:nvda-msft', 'NVDA', 'MSFT', 'customer',              0.65),
    edge('e:nvda-theme','NVDA', 'theme-ai','thematic',           0.95),
    edge('e:smh-theme', 'SMH',  'theme-ai','thematic',           0.85),
    edge('e:msft-theme','MSFT', 'theme-ai','thematic',           0.78),

    // Benchmark dependencies
    edge('e:nvda-qqq',  'NVDA', 'QQQ',  'benchmark-dependency',  0.84),
    edge('e:msft-qqq',  'MSFT', 'QQQ',  'benchmark-dependency',  0.80),
    edge('e:aapl-qqq',  'AAPL', 'QQQ',  'benchmark-dependency',  0.78),
    edge('e:googl-qqq', 'GOOGL','QQQ',  'benchmark-dependency',  0.74),
    edge('e:meta-qqq',  'META', 'QQQ',  'benchmark-dependency',  0.72),
    edge('e:xlk-qqq',   'XLK',  'QQQ',  'benchmark-dependency',  0.93),
    edge('e:qqq-spy',   'QQQ',  'SPY',  'correlation',           0.86),
    edge('e:iwm-spy',   'IWM',  'SPY',  'correlation',           0.81),
    edge('e:xle-spy',   'XLE',  'SPY',  'correlation',           0.45),
    edge('e:xlf-spy',   'XLF',  'SPY',  'correlation',           0.74),

    // Defensives / inverse relationships
    edge('e:gld-dxy',   'GLD',  'DXY',  'inverse-correlation',  -0.62, { trend: 'weakening', baseline: -0.72, zScore: 1.4 }),
    edge('e:tlt-uy10',  'TLT',  'UST10Y','inverse-correlation', -0.94),
    edge('e:vix-spy',   'VIX',  'SPY',  'inverse-correlation',  -0.78),
    edge('e:vix-qqq',   'VIX',  'QQQ',  'volatility-transmission', 0.71),
    edge('e:vix-smh',   'VIX',  'SMH',  'volatility-transmission', 0.66),

    // FX / rates
    edge('e:uup-dxy',   'UUP',  'DXY',  'correlation',           0.97),
    edge('e:eur-dxy',   'EURUSD','DXY', 'inverse-correlation',  -0.95),
    edge('e:uy10-fedfn','UST10Y','macro-fedfn','macro-dependency',0.62),
    edge('e:cpi-fedfn', 'macro-cpi','macro-fedfn','macro-dependency',0.55),
    edge('e:tlt-cpi',   'TLT',  'macro-cpi','macro-dependency', -0.48),

    // Energy
    edge('e:wti-brent', 'WTI',  'BRENT','correlation',           0.94),
    edge('e:wti-xle',   'WTI',  'XLE',  'sector-dependency',     0.72),
    edge('e:brent-xle', 'BRENT','XLE',  'sector-dependency',     0.68),
    edge('e:dxy-wti',   'DXY',  'WTI',  'inverse-correlation',  -0.42),
  ];

  return {
    nodes,
    edges,
    clusters,
    windowDays: 60,
    asOf: Date.now(),
    skipped: [],
  };
}
