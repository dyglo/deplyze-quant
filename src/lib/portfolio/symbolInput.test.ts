import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSymbolTokens, isValidSymbol } from './symbolInput';

describe('isValidSymbol', () => {
  it('accepts common tickers', () => {
    assert.equal(isValidSymbol('AAPL'), true);
    assert.equal(isValidSymbol('BTC-USD'), true);
    assert.equal(isValidSymbol('^GSPC'), true);
    assert.equal(isValidSymbol('brk.b'), true); // lowercased input is fine
  });
  it('rejects junk', () => {
    assert.equal(isValidSymbol('my index'), false); // space
    assert.equal(isValidSymbol(''), false);
    assert.equal(isValidSymbol('A,B'), false); // comma is a separator, not a symbol char
  });
});

describe('parseSymbolTokens', () => {
  it('parses a single token', () => {
    assert.deepEqual(parseSymbolTokens('AAPL'), ['AAPL']);
  });
  it('uppercases', () => {
    assert.deepEqual(parseSymbolTokens('msft'), ['MSFT']);
  });
  it('splits a comma list', () => {
    assert.deepEqual(parseSymbolTokens('AAPL,MSFT,NVDA'), ['AAPL', 'MSFT', 'NVDA']);
  });
  it('splits a pasted list with spaces after commas', () => {
    assert.deepEqual(parseSymbolTokens('AAPL, MSFT, NVDA'), ['AAPL', 'MSFT', 'NVDA']);
  });
  it('splits on whitespace too', () => {
    assert.deepEqual(parseSymbolTokens('AAPL MSFT\nNVDA'), ['AAPL', 'MSFT', 'NVDA']);
  });
  it('de-dupes preserving first-seen order', () => {
    assert.deepEqual(parseSymbolTokens('AAPL, MSFT, AAPL'), ['AAPL', 'MSFT']);
  });
  it('drops invalid tokens but keeps valid ones', () => {
    assert.deepEqual(parseSymbolTokens('AAPL, , 12$$, NVDA'), ['AAPL', 'NVDA']);
  });
  it('returns empty for empty / all-invalid input', () => {
    assert.deepEqual(parseSymbolTokens(''), []);
    assert.deepEqual(parseSymbolTokens('   '), []);
  });
  it('keeps punctuated symbols intact', () => {
    assert.deepEqual(parseSymbolTokens('BTC-USD, ^GSPC'), ['BTC-USD', '^GSPC']);
  });
});
