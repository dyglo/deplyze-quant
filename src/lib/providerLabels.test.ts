import { test } from 'node:test';
import assert from 'node:assert/strict';
import { providerLabel } from './providerLabels';

test('maps canonical snake_case vendor ids to neutral labels', () => {
  assert.equal(providerLabel('finnhub'), 'Market Data');
  assert.equal(providerLabel('twelve_data'), 'Price & OHLCV');
  assert.equal(providerLabel('polygon'), 'Real-time Quotes');
});

test('lookup is case- and separator-insensitive (no vendor name leaks)', () => {
  assert.equal(providerLabel('Finnhub'), 'Market Data');
  assert.equal(providerLabel('Twelve Data'), 'Price & OHLCV');
  assert.equal(providerLabel('twelve-data'), 'Price & OHLCV');
  assert.equal(providerLabel('SEC EDGAR'), 'Public Filings');
  assert.equal(providerLabel('Alpha Vantage'), 'Macro Series');
});

test('passes unknown publisher names through, cleaned', () => {
  assert.equal(providerLabel('Reuters'), 'Reuters');
  assert.equal(providerLabel('market_watch'), 'market watch');
  assert.equal(providerLabel(''), '');
});
