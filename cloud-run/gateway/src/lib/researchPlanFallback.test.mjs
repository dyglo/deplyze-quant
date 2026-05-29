/**
 * Unit tests for the deterministic ResearchPlan fallback builder.
 *
 * Run after a build (the test imports the compiled JS):
 *   npm run build && node --test src/lib/researchPlanFallback.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackPlan } from '../../dist/lib/researchPlanFallback.js';

test('extracts explicit uppercase tickers, ignoring stopwords', () => {
  const p = buildFallbackPlan('Compare AAPL vs MSFT and the market');
  assert.ok(p.assets.includes('AAPL'));
  assert.ok(p.assets.includes('MSFT'));
  assert.ok(!p.assets.includes('VS'));
  assert.ok(!p.assets.includes('THE'));
});

test('maps asset-class keywords to liquid proxies', () => {
  const p = buildFallbackPlan('how does gold behave vs the dollar during inflation');
  assert.ok(p.assets.includes('GLD'));
  assert.ok(p.assets.includes('UUP'));
  assert.ok(p.overlays.includes('inflation_regime'));
});

test('multi-asset queries get normalized + rolling_correlation and compare intent', () => {
  const p = buildFallbackPlan('compare gold and oil');
  assert.equal(p.intent, 'compare');
  assert.ok(p.comparisons.includes('normalized'));
  assert.ok(p.comparisons.includes('rolling_correlation'));
});

test('relationship language sets relationship intent', () => {
  const p = buildFallbackPlan('what is the correlation between SPY and TLT');
  assert.equal(p.intent, 'relationship');
  assert.ok(p.comparisons.includes('rolling_correlation'));
});

test('explicit year range sets timeframe start/end', () => {
  const p = buildFallbackPlan('SPY returns between 2000 and 2020');
  assert.equal(p.timeframe.start, '2000-01-01');
  assert.equal(p.timeframe.end, '2020-12-31');
});

test('decades language widens lookback to >= 20y', () => {
  const p = buildFallbackPlan('GLD over the past decades');
  assert.ok(p.timeframe.lookbackYears >= 20);
});

test('"last 7 years" parses the explicit lookback', () => {
  const p = buildFallbackPlan('QQQ over the last 7 years');
  assert.equal(p.timeframe.lookbackYears, 7);
});

test('single asset with no horizon defaults to 10y single_asset_history', () => {
  const p = buildFallbackPlan('show me AAPL history');
  assert.equal(p.intent, 'single_asset_history');
  assert.equal(p.timeframe.lookbackYears, 10);
});

test('always returns a schema-valid plan even for an empty/garbage query', () => {
  const p = buildFallbackPlan('???');
  assert.deepEqual(p.assets, []);
  assert.ok(Array.isArray(p.comparisons));
  assert.ok(Array.isArray(p.overlays));
  assert.ok(Array.isArray(p.regimes));
  assert.equal(p.regimes.length, 0); // never invents regimes
  assert.equal(typeof p.timeframe.lookbackYears, 'number');
});

test('benchmark is never auto-injected — only the named assets are used', () => {
  // A multi-asset query must NOT silently gain SPY as a benchmark.
  const goldOil = buildFallbackPlan('compare gold and oil');
  assert.equal(goldOil.benchmark, null);
  assert.deepEqual(goldOil.assets, ['GLD', 'USO']);
  assert.equal(buildFallbackPlan('AAPL history').benchmark, null);
  assert.equal(buildFallbackPlan('compare SPY and QQQ').benchmark, null);
});
