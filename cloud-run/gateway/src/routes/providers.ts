/**
 * /v1/providers — provider health/config introspection (no secret values).
 */

import { Router } from 'express';

const router = Router();

const PROVIDER_ENV = {
  finnhub: 'FINNHUB_API_KEY',
  alpha_vantage: 'ALPHA_VANTAGE_API_KEY',
  twelve_data: 'TWELVE_DATA_API_KEY',
  tavily: 'TAVILY_API_KEY',
  serper: 'SERPER_API_KEY',
  gemini: 'GEMINI_API_KEY',
} as const;

router.get('/health', (_req, res) => {
  const status = Object.entries(PROVIDER_ENV).map(([id, env]) => ({
    id,
    configured: Boolean(process.env[env]),
  }));
  res.json({ providers: status });
});

export default router;
