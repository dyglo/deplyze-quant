/**
 * Deplyze Quant — Quantitative Intelligence Engine.
 *
 * Public surface for all numerical, statistical, and intelligence primitives.
 * Existing callers `import { ... } from '../../lib/quant'` resolve here.
 *
 * Modules:
 *   primitives    — mean / stdev / percentile / distribution stats / rolling stats
 *   returns       — price → simple / log / cumulative returns, equity curves
 *   volatility    — realised / rolling / ATR / vol-regime / vol-clustering
 *   momentum      — slope / trend label / SMA cross / persistence / stability
 *   risk          — drawdown / VaR / Sharpe / Sortino / rolling beta
 *   correlation   — Pearson / rolling / matrices / dependency drift
 *   benchmark     — beta / alpha / tracking error / info ratio / capture
 *   portfolio     — variance / vol / risk contributions / Monte Carlo / frontier
 *   seasonality   — monthly / weekday tendencies / significance ranking
 *   artifacts     — structured quant event records + timeline projection
 *
 * Conventions:
 *   • Functions are pure and avoid lookahead.
 *   • Daily-bar default: periodsPerYear = 252. Override for other timeframes.
 *   • Insufficient-data inputs return null or empty arrays — never fake values.
 */

export * from './primitives';
export * from './returns';
export * from './volatility';
export * from './momentum';
export * from './risk';
export * from './correlation';
export * from './benchmark';
export * from './portfolio';
export * from './seasonality';
export * from './artifacts';
export * from './regimes';
export * from './anomalies';
export * from './analog';
export * from './crossAsset';
export * from './benchmarkIntel';
export * from './copilotContext';
export * from './forwardReturns';
export * from './extremes';
export * from './reversion';
export * from './scenario';
