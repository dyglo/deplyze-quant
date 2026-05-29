/**
 * providerLabels — maps internal provider IDs to neutral display labels.
 * Users never see vendor names; they see capability labels instead.
 */

export const PROVIDER_DISPLAY: Record<string, string> = {
  // Market data providers
  polygon:       'Real-time Quotes',
  finnhub:       'Market Data',
  twelve_data:   'Price & OHLCV',
  twelvedata:    'Price & OHLCV',
  fmp:           'Fundamentals',
  eodhd:         'Historical Data',
  // Macro & research
  alpha_vantage: 'Macro Series',
  alphavantage:  'Macro Series',
  tavily:        'Web Research',
  serper:        'News Search',
  // Intelligence & storage
  gemini:        'AI Synthesis',
  edgar:         'Public Filings',
  sec_edgar:     'Public Filings',
  firestore:     'Research Store',
  derived:       'Derived',
};

/**
 * Returns the neutral display label for a provider ID. The lookup is
 * case/space-insensitive so backend variants ("Finnhub", "Twelve Data")
 * resolve the same as the canonical id. Unknown values (real publisher
 * names) pass through unchanged.
 */
export function providerLabel(id: string): string {
  if (!id) return '';
  const key = id.toLowerCase().replace(/[\s-]+/g, '_');
  return PROVIDER_DISPLAY[key] ?? id.replace(/_/g, ' ');
}

/**
 * Maps internal provider IDs used in model definitions to readable
 * capability descriptions shown in the Model Observatory.
 */
export const MODEL_CAPABILITY_LABELS: Record<string, string> = {
  twelve_data:   'OHLCV feed',
  alpha_vantage: 'Macro series',
  finnhub:       'Market data',
  tavily:        'Web research',
  serper:        'News feed',
  gemini:        'AI synthesis',
  polygon:       'Real-time feed',
  fmp:           'Fundamentals',
  eodhd:         'Historical prices',
  edgar:         'Regulatory filings',
};

export function capabilityLabel(id: string): string {
  return MODEL_CAPABILITY_LABELS[id] ?? providerLabel(id);
}
