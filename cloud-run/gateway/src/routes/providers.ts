/**
 * /v1/providers — provider health, configuration status, and observability.
 * Now includes all V2 providers: Polygon, FMP, EODHD, SEC EDGAR.
 */

import { Router } from 'express';
import { getAllHealthStates } from '../lib/providerRouter';

const router = Router();

const PROVIDER_ENV: Record<string, string> = {
  polygon:       'POLYGON_API_KEY',
  fmp:           'FMP_API_KEY',
  eodhd:         'EODHD_API_KEY',
  finnhub:       'FINNHUB_API_KEY',
  alpha_vantage: 'ALPHA_VANTAGE_API_KEY',
  twelve_data:   'TWELVE_DATA_API_KEY',
  tavily:        'TAVILY_API_KEY',
  serper:        'SERPER_API_KEY',
  gemini:        'GEMINI_API_KEY',
  edgar:         'SEC_EDGAR_USER_AGENT',
};

// Provider routing map for frontend observability
const ROUTING_MAP = {
  quotes:       ['polygon', 'finnhub', 'twelve_data'],
  ohlcv:        ['eodhd', 'twelve_data', 'fmp', 'alpha_vantage'],
  fundamentals: ['fmp', 'finnhub', 'eodhd'],
  news:         ['polygon', 'finnhub', 'tavily', 'serper'],
  earnings:     ['fmp', 'finnhub', 'eodhd'],
  macro:        ['alpha_vantage'],
  research:     ['tavily', 'serper', 'gemini'],
  filings:      ['edgar'],
};

router.get('/health', (_req, res) => {
  const runtimeHealth = getAllHealthStates();
  const healthById = new Map(runtimeHealth.map((h) => [h.id, h]));

  const status = Object.entries(PROVIDER_ENV).map(([id, env]) => {
    const configured = Boolean(process.env[env]);
    const runtime = healthById.get(id);
    return {
      id,
      configured,
      lastSuccessAt: runtime?.lastSuccessAt,
      lastFailureAt: runtime?.lastFailureAt,
      lastFailureMessage: runtime?.lastFailureMessage,
      latencyMs: runtime?.latencyMs,
      consecutiveFailures: runtime?.consecutiveFailures ?? 0,
    };
  });

  res.json({ providers: status, routing: ROUTING_MAP });
});

export default router;
