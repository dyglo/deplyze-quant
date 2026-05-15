/**
 * providerLabels — maps internal provider IDs to neutral display labels.
 * Users never see vendor names; they see capability labels instead.
 */

export const PROVIDER_DISPLAY: Record<string, string> = {
  // Market data providers
  polygon:       'Real-time Quotes',
  finnhub:       'Market Data',
  twelve_data:   'Price & OHLCV',
  fmp:           'Fundamentals',
  eodhd:         'Historical Data',
  // Macro & research
  alpha_vantage: 'Macro Series',
  tavily:        'Web Research',
  serper:        'News Search',
  // Intelligence & storage
  gemini:        'AI Synthesis',
  edgar:         'Public Filings',
  firestore:     'Research Store',
  derived:       'Derived',
};

/** Returns the neutral display label for a provider ID. */
export function providerLabel(id: string): string {
  return PROVIDER_DISPLAY[id] ?? id.replace(/_/g, ' ');
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
